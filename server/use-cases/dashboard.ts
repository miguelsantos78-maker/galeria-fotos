import "server-only";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { PhotosRepository } from "@/server/repositories/photos-repository";
import type { UploadJobsRepository } from "@/server/repositories/upload-jobs-repository";
import type { PhotoStatus } from "@/lib/db/database.types";

const RECENT_UPLOADS_LIMIT = 5;

export interface DashboardRecentUpload {
  photoId: string;
  albumId: string;
  albumTitle: string;
  filename: string;
  uploadedAt: string;
  status: PhotoStatus;
}

export interface DashboardStats {
  albumsCount: number;
  photosCount: number;
  recentUploads: DashboardRecentUpload[];
  failedUploadsCount: number;
}

interface DashboardDeps {
  albums: AlbumsRepository;
  photos: PhotosRepository;
  uploadJobs: UploadJobsRepository;
}

/**
 * Estatísticas do painel de administração (secção 10.4/18): número de
 * álbuns, fotografias, uploads recentes e erros.
 *
 * Cada número vem de uma consulta que devolve exatamente o que é
 * preciso — contagens no Postgres (`head: true`, nenhuma linha
 * atravessa a rede) e só as 5 fotografias mais recentes. A versão
 * anterior carregava todas as fotografias e todos os envios do dono
 * para memória só para os contar e ordenar em JavaScript, o que num
 * álbum de milhares de fotografias significava transferir milhares de
 * linhas completas para produzir dois números e uma lista de cinco.
 */
export async function getDashboardStats(
  ownerId: string,
  deps: DashboardDeps,
): Promise<DashboardStats> {
  const albums = await deps.albums.listByOwner(ownerId);
  const albumIds = albums.map((album) => album.id);
  const albumTitleById = new Map(
    albums.map((album) => [album.id, album.title]),
  );

  const [photosCount, recentPhotos, failedUploadsCount] = await Promise.all([
    deps.photos.countForAlbumIds(albumIds),
    deps.photos.listRecentForAlbumIds(albumIds, RECENT_UPLOADS_LIMIT),
    deps.uploadJobs.countFailedForAlbumIds(albumIds),
  ]);

  const recentUploads: DashboardRecentUpload[] = recentPhotos.map((photo) => ({
    photoId: photo.id,
    albumId: photo.album_id,
    albumTitle: albumTitleById.get(photo.album_id) ?? "—",
    filename: photo.original_filename,
    uploadedAt: photo.uploaded_at,
    status: photo.status,
  }));

  return {
    albumsCount: albums.length,
    photosCount,
    recentUploads,
    failedUploadsCount,
  };
}
