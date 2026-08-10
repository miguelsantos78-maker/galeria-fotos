import "server-only";
import { randomUUID } from "node:crypto";
import type { Auth } from "googleapis";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type { GoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import type { UploadJobsRepository } from "@/server/repositories/upload-jobs-repository";
import type { PhotosRepository } from "@/server/repositories/photos-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import type { InitiateUploadInput } from "@/lib/validation/upload";
import { AppError } from "@/lib/api/response";
import { logger } from "@/lib/observability/logger";
import { getServerEnv } from "@/lib/env";
import { decryptSecret } from "@/lib/security/encryption";
import { createAuthenticatedClient } from "@/lib/google-drive/oauth-client";
import { createDriveStorageProvider } from "@/lib/google-drive/drive-provider";
import { isInvalidGrantError } from "@/lib/google-drive/errors";
import type { DriveStorageProvider } from "@/lib/google-drive/types";
import type { PreviewStorage } from "@/lib/media/preview-storage";
import { detectImageMimeType } from "@/lib/media/validate-image";
import { processImage } from "@/lib/media/process-image";
import { buildSafeFilename } from "@/lib/media/filenames";
import {
  buildPreviewPath,
  buildThumbnailPath,
} from "@/lib/media/storage-paths";
import type { Database } from "@/lib/db/database.types";

type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];
type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];

const UPLOAD_JOB_TTL_MINUTES = 30;

export interface UploadsDeps {
  albums: AlbumsRepository;
  sessions: AlbumSessionsRepository;
  connections: GoogleConnectionsRepository;
  uploadJobs: UploadJobsRepository;
  photos: PhotosRepository;
  auditLog: AuditLogRepository;
  previewStorage: PreviewStorage;
  /** Injetável para testes ("adaptador mock" — secção 19/22). */
  driveProviderFactory?: (
    authClient: Auth.OAuth2Client,
  ) => DriveStorageProvider;
}

/**
 * Extrai só o código de erro da API do Google (nunca o corpo completo,
 * que pode incluir cabeçalhos com informação sensível) — o suficiente
 * para diagnosticar falhas de envio ao Drive nos logs (secção 18) sem
 * arriscar registar tokens ou dados pessoais.
 */
function extractGoogleApiErrorCode(error: unknown): string | number | null {
  if (typeof error !== "object" || error === null) return null;
  const withCode = error as {
    code?: string | number;
    status?: string | number;
  };
  return withCode.code ?? withCode.status ?? null;
}

/**
 * Revalida autorização de envio a cada pedido (secção 5.2, passo 6) —
 * nunca confia apenas nas permissões capturadas na `album_session` no
 * momento da resolução do link, porque o álbum pode ter sido arquivado
 * ou o upload desativado entretanto.
 */
async function authorizeUpload(
  albumId: string,
  userId: string,
  deps: Pick<UploadsDeps, "albums" | "sessions">,
): Promise<{ album: AlbumRow }> {
  const session = await deps.sessions.findValidForUser(albumId, userId);
  if (!session || !session.permissions.includes("upload")) {
    throw new AppError(
      "ALBUM_UPLOAD_FORBIDDEN",
      "Não tem permissão para enviar fotografias para este álbum.",
      403,
    );
  }

  const album = await deps.albums.findById(albumId);
  if (!album || album.status !== "published") {
    throw new AppError(
      "ALBUM_UPLOAD_FORBIDDEN",
      "Não tem permissão para enviar fotografias para este álbum.",
      403,
    );
  }
  if (!album.upload_enabled) {
    throw new AppError(
      "ALBUM_UPLOAD_DISABLED",
      "O envio de fotografias está desativado para este álbum.",
      403,
    );
  }

  return { album };
}

export interface InitiateUploadResult {
  uploadId: string;
  expiresAt: string;
}

