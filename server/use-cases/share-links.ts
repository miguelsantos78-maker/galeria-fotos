import "server-only";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { ShareLinksRepository } from "@/server/repositories/share-links-repository";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import type { CreateShareLinkInput } from "@/lib/validation/share-link";
import { generateShareToken, hashShareToken } from "@/lib/security/tokens";
import { hashPin } from "@/lib/security/pin";
import { AppError } from "@/lib/api/response";
import { getServerEnv } from "@/lib/env";
import { getAlbumForOwner } from "@/server/use-cases/albums";
import type { Database } from "@/lib/db/database.types";

type ShareLinkRow = Database["public"]["Tables"]["album_share_links"]["Row"];
export type PublicShareLink = Omit<ShareLinkRow, "token_hash" | "pin_hash"> & {
  hasPin: boolean;
};

/** Nunca devolver token_hash/pin_hash ao cliente, mesmo ao dono do álbum. */
export function toPublicShareLink(link: ShareLinkRow): PublicShareLink {
  return {
    id: link.id,
    album_id: link.album_id,
    permissions: link.permissions,
    expires_at: link.expires_at,
    revoked_at: link.revoked_at,
    created_by: link.created_by,
    created_at: link.created_at,
    hasPin: link.pin_hash !== null,
  };
}

interface ShareLinksDeps {
  albums: AlbumsRepository;
  shareLinks: ShareLinksRepository;
  auditLog: AuditLogRepository;
}

/**
 * Cria um link de partilha. Devolve o token em texto simples (só existe
 * neste momento — nunca é possível voltar a obtê-lo depois, só o hash
 * fica guardado).
 */
export async function createShareLink(
  albumId: string,
  ownerId: string,
  input: CreateShareLinkInput,
  deps: ShareLinksDeps,
): Promise<{ link: ShareLinkRow; token: string }> {
  await getAlbumForOwner(albumId, ownerId, deps);

  const token = generateShareToken();
  const tokenHash = hashShareToken(token, getServerEnv().APP_TOKEN_PEPPER);

  const link = await deps.shareLinks.insert({
    album_id: albumId,
    token_hash: tokenHash,
    pin_hash: input.pin ? hashPin(input.pin) : null,
    permissions: input.permissions,
    expires_at: input.expiresAt ?? null,
    created_by: ownerId,
  });

  await deps.auditLog.record({
    actor_user_id: ownerId,
    album_id: albumId,
    action: "share_link.created",
    metadata: { linkId: link.id, permissions: input.permissions },
  });

  return { link, token };
}

export async function listShareLinksForAlbum(
  albumId: string,
  ownerId: string,
  deps: Pick<ShareLinksDeps, "albums" | "shareLinks">,
): Promise<ShareLinkRow[]> {
  await getAlbumForOwner(albumId, ownerId, deps);
  return deps.shareLinks.listByAlbum(albumId);
}

/**
 * Revoga um link: impede novas sessões e expira imediatamente as
 * sessões já emitidas a partir dele (opção mais segura — ver
 * docs/decisions/0003).
 */
export async function revokeShareLink(
  albumId: string,
  linkId: string,
  ownerId: string,
  deps: ShareLinksDeps & { sessions: AlbumSessionsRepository },
): Promise<ShareLinkRow> {
  await getAlbumForOwner(albumId, ownerId, deps);

  const link = await deps.shareLinks.findByIdAndAlbum(linkId, albumId);
  if (!link) {
    throw new AppError("SHARE_LINK_NOT_FOUND", "Link não encontrado.", 404);
  }

  const revoked = (await deps.shareLinks.revoke(linkId)) ?? link;
  await deps.sessions.expireByShareLink(linkId);

  await deps.auditLog.record({
    actor_user_id: ownerId,
    album_id: albumId,
    action: "share_link.revoked",
    metadata: { linkId },
  });

  return revoked;
}
