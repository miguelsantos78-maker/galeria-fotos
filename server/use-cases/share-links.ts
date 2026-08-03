import "server-only";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { ShareLinksRepository } from "@/server/repositories/share-links-repository";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import type { CreateShareLinkInput } from "@/lib/validation/share-link";
import { generateShareToken, hashShareToken } from "@/lib/security/tokens";
import { hashPin } from "@/lib/security/pin";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";
import { AppError } from "@/lib/api/response";
import { getServerEnv } from "@/lib/env";
import { getAlbumForOwner } from "@/server/use-cases/albums";
import type { Database } from "@/lib/db/database.types";

type ShareLinkRow = Database["public"]["Tables"]["album_share_links"]["Row"];
export type PublicShareLink = Omit<
  ShareLinkRow,
  "token_hash" | "pin_hash" | "encrypted_token" | "token_key_version"
> & {
  hasPin: boolean;
  /**
   * Recuperado a partir de "encrypted_token" (secção
   * docs/decisions/0013-link-partilha-recuperavel.md) — permite ao
   * administrador voltar a copiar o link sem o regenerar. Só `null`
   * para links criados antes desta funcionalidade existir.
   */
  token: string | null;
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
    token:
      link.encrypted_token && link.token_key_version !== null
        ? decryptSecret(link.encrypted_token, link.token_key_version)
        : null,
  };
}

interface ShareLinksDeps {
  albums: AlbumsRepository;
  shareLinks: ShareLinksRepository;
  auditLog: AuditLogRepository;
}

/**
 * Cria um link de partilha. Devolve o token em texto simples desde já,
 * e o mesmo texto fica também recuperável mais tarde por
 * `toPublicShareLink` — encriptado (nunca em texto simples) na base de
 * dados, tal como o refresh token do Google Drive. A verificação de
 * links de convidado continua a usar só o hash (`token_hash`),
 * inalterada.
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
  const { ciphertext, keyVersion } = encryptSecret(token);

  const link = await deps.shareLinks.insert({
    album_id: albumId,
    token_hash: tokenHash,
    pin_hash: input.pin ? hashPin(input.pin) : null,
    encrypted_token: ciphertext,
    token_key_version: keyVersion,
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
