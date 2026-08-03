import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import {
  createShareLink,
  listShareLinksForAlbum,
  revokeShareLink,
  toPublicShareLink,
} from "@/server/use-cases/share-links";
import {
  createFakeAlbumSessionsRepository,
  createFakeAlbumsRepository,
  createFakeAuditLogRepository,
  createFakeShareLinksRepository,
  makeAlbumRow,
} from "../fakes/repositories";
import { validServerEnv } from "../fakes/env";

const originalEnv = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, validServerEnv);
  resetEnvCacheForTests();
});

afterEach(() => {
  process.env = { ...originalEnv };
  resetEnvCacheForTests();
});

describe("createShareLink", () => {
  it("devolve o token em texto simples só nesta chamada", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const shareLinks = createFakeShareLinksRepository();
    const auditLog = createFakeAuditLogRepository();

    const { link, token } = await createShareLink(
      album.id,
      "owner-1",
      { permissions: ["view"] },
      { albums, shareLinks, auditLog },
    );

    expect(token.length).toBeGreaterThan(20);
    expect(link.id).toBeDefined();
    expect(shareLinks.rows[0].token_hash).not.toBe(token);
    expect(auditLog.entries[0].action).toBe("share_link.created");
  });

  it("guarda o token encriptado, recuperável mais tarde para o dono do álbum", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const shareLinks = createFakeShareLinksRepository();
    const auditLog = createFakeAuditLogRepository();

    const { link, token } = await createShareLink(
      album.id,
      "owner-1",
      { permissions: ["view"] },
      { albums, shareLinks, auditLog },
    );

    expect(shareLinks.rows[0].encrypted_token).not.toBeNull();
    expect(shareLinks.rows[0].encrypted_token).not.toBe(token);
    expect(toPublicShareLink(link).token).toBe(token);
  });

  it("toPublicShareLink devolve token null para links sem encrypted_token (criados antes desta funcionalidade)", () => {
    const link = {
      id: "link-1",
      album_id: "album-1",
      token_hash: "hash",
      pin_hash: null,
      encrypted_token: null,
      token_key_version: null,
      permissions: ["view"] satisfies ("view" | "upload" | "moderate")[],
      expires_at: null,
      revoked_at: null,
      created_by: "owner-1",
      created_at: new Date().toISOString(),
    };

    expect(toPublicShareLink(link).token).toBeNull();
  });

  it("guarda o PIN só como hash", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const shareLinks = createFakeShareLinksRepository();
    const auditLog = createFakeAuditLogRepository();

    await createShareLink(
      album.id,
      "owner-1",
      { permissions: ["view"], pin: "1234" },
      { albums, shareLinks, auditLog },
    );

    expect(shareLinks.rows[0].pin_hash).not.toBeNull();
    expect(shareLinks.rows[0].pin_hash).not.toContain("1234");
  });

  it("lança FORBIDDEN se não for o dono do álbum", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const shareLinks = createFakeShareLinksRepository();
    const auditLog = createFakeAuditLogRepository();

    await expect(
      createShareLink(
        album.id,
        "owner-2",
        { permissions: ["view"] },
        { albums, shareLinks, auditLog },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("listShareLinksForAlbum", () => {
  it("lista apenas os links do álbum indicado", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const shareLinks = createFakeShareLinksRepository();
    const auditLog = createFakeAuditLogRepository();

    await createShareLink(
      album.id,
      "owner-1",
      { permissions: ["view"] },
      { albums, shareLinks, auditLog },
    );

    const result = await listShareLinksForAlbum(album.id, "owner-1", {
      albums,
      shareLinks,
    });
    expect(result).toHaveLength(1);
  });
});

describe("revokeShareLink", () => {
  it("marca o link como revogado e expira sessões associadas", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const shareLinks = createFakeShareLinksRepository();
    const auditLog = createFakeAuditLogRepository();

    const { link } = await createShareLink(
      album.id,
      "owner-1",
      { permissions: ["view"] },
      { albums, shareLinks, auditLog },
    );

    const sessions = createFakeAlbumSessionsRepository([
      {
        id: "session-1",
        album_id: album.id,
        user_id: "guest-1",
        share_link_id: link.id,
        permissions: ["view"],
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const revoked = await revokeShareLink(album.id, link.id, "owner-1", {
      albums,
      shareLinks,
      sessions,
      auditLog,
    });

    expect(revoked.revoked_at).not.toBeNull();
    expect(new Date(sessions.rows[0].expires_at).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it("lança SHARE_LINK_NOT_FOUND para um link inexistente", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const shareLinks = createFakeShareLinksRepository();
    const sessions = createFakeAlbumSessionsRepository();
    const auditLog = createFakeAuditLogRepository();

    await expect(
      revokeShareLink(album.id, "inexistente", "owner-1", {
        albums,
        shareLinks,
        sessions,
        auditLog,
      }),
    ).rejects.toMatchObject({ code: "SHARE_LINK_NOT_FOUND" });
  });
});
