import "server-only";
import type { Auth } from "googleapis";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { PhotosRepository } from "@/server/repositories/photos-repository";
import type { GoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import type { PreviewStorage } from "@/lib/media/preview-storage";
import type { DriveStorageProvider } from "@/lib/google-drive/types";
import { AppError } from "@/lib/api/response";
import { decryptSecret } from "@/lib/security/encryption";
import { createAuthenticatedClient } from "@/lib/google-drive/oauth-client";
import { createDriveStorageProvider } from "@/lib/google-drive/drive-provider";
import { buildThumbnailPath } from "@/lib/media/storage-paths";
import { toAdminPhotoView, type AdminPhotoView } from "./admin-photo-view";
import type {
  BatchModerateInput,
  UpdatePhotoInput,
} from "@/lib/validation/photo";
import type { Database, PhotoStatus } from "@/lib/db/database.types";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];
type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];

interface ModerationDeps {
  albums: AlbumsRepository;
  photos: PhotosRepository;
  connections: GoogleConnectionsRepository;
  auditLog: AuditLogRepository;
  previewStorage: PreviewStorage;
  /** Injetável para testes ("adaptador mock" — secção 19/22). */
  driveProviderFactory?: (authClient: Auth.OAuth2Client) => DriveStorageProvider;
}

/** Estados a partir dos quais "aprovar/republicar" (→ `ready`) é uma transição válida. */
const APPROVABLE_STATUSES: PhotoStatus[] = ["pending_review", "hidden"];

async function loadOwnedPhoto(
  photoId: string,
  ownerId: string,
  deps: Pick<ModerationDeps, "photos" | "albums">,
): Promise<{ photo: PhotoRow; album: AlbumRow }> {
  const photo = await deps.photos.findById(photoId);
  if (!photo || photo.deleted_at) {
    throw new AppError("PHOTO_NOT_FOUND", "Fotografia não encontrada.", 404);
  }

  const album = await deps.albums.findById(photo.album_id);
  if (!album || album.owner_id !== ownerId) {
    throw new AppError("FORBIDDEN", "Não tem acesso a esta fotografia.", 403);
  }

  return { photo, album };
}

export async function listPhotosForOwner(
  albumId: string,
  ownerId: string,
  options: { sortBy?: "uploaded_at" | "captured_at"; limit?: number },
  deps: Pick<ModerationDeps, "albums" | "photos"> & {
    createSignedUrls: (paths: string[]) => Promise<Map<string, string>>;
  },
): Promise<AdminPhotoView[]> {
  const album = await deps.albums.findById(albumId);
  if (!album || album.owner_id !== ownerId) {
    throw new AppError("FORBIDDEN", "Não tem acesso a este álbum.", 403);
  }

  const photos = await deps.photos.listForOwner({
    albumId,
    sortBy: options.sortBy ?? "uploaded_at",
    limit: options.limit ?? 200,
  });

  const paths = photos.flatMap((photo) =>
    photo.preview_path
      ? [photo.preview_path, buildThumbnailPath(albumId, photo.id)]
      : [],
  );
  const signedUrls = await deps.createSignedUrls(paths);

  return photos.map((photo) =>
    toAdminPhotoView(photo, album.cover_photo_id, signedUrls),
  );
}

/**
 * Aprovar (`pending_review`/`hidden` → `ready`), ocultar (`ready` →
 * `hidden`), destacar e definir como capa (secção 10.4). Cada transição
 * é validada explicitamente — nunca aceita um `status` arbitrário do
 * cliente.
 */
export async function updatePhotoModeration(
  photoId: string,
  ownerId: string,
  patch: UpdatePhotoInput,
  deps: Pick<ModerationDeps, "albums" | "photos" | "auditLog">,
): Promise<PhotoRow> {
  const { photo, album } = await loadOwnedPhoto(photoId, ownerId, deps);

  const updates: Partial<PhotoRow> = {};
  const auditActions: string[] = [];

  if (patch.status === "ready") {
    if (!APPROVABLE_STATUSES.includes(photo.status)) {
      throw new AppError(
        "PHOTO_INVALID_TRANSITION",
        `Não é possível aprovar esta fotografia a partir do estado "${photo.status}".`,
        409,
      );
    }
    updates.status = "ready";
    auditActions.push(
      photo.status === "pending_review" ? "photo.approved" : "photo.unhidden",
    );
  } else if (patch.status === "hidden") {
    if (photo.status !== "ready") {
      throw new AppError(
        "PHOTO_INVALID_TRANSITION",
        "Só é possível ocultar uma fotografia publicada.",
        409,
      );
    }
    updates.status = "hidden";
    auditActions.push("photo.hidden");
  }

  if (patch.moderationNote !== undefined) {
    updates.moderation_note = patch.moderationNote || null;
  }

  if (patch.isFeatured !== undefined && patch.isFeatured !== photo.is_featured) {
    updates.is_featured = patch.isFeatured;
    auditActions.push(patch.isFeatured ? "photo.featured" : "photo.unfeatured");
  }

  let updated = photo;
  if (Object.keys(updates).length > 0) {
    const result = await deps.photos.update(photoId, updates);
    if (!result) {
      throw new AppError("PHOTO_NOT_FOUND", "Fotografia não encontrada.", 404);
    }
    updated = result;
  }

  if (patch.setAsCover === true && album.cover_photo_id !== photoId) {
    await deps.albums.update(album.id, { cover_photo_id: photoId });
    auditActions.push("photo.set_as_cover");
  } else if (patch.setAsCover === false && album.cover_photo_id === photoId) {
    await deps.albums.update(album.id, { cover_photo_id: null });
    auditActions.push("photo.unset_as_cover");
  }

  for (const action of auditActions) {
    await deps.auditLog.record({
      actor_user_id: ownerId,
      album_id: album.id,
      photo_id: photoId,
      action,
      metadata: {},
    });
  }

  return updated;
}

