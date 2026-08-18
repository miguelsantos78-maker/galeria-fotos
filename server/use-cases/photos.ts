import "server-only";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type {
  PhotoCursor,
  PhotosRepository,
} from "@/server/repositories/photos-repository";
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
  /**
   * Opaco para o cliente: transporta a posição exata onde esta página
   * terminou (`sort_order` + `id`), não só o `sort_order`. Ver
   * `PhotoCursor` — com fotografias enviadas no mesmo milissegundo, um
   * cursor só de `sort_order` fazia desaparecer as empatadas.
   */
  nextCursor: string | null;
  /**
   * Total de fotografias visíveis no álbum (com o mesmo filtro aplicado).
   * Só vem preenchido na primeira página — nas seguintes é `null`, para
   * não repetir uma contagem que não muda entre páginas.
   */
  totalCount: number | null;
}

interface ListPhotosDeps {
  sessions: AlbumSessionsRepository;
  // Só o que a listagem usa, e não o repositório inteiro: assim
  // `resolveAlbumSession` pode reutilizar isto sem ter de declarar uma
  // dependência de escrita em `photos` que nunca exerce.
  photos: Pick<
    PhotosRepository,
    "listVisibleForAlbum" | "countVisibleForAlbum"
  >;
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
  options: { cursor?: string; limit?: number; onlyMine?: boolean },
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

  return listPhotosForPermissions(
    albumId,
    userId,
    session.permissions,
    options,
    deps,
  );
}

/**
 * O mesmo, para quem já sabe as permissões e não precisa de as ir
 * buscar outra vez — o caso de `resolveAlbumSession`, que acabou de
 * criar (ou reaproveitar) a sessão e já as tem em mão. Sem isto,
 * incluir a primeira página na resposta da resolução custava uma
 * consulta redundante à `album_sessions`.
 */
export async function listPhotosForPermissions(
  albumId: string,
  userId: string,
  permissions: string[],
  options: { cursor?: string; limit?: number; onlyMine?: boolean },
  deps: Omit<ListPhotosDeps, "sessions">,
): Promise<ListPhotosResult> {
  const canModerate = permissions.includes("moderate");
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const uploadedBy = options.onlyMine ? userId : undefined;

  const rows = await deps.photos.listVisibleForAlbum({
    albumId,
    canModerate,
    limit: limit + 1,
    before: decodeCursor(options.cursor),
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
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ sortOrder: last.sort_order, id: last.id })
      : null;

  return { photos, nextCursor, totalCount };
}

/**
 * O cursor é opaco para o cliente, mas chega do cliente — por isso é
 * validado como qualquer outra entrada (secção 3: validar em todas as
 * fronteiras). Um cursor mal formado é tratado como "sem cursor",
 * devolvendo a primeira página, em vez de rebentar: o pior que
 * acontece é o convidado voltar ao início da galeria.
 *
 * O `id` acaba interpolado no filtro `or(...)` do PostgREST, cuja
 * sintaxe usa vírgulas, parênteses e pontos — por isso só passa se for
 * composto exclusivamente por letras, dígitos e hífens. Isso fecha a
 * porta a injetar sintaxe no filtro, que é o que aqui interessa
 * garantir. Deliberadamente mais largo do que "tem de ser um UUID": a
 * coluna é `uuid`, e é o Postgres que rejeita um id que o não seja —
 * esta validação não precisa de duplicar essa garantia, só de não
 * deixar passar caracteres que mudem o significado da consulta.
 */
const SAFE_ID_PATTERN = /^[A-Za-z0-9-]+$/;

function encodeCursor(cursor: PhotoCursor): string {
  return `${cursor.sortOrder}_${cursor.id}`;
}

function decodeCursor(raw: string | undefined): PhotoCursor | undefined {
  if (!raw) return undefined;

  const separator = raw.indexOf("_");
  if (separator === -1) return undefined;

  const sortOrder = Number(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (!Number.isSafeInteger(sortOrder) || !SAFE_ID_PATTERN.test(id)) {
    return undefined;
  }

  return { sortOrder, id };
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
