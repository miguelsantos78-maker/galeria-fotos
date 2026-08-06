import "server-only";
import type { GoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import {
  buildAuthorizationRequest,
  createAuthenticatedClient,
  exchangeAuthorizationCode,
  revokeRefreshToken,
  type AuthorizationRequest,
} from "@/lib/google-drive/oauth-client";
import { createDriveStorageProvider } from "@/lib/google-drive/drive-provider";
import type { DriveStorageProvider } from "@/lib/google-drive/types";
import { AppError } from "@/lib/api/response";
import type { Database } from "@/lib/db/database.types";
import type { Auth } from "googleapis";

type GoogleConnectionRow =
  Database["public"]["Tables"]["google_connections"]["Row"];

interface ConnectionDeps {
  connections: GoogleConnectionsRepository;
  auditLog: AuditLogRepository;
  /** Injetável para testes ("adaptador mock" — secção 19/22). */
  driveProviderFactory?: (
    authClient: Auth.OAuth2Client,
  ) => DriveStorageProvider;
}

export async function initiateGoogleDriveConnection(options?: {
  forceConsent?: boolean;
}): Promise<AuthorizationRequest> {
  return buildAuthorizationRequest(options);
}

export async function getConnectionStatusForOwner(
  ownerId: string,
  deps: Pick<ConnectionDeps, "connections">,
): Promise<GoogleConnectionRow | null> {
  return deps.connections.findLatestByUser(ownerId);
}

/**
 * Troca o código de autorização por tokens, confirma a ligação junto do
 * Drive, encripta e guarda o refresh token, e garante a pasta raiz da
 * aplicação. Reconectar atualiza a linha existente do utilizador em vez
 * de acumular linhas novas.
 */
export async function completeGoogleDriveConnection(
  params: { code: string; codeVerifier: string },
  ctx: { ownerId: string },
  deps: ConnectionDeps,
): Promise<GoogleConnectionRow> {
  const { refreshToken } = await exchangeAuthorizationCode(
    params.code,
    params.codeVerifier,
  );
  const authClient = createAuthenticatedClient(refreshToken);
  const provider = (deps.driveProviderFactory ?? createDriveStorageProvider)(
    authClient,
  );

  const health = await provider.verifyConnection();
  if (!health.ok) {
    throw new AppError(
      "GOOGLE_DRIVE_VERIFICATION_FAILED",
      "Não foi possível confirmar a ligação ao Google Drive.",
      502,
    );
  }

  const { ciphertext, keyVersion } = encryptSecret(refreshToken);
  const existing = await deps.connections.findLatestByUser(ctx.ownerId);

  const patch = {
    google_account_email: health.accountEmail ?? "desconhecido",
    encrypted_refresh_token: ciphertext,
    token_key_version: keyVersion,
    status: "active" as const,
    last_verified_at: new Date().toISOString(),
  };

  const baseRow = existing
    ? await deps.connections.update(existing.id, patch)
    : await deps.connections.insert({ user_id: ctx.ownerId, ...patch });

  if (!baseRow) {
    throw new AppError(
      "GOOGLE_CONNECTION_SAVE_FAILED",
      "Não foi possível guardar a ligação.",
      500,
    );
  }

  const { folderId } = await provider.ensureRootFolder({
    connectionId: baseRow.id,
  });
  const finalRow = await deps.connections.update(baseRow.id, {
    root_folder_id: folderId,
  });

  await deps.auditLog.record({
    actor_user_id: ctx.ownerId,
    action: existing
      ? "google_connection.reconnected"
      : "google_connection.connected",
    metadata: { connectionId: baseRow.id, accountEmail: health.accountEmail },
  });

  return finalRow ?? baseRow;
}

export async function disconnectGoogleDriveConnection(
  connectionId: string,
  ownerId: string,
  deps: ConnectionDeps,
): Promise<void> {
  const connection = await deps.connections.findById(connectionId);
  if (!connection || connection.user_id !== ownerId) {
    throw new AppError(
      "GOOGLE_CONNECTION_NOT_FOUND",
      "Ligação não encontrada.",
      404,
    );
  }

  const refreshToken = decryptSecret(
    connection.encrypted_refresh_token,
    connection.token_key_version,
  );
  await revokeRefreshToken(refreshToken);

  await deps.connections.update(connectionId, { status: "revoked" });

  await deps.auditLog.record({
    actor_user_id: ownerId,
    action: "google_connection.disconnected",
    metadata: { connectionId },
  });
}

/** Verificação de saúde (secção 10.4/12): confirma o token junto do Google. */
export async function verifyGoogleDriveConnection(
  connectionId: string,
  ownerId: string,
  deps: ConnectionDeps,
): Promise<GoogleConnectionRow> {
  const connection = await deps.connections.findById(connectionId);
  if (!connection || connection.user_id !== ownerId) {
    throw new AppError(
      "GOOGLE_CONNECTION_NOT_FOUND",
      "Ligação não encontrada.",
      404,
    );
  }

  const refreshToken = decryptSecret(
    connection.encrypted_refresh_token,
    connection.token_key_version,
  );
  const authClient = createAuthenticatedClient(refreshToken);
  const provider = (deps.driveProviderFactory ?? createDriveStorageProvider)(
    authClient,
  );
  const health = await provider.verifyConnection();

  const updated = await deps.connections.update(connectionId, {
    status: health.ok ? "active" : "error",
    last_verified_at: new Date().toISOString(),
  });

  return updated ?? connection;
}