/**
 * Eliminação completa (secção 15): apaga o original do Drive, os
 * derivados na Storage, e só depois marca a linha como eliminada — pela
 * mesma ordem inversa da criação (Drive/Storage primeiro, base de dados
 * por último), para nunca perder a referência a um ficheiro ainda por
 * apagar se algo falhar a meio. Idempotente: eliminar uma fotografia já
 * eliminada, ou inexistente, não é um erro.
 */
export async function deletePhoto(
  photoId: string,
  ownerId: string,
  deps: ModerationDeps,
): Promise<void> {
  const photo = await deps.photos.findById(photoId);
  if (!photo || photo.deleted_at) return;

  const album = await deps.albums.findById(photo.album_id);
  if (!album || album.owner_id !== ownerId) {
    throw new AppError("FORBIDDEN", "Não tem acesso a esta fotografia.", 403);
  }

  const connection = await deps.connections.findActiveByUser(album.owner_id);
  if (!connection) {
    throw new AppError(
      "GOOGLE_DRIVE_NOT_CONNECTED",
      "A ligação ao Google Drive deste álbum não está disponível.",
      503,
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
  // Idempotente do lado do adaptador: um 404 do Drive é tratado como sucesso.
  await provider.deleteFile({ fileId: photo.drive_file_id });

  const thumbnailPath = buildThumbnailPath(photo.album_id, photo.id);
  const pathsToRemove = photo.preview_path
    ? [photo.preview_path, thumbnailPath]
    : [thumbnailPath];
  await deps.previewStorage.remove(pathsToRemove).catch(() => {
    // Falha a limpar a Storage não bloqueia a eliminação: o original já
    // saiu do Drive, que é o que importa para custo/privacidade; um
    // preview órfão sem original associado é um resíduo menor.
  });

  await deps.photos.update(photoId, {
    status: "deleted",
    deleted_at: new Date().toISOString(),
  });

  if (album.cover_photo_id === photoId) {
    await deps.albums.update(album.id, { cover_photo_id: null });
  }

  await deps.auditLog.record({
    actor_user_id: ownerId,
    album_id: album.id,
    photo_id: photoId,
    action: "photo.deleted",
    metadata: { originalFilename: photo.original_filename },
  });
}

export interface BatchModerationResult {
  succeeded: string[];
  failed: { photoId: string; error: string }[];
}

/**
 * Ações em lote (secção 10.4). Corre sequencialmente, não em paralelo —
 * evita rajadas de pedidos ao Drive (secção 16) — e cada fotografia
 * falha de forma independente, sem interromper as restantes.
 */
export async function batchModeratePhotos(
  albumId: string,
  ownerId: string,
  input: BatchModerateInput,
  deps: ModerationDeps,
): Promise<BatchModerationResult> {
  const album = await deps.albums.findById(albumId);
  if (!album || album.owner_id !== ownerId) {
    throw new AppError("FORBIDDEN", "Não tem acesso a este álbum.", 403);
  }

  const succeeded: string[] = [];
  const failed: { photoId: string; error: string }[] = [];

  for (const photoId of input.photoIds) {
    try {
      const photo = await deps.photos.findById(photoId);
      if (!photo || photo.album_id !== albumId) {
        throw new AppError(
          "PHOTO_NOT_FOUND",
          "Fotografia não encontrada.",
          404,
        );
      }

      if (input.action === "delete") {
        await deletePhoto(photoId, ownerId, deps);
      } else {
        await updatePhotoModeration(
          photoId,
          ownerId,
          { status: input.action === "approve" ? "ready" : "hidden" },
          deps,
        );
      }
      succeeded.push(photoId);
    } catch (error) {
      failed.push({
        photoId,
        error: error instanceof AppError ? error.message : "Erro inesperado.",
      });
    }
  }

  return { succeeded, failed };
}
