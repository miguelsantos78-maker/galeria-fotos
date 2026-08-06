import "server-only";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type { PhotosRepository } from "@/server/repositories/photos-repository";
import { buildThumbnailPath } from "@/lib/media/storage-paths";
import { AppError } from "@/lib/api/response";
import type { Database, PhotoStatus } from "@/lib/db/database.types";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export interface PublicPhoto {
  id: string;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  status: PhotoStatus;
  isFeatured: boolean;
  uploadedAt: string;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  /**
   * Se esta fotografia foi enviada por quem está a ver. Deliberadamente
   * um booleano calculado no servidor, e não o `uploaded_by` em bruto:
   * a galeria pública nunca deve revelar quem enviou o quê (secção 15,
   * privacidade), só permitir a cada pessoa reconhecer as suas.
   */
  isMine: boolean;
}

export interface ListPhotosResult {
  photos: PublicPhoto[];
  nextCursor: number | null;
  /**
   * Total de fotografias visíveis no álbum (com o mesmo filtro aplicado).
   * Só vem preenchido na primeira página — nas seguintes é `null`, para
   * não repetir uma contagem que não muda entre páginas.
   */
  totalCount: number | null;
}

interface ListPhotosDeps {
  sessions: AlbumSessionsRepository;
  photos: PhotosRepository;
  createSignedUrls: (paths: string[]) => Promise<Map<string, string>>;
}

/**
 * Grelha simples de fotografias visíveis (usada para provar, no fim da
 * Fase 4, que os originais chegam ao Drive e ficam visíveis através do
 * preview). Masonry, virtualização e subscrição em tempo real ficam
 * para a Fase 5 (secção 22) — aqui é só paginação por cursor (secção
 * 14/16) com URLs assinados de curta duração.
 */
export async function listPhotosForViewer(
  albumId: string,
  userId: string,
  options: { cursor?: number; limit?: number; onlyMine?: boolean },
  deps: ListPhotosDeps,
): Promise<ListPhotosResult> {
  const session = await deps.sessions.findValidForUser(albumId, userId);
  if (!session) {
    throw new AppError(
      "ALBUM_SESSION_INVALID",
      "Sessão de álbum inválida ou expirada.",
      401,
    );
  }

  const canModerate = session.permissions.includes("moderate");
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const uploadedBy = options.onlyMine ? userId : undefined;

  const rows = await deps.photos.listVisibleForAlbum({
    albumId,
    canModerate,
    limit: limit + 1,
    beforeSortOrder: options.cursor,
    uploadedBy,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const paths = pageRows.flatMap((row) =>
    row.preview_path
      ? [row.preview_path, buildThumbnailPath(albumId, row.id)]
      : [],
  );

  // A contagem só na primeira página: não muda entre páginas e é uma
  // consulta extra ao Postgres.
  const isFirstPage = options.cursor === undefined;
  const [signedUrls, totalCount] = await Promise.all([
    deps.createSignedUrls(paths),
    isFirstPage
      ? deps.photos.countVisibleForAlbum({ albumId, canModerate, uploadedBy })
      : Promise.resolve(null),
  ]);

  const photos = pageRows.map((row) =>
    toPublicPhoto(row, albumId, signedUrls, userId),
  );
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].sort_order : null;

  return { photos, nextCursor, totalCount };
}

function toPublicPhoto(
  row: PhotoRow,
  albumId: string,
  signedUrls: Map<string, string>,
  viewerId: string,
): PublicPhoto {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    blurhash: row.blurhash,
    status: row.status,
    isFeatured: row.is_featured,
    uploadedAt: row.uploaded_at,
    previewUrl: row.preview_path
      ? (signedUrls.get(row.preview_path) ?? null)
      : null,
    thumbnailUrl: signedUrls.get(buildThumbnailPath(albumId, row.id)) ?? null,
    isMine: row.uploaded_by === viewerId,
  };
}
