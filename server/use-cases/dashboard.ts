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
 * álbuns, fotografias, uploads recentes e erros. Busca os dados dos
 * álbuns do dono numa só vez e agrega em memória — simples e suficiente
 * para a escala esperada de um MVP (ver docs/decisions/0007); otimizar
 * com contagens dedicadas fica para quando o volume o justificar.
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

  const [photos, uploadJobs] = await Promise.all([
    deps.photos.listForAlbumIds(albumIds),
    deps.uploadJobs.listForAlbumIds(albumIds),
  ]);

  const recentUploads: DashboardRecentUpload[] = [...photos]
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, RECENT_UPLOADS_LIMIT)
    .map((photo) => ({
      photoId: photo.id,
      albumId: photo.album_id,
      albumTitle: albumTitleById.get(photo.album_id) ?? "—",
      filename: photo.original_filename,
      uploadedAt: photo.uploaded_at,
      status: photo.status,
    }));

  const failedUploadsCount = uploadJobs.filter(
    (job) => job.status === "failed",
  ).length;

  return {
    albumsCount: albums.length,
    photosCount: photos.length,
    recentUploads,
    failedUploadsCount,
  };
}
