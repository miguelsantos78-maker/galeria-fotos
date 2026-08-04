import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { hashShareToken } from "@/lib/security/tokens";
import { hashPin } from "@/lib/security/pin";
import { resolveAlbumSession } from "@/server/use-cases/resolve-album";
import {
  createFakeAlbumSessionsRepository,
  createFakeAlbumsRepository,
  createFakePhotosRepository,
  createFakeShareLinksRepository,
  makeAlbumRow,
  makePhotoRow,
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

function fakeSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const path of paths) map.set(path, `https://signed.example/${path}`);
  return Promise.resolve(map);
}

function setup(
  overrides: {
    album?: Partial<ReturnType<typeof makeAlbumRow>>;
    link?: Partial<{
      pin_hash: string | null;
      revoked_at: string | null;
      expires_at: string | null;
      permissions: ("view" | "upload" | "moderate")[];
    }>;
    photos?: ReturnType<typeof makePhotoRow>[];
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
      encrypted_token: null,
      token_key_version: null,
      permissions: ["view"],
      expires_at: null,
      revoked_at: null,
      created_by: "owner-1",
      created_at: new Date().toISOString(),
      ...overrides.link,
    },
  ]);
  const sessions = createFakeAlbumSessionsRepository();
  const photos = createFakePhotosRepository(overrides.photos ?? []);
  const createSignedUrls = fakeSignedUrls;

  return {
    album,
    token,
    albums,
    shareLinks,
    sessions,
    photos,
    createSignedUrls,
  };
}

describe("resolveAlbumSession", () => {
  it("cria uma album_session para um token válido", async () => {
    const { token, albums, shareLinks, sessions, album, photos, createSignedUrls } = setup();

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1", isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.album.id).toBe(album.id);
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0].user_id).toBe("guest-1");
    expect(sessions.rows[0].album_id).toBe(album.id);
  });

  it("rejeita um token inexistente com ALBUM_LINK_INVALID", async () => {
    const { albums, shareLinks, sessions, photos, createSignedUrls } = setup();

    await expect(
      resolveAlbumSession(
        { token: "token-errado" },
        { userId: "guest-1", isAnonymous: true },
        { albums, shareLinks, sessions, photos, createSignedUrls },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_LINK_INVALID" });
  });

  it("rejeita um link revogado com o mesmo código genérico", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } = setup({
      link: { revoked_at: new Date().toISOString() },
    });

    await expect(
      resolveAlbumSession(
        { token },
        { userId: "guest-1", isAnonymous: true },
        { albums, shareLinks, sessions, photos, createSignedUrls },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_LINK_INVALID" });
  });

  it("rejeita um link expirado", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } = setup({
      link: { expires_at: new Date(Date.now() - 1000).toISOString() },
    });

    await expect(
      resolveAlbumSession(
        { token },
        { userId: "guest-1", isAnonymous: true },
        { albums, shareLinks, sessions, photos, createSignedUrls },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_LINK_INVALID" });
  });

  it("rejeita um álbum que não está publicado", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } = setup({
      album: { status: "draft" },
    });

    await expect(
      resolveAlbumSession(
        { token },
        { userId: "guest-1", isAnonymous: true },
        { albums, shareLinks, sessions, photos, createSignedUrls },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_LINK_INVALID" });
  });

  it("exige PIN quando o link tem um", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } = setup({
      link: { pin_hash: hashPin("1234") },
    });

    await expect(
      resolveAlbumSession(
        { token },
        { userId: "guest-1", isAnonymous: true },
        { albums, shareLinks, sessions, photos, createSignedUrls },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_PIN_REQUIRED" });
  });

  it("rejeita um PIN errado", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } = setup({
      link: { pin_hash: hashPin("1234") },
    });

    await expect(
      resolveAlbumSession(
        { token, pin: "0000" },
        { userId: "guest-1", isAnonymous: true },
        { albums, shareLinks, sessions, photos, createSignedUrls },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_PIN_INVALID" });
  });

  it("aceita o PIN correto", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } = setup({
      link: { pin_hash: hashPin("1234") },
    });

    const result = await resolveAlbumSession(
      { token, pin: "1234" },
      { userId: "guest-1", isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.album).toBeDefined();
  });

  it("remove a permissão 'upload' quando o álbum tem upload desligado", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } = setup({
      album: { upload_enabled: false },
      link: { permissions: ["view", "upload"] },
    });

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1", isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.permissions).toEqual(["view"]);
  });

  it("isOwner é true para o dono do álbum autenticado (não anónimo)", async () => {
    const { token, albums, shareLinks, sessions, album, photos, createSignedUrls } = setup({
      album: { owner_id: "owner-1" },
    });

    const result = await resolveAlbumSession(
      { token },
      { userId: album.owner_id, isAnonymous: false },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.isOwner).toBe(true);
  });

  it("isOwner é false para um convidado anónimo, mesmo com o mesmo user_id do dono", async () => {
    const { token, albums, shareLinks, sessions, album, photos, createSignedUrls } = setup({
      album: { owner_id: "owner-1" },
    });

    const result = await resolveAlbumSession(
      { token },
      { userId: album.owner_id, isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.isOwner).toBe(false);
  });

  it("isOwner é false para um utilizador autenticado que não é o dono", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } = setup({
      album: { owner_id: "owner-1" },
    });

    const result = await resolveAlbumSession(
      { token },
      { userId: "outro-utilizador", isAnonymous: false },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.isOwner).toBe(false);
  });

  it("coverPhotoUrl é null quando o álbum não tem capa definida", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup();

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1", isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.album.coverPhotoUrl).toBeNull();
  });

  it("coverPhotoUrl é o URL assinado do preview da fotografia de capa", async () => {
    const coverPhoto = makePhotoRow({
      preview_path: "albums/album-1/cover/preview.webp",
    });
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
        album: { cover_photo_id: coverPhoto.id },
        photos: [coverPhoto],
      });

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1", isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.album.coverPhotoUrl).toBe(
      "https://signed.example/albums/album-1/cover/preview.webp",
    );
  });

  it("coverPhotoUrl é null quando a fotografia de capa foi eliminada", async () => {
    const coverPhoto = makePhotoRow({
      preview_path: "albums/album-1/cover/preview.webp",
      status: "deleted",
      deleted_at: new Date().toISOString(),
    });
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
        album: { cover_photo_id: coverPhoto.id },
        photos: [coverPhoto],
      });

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1", isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.album.coverPhotoUrl).toBeNull();
  });

  it("coverPhotoUrl é null quando a fotografia de capa ainda não tem preview", async () => {
    const coverPhoto = makePhotoRow({ preview_path: null });
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
        album: { cover_photo_id: coverPhoto.id },
        photos: [coverPhoto],
      });

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1", isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.album.coverPhotoUrl).toBeNull();
  });
});
