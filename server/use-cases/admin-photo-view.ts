import "server-only";
import { buildThumbnailPath } from "@/lib/media/storage-paths";
import type { Database, PhotoStatus } from "@/lib/db/database.types";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];

/**
 * DTO da listagem de administração (secção 10.4): ao contrário da
 * `PublicPhoto` da galeria de convidados, pode incluir campos de
 * moderação — mas continua a nunca expor caminhos internos de
 * armazenamento diretamente, só URLs assinados de curta duração
 * (secção 5.4), tal como a listagem pública.
 */
export interface AdminPhotoView {
  id: string;
  albumId: string;
  status: PhotoStatus;
  isFeatured: boolean;
  isCover: boolean;
  moderationNote: string | null;
  originalFilename: string;
  width: number | null;
  height: number | null;
  fileSize: number;
  uploadedAt: string;
  capturedAt: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
}

export function toAdminPhotoView(
  photo: PhotoRow,
  coverPhotoId: string | null,
  signedUrls: Map<string, string>,
): AdminPhotoView {
  return {
    id: photo.id,
    albumId: photo.album_id,
    status: photo.status,
    isFeatured: photo.is_featured,
    isCover: photo.id === coverPhotoId,
    moderationNote: photo.moderation_note,
    originalFilename: photo.original_filename,
    width: photo.width,
    height: photo.height,
    fileSize: photo.file_size,
    uploadedAt: photo.uploaded_at,
    capturedAt: photo.captured_at,
    previewUrl: photo.preview_path
      ? (signedUrls.get(photo.preview_path) ?? null)
      : null,
    thumbnailUrl:
      signedUrls.get(buildThumbnailPath(photo.album_id, photo.id)) ?? null,
  };
}
