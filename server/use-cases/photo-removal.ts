import "server-only";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { PhotosRepository } from "@/server/repositories/photos-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import type { PreviewStorage } from "@/lib/media/preview-storage";
import { buildThumbnailPath } from "@/lib/media/storage-paths";
import type { Database } from "@/lib/db/database.types";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];
type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];

interface FinalizePhotoRemovalDeps {
  photos: Pick<PhotosRepository, "update">;
  albums: Pick<AlbumsRepository, "update">;
  auditLog: AuditLogRepository;
  previewStorage: PreviewStorage;
}

/**
 * Passos partilhados por qualquer forma de "apagar uma fotografia" —
 * eliminação manual pelo administrador (`moderation.ts`) e a
 * sincronização automática quando o original já desapareceu do Drive
 * (`drive-sync.ts`). Nunca chama `DriveStorageProvider.deleteFile` —
 * isso fica a cargo de quem chama, só quando fizer sentido (na
 * eliminação manual o Drive ainda tem o ficheiro; na sincronização o
 * Drive é a origem da remoção, já não há nada para apagar lá).
 */
export async function finalizePhotoRemoval(
  photo: PhotoRow,
  album: AlbumRow,
  action: string,
  actorUserId: string | null,
  deps: FinalizePhotoRemovalDeps,
): Promise<void> {
  const thumbnailPath = buildThumbnailPath(photo.album_id, photo.id);
  const pathsToRemove = photo.preview_path
    ? [photo.preview_path, thumbnailPath]
    : [thumbnailPath];
  await deps.previewStorage.remove(pathsToRemove).catch(() => {
    // Falha a limpar a Storage não bloqueia a eliminação — ver
    // moderation.ts para o mesmo raciocínio na eliminação manual.
  });

  await deps.photos.update(photo.id, {
    status: "deleted",
    deleted_at: new Date().toISOString(),
  });

  if (album.cover_photo_id === photo.id) {
    await deps.albums.update(album.id, { cover_photo_id: null });
  }

  await deps.auditLog.record({
    actor_user_id: actorUserId,
    album_id: album.id,
    photo_id: photo.id,
    action,
    metadata: { originalFilename: photo.original_filename },
  });
}
