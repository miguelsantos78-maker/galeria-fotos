import "server-only";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import type {
  CreateAlbumInput,
  UpdateAlbumInput,
} from "@/lib/validation/album";
import { randomSlugSuffix, slugify } from "@/lib/validation/slug";
import { AppError } from "@/lib/api/response";
import type { Database } from "@/lib/db/database.types";

type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];

const UNIQUE_VIOLATION = "23505";
const MAX_SLUG_ATTEMPTS = 5;

interface AlbumsDeps {
  albums: AlbumsRepository;
  auditLog: AuditLogRepository;
}

export interface CreateAlbumParams extends CreateAlbumInput {
  googleConnectionId: string;
  driveFolderId: string;
}

export async function createAlbum(
  input: CreateAlbumParams,
  ctx: { ownerId: string },
  deps: AlbumsDeps,
): Promise<AlbumRow> {
  const baseSlug = slugify(input.title);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSlugSuffix()}`;

    try {
      const album = await deps.albums.insert({
        owner_id: ctx.ownerId,
        google_connection_id: input.googleConnectionId,
        drive_folder_id: input.driveFolderId,
        title: input.title,
        description: input.description ?? null,
        slug,
        visibility: input.visibility,
        upload_enabled: input.uploadEnabled,
        moderation_enabled: input.moderationEnabled,
        download_enabled: input.downloadEnabled,
        event_start_at: input.eventStartAt ?? null,
        event_end_at: input.eventEndAt ?? null,
      });

      await deps.auditLog.record({
        actor_user_id: ctx.ownerId,
        album_id: album.id,
        action: "album.created",
        metadata: { title: album.title },
      });

      return album;
    } catch (error) {
      if (isUniqueSlugViolation(error) && attempt < MAX_SLUG_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new AppError(
    "ALBUM_SLUG_CONFLICT",
    "Não foi possível gerar um identificador único para o álbum. Tente novamente.",
    409,
  );
}

export async function listAlbumsForOwner(
  ownerId: string,
  deps: Pick<AlbumsDeps, "albums">,
): Promise<AlbumRow[]> {
  return deps.albums.listByOwner(ownerId);
}

export async function getAlbumForOwner(
  albumId: string,
  ownerId: string,
  deps: Pick<AlbumsDeps, "albums">,
): Promise<AlbumRow> {
  const album = await deps.albums.findById(albumId);
  if (!album) {
    throw new AppError("ALBUM_NOT_FOUND", "Álbum não encontrado.", 404);
  }
  if (album.owner_id !== ownerId) {
    throw new AppError("FORBIDDEN", "Não tem acesso a este álbum.", 403);
  }
  return album;
}

export async function updateAlbum(
  albumId: string,
  ownerId: string,
  patch: UpdateAlbumInput,
  deps: AlbumsDeps,
): Promise<AlbumRow> {
  await getAlbumForOwner(albumId, ownerId, deps);

  const updated = await deps.albums.update(albumId, {
    title: patch.title,
    description: patch.description,
    visibility: patch.visibility,
    upload_enabled: patch.uploadEnabled,
    moderation_enabled: patch.moderationEnabled,
    download_enabled: patch.downloadEnabled,
    event_start_at: patch.eventStartAt,
    event_end_at: patch.eventEndAt,
    status: patch.status,
  });

  if (!updated) {
    throw new AppError("ALBUM_NOT_FOUND", "Álbum não encontrado.", 404);
  }

  await deps.auditLog.record({
    actor_user_id: ownerId,
    album_id: albumId,
    action: "album.updated",
    metadata: { fields: Object.keys(patch) },
  });

  return updated;
}

/** Idempotente: eliminar um álbum já eliminado não é um erro. */
export async function deleteAlbum(
  albumId: string,
  ownerId: string,
  deps: AlbumsDeps,
): Promise<void> {
  const album = await deps.albums.findById(albumId);
  if (!album) return;

  if (album.owner_id !== ownerId) {
    throw new AppError("FORBIDDEN", "Não tem acesso a este álbum.", 403);
  }

  await deps.albums.delete(albumId);

  await deps.auditLog.record({
    actor_user_id: ownerId,
    album_id: albumId,
    action: "album.deleted",
    metadata: { title: album.title },
  });
}

function isUniqueSlugViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION &&
    "message" in error &&
    typeof (error as { message?: string }).message === "string" &&
    (error as { message: string }).message.includes("slug")
  );
}
