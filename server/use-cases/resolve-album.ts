import "server-only";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { ShareLinksRepository } from "@/server/repositories/share-links-repository";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type { PhotosRepository } from "@/server/repositories/photos-repository";
import type { ResolveAlbumInput } from "@/lib/validation/share-link";
import { hashShareToken } from "@/lib/security/tokens";
import { verifyPin } from "@/lib/security/pin";
import { AppError } from "@/lib/api/response";
import { getServerEnv } from "@/lib/env";
import type {
  AlbumSessionPermission,
  AlbumVisibility,
  Database,
} from "@/lib/db/database.types";

type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];

const SESSION_TTL_HOURS = 24;

export interface PublicAlbumView {
  id: string;
  title: string;
  description: string | null;
  visibility: AlbumVisibility;
  uploadEnabled: boolean;
  downloadEnabled: boolean;
  eventStartAt: string | null;
  eventEndAt: string | null;
  /**
   * URL assinado de curta duração (secção 5.4) da fotografia de capa
   * (`albums.cover_photo_id`, já definida pelo administrador em
   * "Definir capa" — secção 10.4), ou `null` quando o álbum não tem
   * capa definida, a fotografia foi eliminada, ou ainda não tem
   * preview gerado.
   */
  coverPhotoUrl: string | null;
}

export interface ResolveAlbumResult {
  album: PublicAlbumView;
  permissions: AlbumSessionPermission[];
  /**
   * `true` só quando quem abriu o link está autenticado (não anónimo)
   * como o próprio dono do álbum — nunca depende das `permissions` do
   * link de partilha, que também podem ser vistas por um convidado.
   * Controla apenas a exibição de ações de administrador na galeria
   * pública (ex.: eliminar fotografia); a autorização real continua a
   * ser validada de novo no servidor em cada pedido (`requireAdminApi`
   * + verificação de `owner_id` em `deletePhoto`).
   */
  isOwner: boolean;
}

interface ResolveDeps {
  albums: AlbumsRepository;
  shareLinks: ShareLinksRepository;
  sessions: AlbumSessionsRepository;
  photos: Pick<PhotosRepository, "findById">;
  createSignedUrls: (paths: string[]) => Promise<Map<string, string>>;
}

/**
 * Troca um token de partilha (+ PIN opcional) por uma album_session
 * (secção 5.2/6.3). Usa sempre a mesma mensagem/código genérico
 * "ALBUM_LINK_INVALID" para token inexistente, revogado ou expirado, e
 * para álbum não publicado — nunca revela qual destes casos se aplica
 * (secção 15).
 */
export async function resolveAlbumSession(
  input: ResolveAlbumInput,
  ctx: { userId: string; isAnonymous: boolean },
  deps: ResolveDeps,
): Promise<ResolveAlbumResult> {
  const tokenHash = hashShareToken(
    input.token,
    getServerEnv().APP_TOKEN_PEPPER,
  );
  const link = await deps.shareLinks.findByTokenHash(tokenHash);

  if (!link || !isLinkCurrentlyValid(link)) {
    throw new AppError(
      "ALBUM_LINK_INVALID",
      "Este link não é válido ou já não está disponível.",
      404,
    );
  }

  if (link.pin_hash) {
    if (!input.pin) {
      throw new AppError(
        "ALBUM_PIN_REQUIRED",
        "Este álbum está protegido por PIN.",
        401,
      );
    }
    if (!verifyPin(input.pin, link.pin_hash)) {
      throw new AppError("ALBUM_PIN_INVALID", "PIN incorreto.", 401);
    }
  }

  const album = await deps.albums.findById(link.album_id);
  if (!album || album.status !== "published") {
    throw new AppError(
      "ALBUM_LINK_INVALID",
      "Este link não é válido ou já não está disponível.",
      404,
    );
  }

  const permissions = album.upload_enabled
    ? link.permissions
    : link.permissions.filter((permission) => permission !== "upload");

  const isOwner = !ctx.isAnonymous && ctx.userId === album.owner_id;
  const coverPhotoUrl = await resolveCoverPhotoUrl(album, deps);

  const sessionExpiresAt = new Date(
    Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000,
  );
  const linkExpiresAt = link.expires_at ? new Date(link.expires_at) : null;
  const expiresAt =
    linkExpiresAt && linkExpiresAt < sessionExpiresAt
      ? linkExpiresAt.toISOString()
      : sessionExpiresAt.toISOString();

  await deps.sessions.insert({
    album_id: album.id,
    user_id: ctx.userId,
    share_link_id: link.id,
    permissions,
    expires_at: expiresAt,
  });

  return {
    album: toPublicAlbumView(album, coverPhotoUrl),
    permissions,
    isOwner,
  };
}

function isLinkCurrentlyValid(link: {
  revoked_at: string | null;
  expires_at: string | null;
}): boolean {
  if (link.revoked_at) return false;
  if (link.expires_at && new Date(link.expires_at) <= new Date()) return false;
  return true;
}

async function resolveCoverPhotoUrl(
  album: AlbumRow,
  deps: Pick<ResolveDeps, "photos" | "createSignedUrls">,
): Promise<string | null> {
  if (!album.cover_photo_id) return null;

  const photo = await deps.photos.findById(album.cover_photo_id);
  if (!photo || photo.deleted_at || !photo.preview_path) return null;

  const signedUrls = await deps.createSignedUrls([photo.preview_path]);
  return signedUrls.get(photo.preview_path) ?? null;
}

function toPublicAlbumView(
  album: AlbumRow,
  coverPhotoUrl: string | null,
): PublicAlbumView {
  return {
    id: album.id,
    title: album.title,
    description: album.description,
    visibility: album.visibility,
    uploadEnabled: album.upload_enabled,
    downloadEnabled: album.download_enabled,
    eventStartAt: album.event_start_at,
    eventEndAt: album.event_end_at,
    coverPhotoUrl,
  };
}
