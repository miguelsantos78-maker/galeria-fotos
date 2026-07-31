import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { hashShareToken } from "@/lib/security/tokens";
import { hashPin } from "@/lib/security/pin";
import { resolveAlbumSession } from "@/server/use-cases/resolve-album";
import {
  createFakeAlbumSessionsRepository,
  createFakeAlbumsRepository,
  createFakeShareLinksRepository,
  makeAlbumRow,
} from "../fakes/repositories";
import { validServerEnv } from "../fakes/env";

const PEPPER = validServerEnv.APP_TOKEN_PEPPER;
const originalEnv = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, validServerEnv);
  resetEnvCacheForTests();
});

afterEach(() => {
  process.env = { ...originalEnv };
  resetEnvCacheForTests();
});

function setup(
  overrides: {
    album?: Partial<ReturnType<typeof makeAlbumRow>>;
    link?: Partial<{
      pin_hash: string | null;
      revoked_at: string | null;
      expires_at: string | null;
      permissions: ("view" | "upload" | "moderate")[];
    }>;
  } = {},
) {
  const album = makeAlbumRow({ status: "published", ...overrides.album });
  const token = "raw-token-123";
  const tokenHash = hashShareToken(token, PEPPER);

  const albums = createFakeAlbumsRepository([album]);
  const shareLinks = createFakeShareLinksRepository([
    {
      id: "link-1",
      album_id: album.id,
      token_hash: tokenHash,
      pin_hash: null,
      permissions: ["view"],
      expires_at: null,
      revoked_at: null,
      created_by: "owner-1",
      created_at: new Date().toISOString(),
      ...overrides.link,
    },
  ]);
  const sessions = createFakeAlbumSessionsRepository();

  return { album, token, albums, shareLinks, sessions };
}

describe("resolveAlbumSession", () => {
  it("cria uma album_session para um token válido", async () => {
    const { token, albums, shareLinks, sessions, album } = setup();

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1" },
      { albums, shareLinks, sessions },
    );

    expect(result.album.id).toBe(album.id);
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0].user_id).toBe("guest-1");
    expect(sessions.rows[0].album_id).toBe(album.id);
  });

  it("rejeita um token inexistente com ALBUM_LINK_INVALID", async () => {
    const { albums, shareLinks, sessions } = setup();

    await expect(
      resolveAlbumSession(
        { token: "token-errado" },
        { userId: "guest-1" },
        { albums, shareLinks, sessions },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_LINK_INVALID" });
  });

  it("rejeita um link revogado com o mesmo código genérico", async () => {
    const { token, albums, shareLinks, sessions } = setup({
      link: { revoked_at: new Date().toISOString() },
    });

    await expect(
      resolveAlbumSession(
        { token },
        { userId: "guest-1" },
        { albums, shareLinks, sessions },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_LINK_INVALID" });
  });

  it("rejeita um link expirado", async () => {
    const { token, albums, shareLinks, sessions } = setup({
      link: { expires_at: new Date(Date.now() - 1000).toISOString() },
    });

    await expect(
      resolveAlbumSession(
        { token },
        { userId: "guest-1" },
        { albums, shareLinks, sessions },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_LINK_INVALID" });
  });

  it("rejeita um álbum que não está publicado", async () => {
    const { token, albums, shareLinks, sessions } = setup({
      album: { status: "draft" },
    });

    await expect(
      resolveAlbumSession(
        { token },
        { userId: "guest-1" },
        { albums, shareLinks, sessions },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_LINK_INVALID" });
  });

  it("exige PIN quando o link tem um", async () => {
    const { token, albums, shareLinks, sessions } = setup({
      link: { pin_hash: hashPin("1234") },
    });

    await expect(
      resolveAlbumSession(
        { token },
        { userId: "guest-1" },
        { albums, shareLinks, sessions },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_PIN_REQUIRED" });
  });

  it("rejeita um PIN errado", async () => {
    const { token, albums, shareLinks, sessions } = setup({
      link: { pin_hash: hashPin("1234") },
    });

    await expect(
      resolveAlbumSession(
        { token, pin: "0000" },
        { userId: "guest-1" },
        { albums, shareLinks, sessions },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_PIN_INVALID" });
  });

  it("aceita o PIN correto", async () => {
    const { token, albums, shareLinks, sessions } = setup({
      link: { pin_hash: hashPin("1234") },
    });

    const result = await resolveAlbumSession(
      { token, pin: "1234" },
      { userId: "guest-1" },
      { albums, shareLinks, sessions },
    );

    expect(result.album).toBeDefined();
  });

  it("remove a permissão 'upload' quando o álbum tem upload desligado", async () => {
    const { token, albums, shareLinks, sessions } = setup({
      album: { upload_enabled: false },
      link: { permissions: ["view", "upload"] },
    });

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1" },
      { albums, shareLinks, sessions },
    );

    expect(result.permissions).toEqual(["view"]);
  });
});
