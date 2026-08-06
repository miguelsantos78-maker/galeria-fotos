import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { encryptSecret } from "@/lib/security/encryption";
import {
  createFakeAuditLogRepository,
  createFakeGoogleConnectionsRepository,
  makeGoogleConnectionRow,
} from "../fakes/repositories";
import { createFakeDriveStorageProvider } from "../fakes/drive-provider";
import { validServerEnv } from "../fakes/env";

/**
 * `exchangeAuthorizationCode` chama a rede do Google (`client.getToken()`),
 * o que a secção 19 proíbe na suíte normal de CI — mockamos só esta função
 * para poder testar a orquestração de `completeGoogleDriveConnection`
 * (upsert da linha, encriptação do token, criação da pasta raiz).
 */
vi.mock("@/lib/google-drive/oauth-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/google-drive/oauth-client")>();
  return {
    ...actual,
    exchangeAuthorizationCode: vi.fn(async () => ({
      refreshToken: "refresh-token-from-google",
      accessToken: "access-token-from-google",
    })),
  };
});

const {
  completeGoogleDriveConnection,
  disconnectGoogleDriveConnection,
  verifyGoogleDriveConnection,
} = await import("@/server/use-cases/google-drive-connection");

const originalEnv = { ...process.env };

describe("google-drive-connection use-cases", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    process.env = { ...originalEnv, ...validServerEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  describe("completeGoogleDriveConnection", () => {
    it("cria uma ligação nova, encripta o token e garante a pasta raiz", async () => {
      const connections = createFakeGoogleConnectionsRepository();
      const auditLog = createFakeAuditLogRepository();
      const driveProvider = createFakeDriveStorageProvider();

      const result = await completeGoogleDriveConnection(
        { code: "auth-code", codeVerifier: "verifier" },
        { ownerId: "owner-1" },
        {
          connections,
          auditLog,
          driveProviderFactory: () => driveProvider,
        },
      );

      expect(result.status).toBe("active");
      expect(result.google_account_email).toBe("owner@example.com");
      expect(result.encrypted_refresh_token).not.toContain(
        "refresh-token-from-google",
      );
      expect(result.root_folder_id).toBeTruthy();
      expect(driveProvider.state.ensureRootFolderCalls).toHaveLength(1);
      expect(connections.rows).toHaveLength(1);
      expect(auditLog.entries[0].action).toBe("google_connection.connected");
    });

    it("atualiza (não duplica) a ligação existente ao reconectar", async () => {
      const existing = makeGoogleConnectionRow({
        user_id: "owner-1",
        status: "revoked",
      });
      const connections = createFakeGoogleConnectionsRepository([existing]);
      const auditLog = createFakeAuditLogRepository();
      const driveProvider = createFakeDriveStorageProvider();

      const result = await completeGoogleDriveConnection(
        { code: "auth-code", codeVerifier: "verifier" },
        { ownerId: "owner-1" },
        {
          connections,
          auditLog,
          driveProviderFactory: () => driveProvider,
        },
      );

      expect(result.id).toBe(existing.id);
      expect(connections.rows).toHaveLength(1);
      expect(result.status).toBe("active");
      expect(auditLog.entries[0].action).toBe("google_connection.reconnected");
    });

    it("lança erro quando a verificação junto do Drive falha", async () => {
      const connections = createFakeGoogleConnectionsRepository();
      const auditLog = createFakeAuditLogRepository();
      const driveProvider = createFakeDriveStorageProvider({
        health: { ok: false, accountEmail: null, error: "denied" },
      });

      await expect(
        completeGoogleDriveConnection(
          { code: "auth-code", codeVerifier: "verifier" },
          { ownerId: "owner-1" },
          { connections, auditLog, driveProviderFactory: () => driveProvider },
        ),
      ).rejects.toMatchObject({ code: "GOOGLE_DRIVE_VERIFICATION_FAILED" });

      expect(connections.rows).toHaveLength(0);
    });
  });

  describe("disconnectGoogleDriveConnection", () => {
    it("marca a ligação como revogada e regista auditoria", async () => {
      const connection = makeGoogleConnectionRow({
        user_id: "owner-1",
        encrypted_refresh_token: encryptSecret("refresh-token").ciphertext,
        token_key_version: encryptSecret("refresh-token").keyVersion,
      });
      const connections = createFakeGoogleConnectionsRepository([connection]);
      const auditLog = createFakeAuditLogRepository();

      await disconnectGoogleDriveConnection(connection.id, "owner-1", {
        connections,
        auditLog,
      });

      const updated = await connections.findById(connection.id);
      expect(updated?.status).toBe("revoked");
      expect(auditLog.entries[0].action).toBe("google_connection.disconnected");
    });

    it("lança NOT_FOUND se a ligação não pertence ao utilizador", async () => {
      const connection = makeGoogleConnectionRow({ user_id: "owner-1" });
      const connections = createFakeGoogleConnectionsRepository([connection]);
      const auditLog = createFakeAuditLogRepository();

      await expect(
        disconnectGoogleDriveConnection(connection.id, "owner-2", {
          connections,
          auditLog,
        }),
      ).rejects.toMatchObject({ code: "GOOGLE_CONNECTION_NOT_FOUND" });
    });
  });

  describe("verifyGoogleDriveConnection", () => {
    it("marca como ativa quando a verificação junto do Drive é bem-sucedida", async () => {
      const { ciphertext, keyVersion } = encryptSecret("refresh-token");
      const connection = makeGoogleConnectionRow({
        user_id: "owner-1",
        status: "error",
        encrypted_refresh_token: ciphertext,
        token_key_version: keyVersion,
      });
      const connections = createFakeGoogleConnectionsRepository([connection]);
      const auditLog = createFakeAuditLogRepository();
      const driveProviderFactory = () =>
        createFakeDriveStorageProvider({
          health: { ok: true, accountEmail: "owner@example.com" },
        });

      const updated = await verifyGoogleDriveConnection(
        connection.id,
        "owner-1",
        { connections, auditLog, driveProviderFactory },
      );

      expect(updated.status).toBe("active");
    });

    it("marca como erro quando a verificação junto do Drive falha", async () => {
      const { ciphertext, keyVersion } = encryptSecret("refresh-token");
      const connection = makeGoogleConnectionRow({
        user_id: "owner-1",
        status: "active",
        encrypted_refresh_token: ciphertext,
        token_key_version: keyVersion,
      });
      const connections = createFakeGoogleConnectionsRepository([connection]);
      const auditLog = createFakeAuditLogRepository();
      const driveProviderFactory = () =>
        createFakeDriveStorageProvider({
          health: { ok: false, accountEmail: null, error: "revoked" },
        });

      const updated = await verifyGoogleDriveConnection(
        connection.id,
        "owner-1",
        { connections, auditLog, driveProviderFactory },
      );

      expect(updated.status).toBe("error");
    });
  });
});
