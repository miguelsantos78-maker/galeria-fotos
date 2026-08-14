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
    const {
      token,
      albums,
      shareLinks,
      sessions,
      album,
      photos,
      createSignedUrls,
    } = setup();

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
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
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
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
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
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
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
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
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
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
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
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
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
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
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
    const {
      token,
      albums,
      shareLinks,
      sessions,
      album,
      photos,
      createSignedUrls,
    } = setup({
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
    const {
      token,
      albums,
      shareLinks,
      sessions,
      album,
      photos,
      createSignedUrls,
    } = setup({
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
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({
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

  it("devolve já a primeira página de fotografias, sem um segundo pedido", async () => {
    const photoRows = [
      makePhotoRow({ album_id: "album-1", status: "ready" }),
      makePhotoRow({ album_id: "album-1", status: "ready" }),
    ];
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup({ album: { id: "album-1" }, photos: photoRows });

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1", isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    // Sem isto, abrir a galeria eram dois pedidos em série: o segundo
    // só podia começar depois de este responder com o `albumId`.
    expect(result.initialPhotos.photos).toHaveLength(2);
    expect(result.initialPhotos.totalCount).toBe(2);
    expect(result.initialPhotos.photos[0].thumbnailUrl).toContain("https://");
  });

  it("a primeira página vem vazia num álbum sem fotografias", async () => {
    const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
      setup();

    const result = await resolveAlbumSession(
      { token },
      { userId: "guest-1", isAnonymous: true },
      { albums, shareLinks, sessions, photos, createSignedUrls },
    );

    expect(result.initialPhotos.photos).toEqual([]);
    expect(result.initialPhotos.nextCursor).toBeNull();
  });

  describe("reaproveitamento da sessão em vigor", () => {
    it("não cria uma linha nova quando já existe uma sessão válida e igual", async () => {
      const deps = setup();
      const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
        deps;
      const ctx = { userId: "guest-1", isAnonymous: true };
      const args = { albums, shareLinks, sessions, photos, createSignedUrls };

      // `useResolveAlbum` resolve o link a cada montagem: abrir a
      // galeria, atualizar a página e saltar para o envio eram três
      // linhas para descrever o mesmo acesso.
      await resolveAlbumSession({ token }, ctx, args);
      await resolveAlbumSession({ token }, ctx, args);
      await resolveAlbumSession({ token }, ctx, args);

      expect(sessions.rows).toHaveLength(1);
    });

    it("cria uma sessão nova quando as permissões do link já não são as mesmas", async () => {
      // Álbum com upload desligado entretanto: a sessão antiga daria
      // ao convidado mais acesso do que o link atual concede.
      const first = setup({ link: { permissions: ["view", "upload"] } });
      const ctx = { userId: "guest-1", isAnonymous: true };

      await resolveAlbumSession({ token: first.token }, ctx, {
        albums: first.albums,
        shareLinks: first.shareLinks,
        sessions: first.sessions,
        photos: first.photos,
        createSignedUrls: first.createSignedUrls,
      });
      expect(first.sessions.rows[0].permissions).toEqual(["view", "upload"]);

      await first.albums.update(first.album.id, { upload_enabled: false });

      await resolveAlbumSession({ token: first.token }, ctx, {
        albums: first.albums,
        shareLinks: first.shareLinks,
        sessions: first.sessions,
        photos: first.photos,
        createSignedUrls: first.createSignedUrls,
      });

      expect(first.sessions.rows).toHaveLength(2);
      expect(first.sessions.rows.at(-1)?.permissions).toEqual(["view"]);
    });

    it("cria sessões separadas para convidados diferentes", async () => {
      const { token, albums, shareLinks, sessions, photos, createSignedUrls } =
        setup();
      const args = { albums, shareLinks, sessions, photos, createSignedUrls };

      await resolveAlbumSession(
        { token },
        { userId: "guest-1", isAnonymous: true },
        args,
      );
      await resolveAlbumSession(
        { token },
        { userId: "guest-2", isAnonymous: true },
        args,
      );

      expect(sessions.rows).toHaveLength(2);
    });
  });
});