/** Cria a "sessão" de envio (secção 12) que `completeUpload` depois consome. */
export async function initiateUpload(
  input: InitiateUploadInput,
  ctx: { albumId: string; userId: string },
  deps: Pick<UploadsDeps, "albums" | "sessions" | "uploadJobs">,
): Promise<InitiateUploadResult> {
  await authorizeUpload(ctx.albumId, ctx.userId, deps);

  const env = getServerEnv();
  if (input.expectedSize > env.MAX_UPLOAD_BYTES) {
    throw new AppError(
      "UPLOAD_FILE_TOO_LARGE",
      "O ficheiro excede o limite permitido.",
      413,
    );
  }

  const expiresAt = new Date(
    Date.now() + UPLOAD_JOB_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  const job = await deps.uploadJobs.insert({
    album_id: ctx.albumId,
    user_id: ctx.userId,
    client_upload_id: input.clientUploadId,
    filename: input.filename,
    expected_size: input.expectedSize,
    expires_at: expiresAt,
  });

  return { uploadId: job.id, expiresAt: job.expires_at };
}

/**
 * Recebe os bytes do ficheiro, valida tudo de novo no servidor (secção
 * 5.2/15: nunca confiar no cliente), envia o original ao Drive, gera os
 * derivados e só então cria a linha em `photos`. Em caso de falha depois
 * do envio ao Drive, remove o que já tiver sido criado (secção 15:
 * "limpar ficheiros parciais e registos falhados") em vez de deixar um
 * ficheiro órfão no Drive ou na Storage.
 */
export async function completeUpload(
  params: { uploadId: string; fileBuffer: Buffer; declaredFilename: string },
  ctx: { albumId: string; userId: string },
  deps: UploadsDeps,
): Promise<PhotoRow> {
  const { album } = await authorizeUpload(ctx.albumId, ctx.userId, deps);

  const job = await deps.uploadJobs.findById(params.uploadId);
  if (!job || job.album_id !== ctx.albumId || job.user_id !== ctx.userId) {
    throw new AppError(
      "UPLOAD_JOB_NOT_FOUND",
      "Sessão de envio não encontrada.",
      404,
    );
  }
  if (job.status === "completed") {
    throw new AppError(
      "UPLOAD_JOB_ALREADY_COMPLETED",
      "Este envio já foi concluído.",
      409,
    );
  }
  if (job.status === "expired" || new Date(job.expires_at) <= new Date()) {
    await deps.uploadJobs.update(job.id, { status: "expired" });
    throw new AppError(
      "UPLOAD_JOB_EXPIRED",
      "Esta sessão de envio expirou. Tente enviar o ficheiro novamente.",
      410,
    );
  }

  const env = getServerEnv();
  if (params.fileBuffer.length === 0) {
    throw new AppError("UPLOAD_FILE_EMPTY", "O ficheiro está vazio.", 422);
  }
  if (params.fileBuffer.length > env.MAX_UPLOAD_BYTES) {
    throw new AppError(
      "UPLOAD_FILE_TOO_LARGE",
      "O ficheiro excede o limite permitido.",
      413,
    );
  }

  await deps.uploadJobs.update(job.id, {
    status: "uploading",
    received_size: params.fileBuffer.length,
  });

  const mimeType = await detectImageMimeType(params.fileBuffer);

  const connection = await deps.connections.findActiveByUser(album.owner_id);
  if (!connection || !connection.root_folder_id) {
    await deps.uploadJobs.update(job.id, { status: "failed" });
    throw new AppError(
      "GOOGLE_DRIVE_NOT_CONNECTED",
      "A ligação ao Google Drive deste álbum não está disponível.",
      503,
    );
  }

  const processed = await processImage(params.fileBuffer, {
    previewMaxEdge: env.PREVIEW_MAX_EDGE,
    thumbnailMaxEdge: env.THUMBNAIL_MAX_EDGE,
  });

  const duplicate = await deps.photos.findByAlbumAndSha256(
    ctx.albumId,
    processed.sha256,
  );
  if (duplicate) {
    await deps.uploadJobs.update(job.id, { status: "failed" });
    throw new AppError(
      "PHOTO_DUPLICATE",
      "Esta fotografia já foi enviada para este álbum.",
      409,
    );
  }

  const photoId = randomUUID();
  const safeFilename = buildSafeFilename(mimeType);

  const refreshToken = decryptSecret(
    connection.encrypted_refresh_token,
    connection.token_key_version,
  );
  const authClient = createAuthenticatedClient(refreshToken);
  const provider = (deps.driveProviderFactory ?? createDriveStorageProvider)(
    authClient,
  );

  let driveFile;
  try {
    driveFile = await provider.uploadOriginal({
      parentFolderId: album.drive_folder_id,
      filename: safeFilename,
      mimeType,
      body: params.fileBuffer,
      appProperties: {
        liveGalleryPhotoId: photoId,
        liveGalleryAlbumId: ctx.albumId,
      },
    });
  } catch (error) {
    logger.error({
      operation: "uploads.completeUpload.driveUpload",
      albumId: ctx.albumId,
      message: error instanceof Error ? error.message : String(error),
      driveErrorCode: extractGoogleApiErrorCode(error),
    });
    await deps.uploadJobs.update(job.id, { status: "failed" });

    // `invalid_grant` significa que o refresh token deixou de ser
    // aceite pelo Google: repetir o envio nunca pode funcionar, e todos
    // os envios de todos os convidados vão falhar até o administrador
    // voltar a ligar a conta. Por isso a ligação passa a `error` — é o
    // estado que o painel de administração mostra como "é necessário
    // reconectar" — e o convidado recebe uma mensagem que explica que o
    // problema não é dele nem se resolve a tentar outra vez.
    if (isInvalidGrantError(error)) {
      await deps.connections.update(connection.id, { status: "error" });
      await deps.auditLog.record({
        actor_user_id: null,
        album_id: ctx.albumId,
        action: "google_connection.invalid_grant",
        metadata: { connectionId: connection.id },
      });
      throw new AppError(
        "GOOGLE_CONNECTION_INVALID",
        "O envio está indisponível: a ligação ao Google Drive do organizador expirou. Avise o organizador — as fotografias não se perdem, basta voltar a tentar depois de ele reconectar.",
        503,
      );
    }

    throw new AppError(
      "UPLOAD_DRIVE_FAILED",
      "Não foi possível enviar a fotografia para o Google Drive.",
      502,
    );
  }

  const previewPath = buildPreviewPath(ctx.albumId, photoId);
  const thumbnailPath = buildThumbnailPath(ctx.albumId, photoId);

  try {
    await Promise.all([
      deps.previewStorage.upload(
        previewPath,
        processed.previewBuffer,
        "image/webp",
      ),
      deps.previewStorage.upload(
        thumbnailPath,
        processed.thumbnailBuffer,
        "image/webp",
      ),
    ]);
  } catch (error) {
    logger.error({
      operation: "uploads.completeUpload.previewStorageUpload",
      albumId: ctx.albumId,
      message: error instanceof Error ? error.message : String(error),
    });
    await provider.deleteFile({ fileId: driveFile.fileId }).catch(() => {});
    await deps.uploadJobs.update(job.id, { status: "failed" });
    throw new AppError(
      "UPLOAD_STORAGE_FAILED",
      "Não foi possível guardar a pré-visualização da fotografia.",
      502,
    );
  }

  const status: PhotoRow["status"] = album.moderation_enabled
    ? "pending_review"
    : "ready";

  let photo: PhotoRow;
  try {
    photo = await deps.photos.insert({
      id: photoId,
      album_id: ctx.albumId,
      uploaded_by: ctx.userId,
      drive_file_id: driveFile.fileId,
      drive_folder_id: album.drive_folder_id,
      preview_path: previewPath,
      original_filename: params.declaredFilename,
      safe_filename: safeFilename,
      mime_type: mimeType,
      file_size: params.fileBuffer.length,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
      blurhash: processed.blurhash,
      status,
    });
  } catch (error) {
    await provider.deleteFile({ fileId: driveFile.fileId }).catch(() => {});
    await deps.previewStorage
      .remove([previewPath, thumbnailPath])
      .catch(() => {});
    await deps.uploadJobs.update(job.id, { status: "failed" });
    throw error;
  }

  await deps.uploadJobs.update(job.id, {
    status: "completed",
    received_size: params.fileBuffer.length,
  });

  await deps.auditLog.record({
    actor_user_id: ctx.userId,
    album_id: ctx.albumId,
    photo_id: photo.id,
    action: "photo.uploaded",
    metadata: { originalFilename: params.declaredFilename, mimeType },
  });

  return photo;
}
