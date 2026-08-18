import { describe, expect, it } from "vitest";
import { listPhotosForViewer } from "@/server/use-cases/photos";
import {
  createFakeAlbumSessionsRepository,
  createFakePhotosRepository,
  makeAlbumSessionRow,
  makePhotoRow,
} from "../fakes/repositories";

function fakeSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const path of paths) map.set(path, `https://signed.example/${path}`);
  return Promise.resolve(map);
}

describe("listPhotosForViewer", () => {
  it("lança erro sem sessão válida para o álbum", async () => {
    const sessions = createFakeAlbumSessionsRepository();
    const photos = createFakePhotosRepository();

    await expect(
      listPhotosForViewer(
        "album-1",
        "user-1",
        {},
        { sessions, photos, createSignedUrls: fakeSignedUrls },
      ),
    ).rejects.toMatchObject({ code: "ALBUM_SESSION_INVALID" });
  });

  it("só lista fotografias 'ready' para uma sessão sem permissão de moderação", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ permissions: ["view"] }),
    ]);
    const photos = createFakePhotosRepository([
      makePhotoRow({ album_id: "album-1", status: "ready", sort_order: 2 }),
      makePhotoRow({
        album_id: "album-1",
        status: "pending_review",
        sort_order: 1,
      }),
    ]);

    const result = await listPhotosForViewer(
      "album-1",
      "user-1",
      {},
      { sessions, photos, createSignedUrls: fakeSignedUrls },
    );

    expect(result.photos).toHaveLength(1);
    expect(result.photos[0].status).toBe("ready");
  });

  it("inclui fotografias 'pending_review' para uma sessão com permissão de moderação", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ permissions: ["view", "moderate"] }),
    ]);
    const photos = createFakePhotosRepository([
      makePhotoRow({ album_id: "album-1", status: "ready", sort_order: 2 }),
      makePhotoRow({
        album_id: "album-1",
        status: "pending_review",
        sort_order: 1,
      }),
    ]);

    const result = await listPhotosForViewer(
      "album-1",
      "user-1",
      {},
      { sessions, photos, createSignedUrls: fakeSignedUrls },
    );

    expect(result.photos).toHaveLength(2);
  });

  it("pagina por cursor (sort_order) e devolve nextCursor quando há mais páginas", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ permissions: ["view"] }),
    ]);
    const photos = createFakePhotosRepository(
      Array.from({ length: 5 }, (_, index) =>
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          sort_order: 100 - index,
        }),
      ),
    );

    const firstPage = await listPhotosForViewer(
      "album-1",
      "user-1",
      { limit: 2 },
      { sessions, photos, createSignedUrls: fakeSignedUrls },
    );

    expect(firstPage.photos).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listPhotosForViewer(
      "album-1",
      "user-1",
      { limit: 2, cursor: firstPage.nextCursor ?? undefined },
      { sessions, photos, createSignedUrls: fakeSignedUrls },
    );

    expect(secondPage.photos).toHaveLength(2);
    expect(secondPage.photos[0].id).not.toBe(firstPage.photos[0].id);
  });

  it("devolve os URLs assinados de preview e thumbnail", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ permissions: ["view"] }),
    ]);
    const photo = makePhotoRow({
      album_id: "album-1",
      status: "ready",
      preview_path: "albums/album-1/photo-x/preview.webp",
    });
    const photos = createFakePhotosRepository([photo]);

    const result = await listPhotosForViewer(
      "album-1",
      "user-1",
      {},
      { sessions, photos, createSignedUrls: fakeSignedUrls },
    );

    expect(result.photos[0].previewUrl).toContain("preview.webp");
    expect(result.photos[0].thumbnailUrl).toContain("thumbnail.webp");
  });

  it("devolve o total só na primeira página", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ permissions: ["view"] }),
    ]);
    const photos = createFakePhotosRepository(
      Array.from({ length: 5 }, (_, i) =>
        makePhotoRow({ album_id: "album-1", status: "ready", sort_order: i }),
      ),
    );

    const firstPage = await listPhotosForViewer(
      "album-1",
      "user-1",
      { limit: 2 },
      { sessions, photos, createSignedUrls: fakeSignedUrls },
    );
    expect(firstPage.totalCount).toBe(5);

    const secondPage = await listPhotosForViewer(
      "album-1",
      "user-1",
      { limit: 2, cursor: firstPage.nextCursor ?? undefined },
      { sessions, photos, createSignedUrls: fakeSignedUrls },
    );
    expect(secondPage.totalCount).toBeNull();
  });

  it("marca isMine só nas fotografias enviadas por quem está a ver", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ permissions: ["view"] }),
    ]);
    const photos = createFakePhotosRepository([
      makePhotoRow({
        album_id: "album-1",
        status: "ready",
        sort_order: 2,
        uploaded_by: "user-1",
      }),
      makePhotoRow({
        album_id: "album-1",
        status: "ready",
        sort_order: 1,
        uploaded_by: "outro-convidado",
      }),
    ]);

    const result = await listPhotosForViewer(
      "album-1",
      "user-1",
      {},
      { sessions, photos, createSignedUrls: fakeSignedUrls },
    );

    expect(result.photos.map((photo) => photo.isMine)).toEqual([true, false]);
  });

  it("com onlyMine, devolve e conta apenas as fotografias do próprio", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ permissions: ["view"] }),
    ]);
    const photos = createFakePhotosRepository([
      makePhotoRow({
        album_id: "album-1",
        status: "ready",
        sort_order: 3,
        uploaded_by: "user-1",
      }),
      makePhotoRow({
        album_id: "album-1",
        status: "ready",
        sort_order: 2,
        uploaded_by: "outro-convidado",
      }),
      makePhotoRow({
        album_id: "album-1",
        status: "ready",
        sort_order: 1,
        uploaded_by: "outro-convidado",
      }),
    ]);

    const result = await listPhotosForViewer(
      "album-1",
      "user-1",
      { onlyMine: true },
      { sessions, photos, createSignedUrls: fakeSignedUrls },
    );

    expect(result.photos).toHaveLength(1);
    expect(result.photos[0].isMine).toBe(true);
    expect(result.totalCount).toBe(1);
  });

  it("não perde fotografias que partilham o mesmo sort_order entre páginas", async () => {
    // O cenário real: `sort_order` tem por omissão o relógio em
    // milissegundos, e dezenas de convidados a enviar ao mesmo tempo
    // produzem empates. Com um cursor só de `sort_order`, o `< cursor`
    // da página seguinte saltava por cima de todas as empatadas com a
    // última da página anterior — desapareciam da galeria em silêncio.
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ permissions: ["view"] }),
    ]);
    const TOTAL = 12;
    const photos = createFakePhotosRepository(
      Array.from({ length: TOTAL }, (_, index) =>
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          // Três fotografias por milissegundo.
          sort_order: 1_000_000 - Math.floor(index / 3),
        }),
      ),
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await listPhotosForViewer(
        "album-1",
        "user-1",
        { limit: 5, cursor },
        { sessions, photos, createSignedUrls: fakeSignedUrls },
      );
      seen.push(...result.photos.map((photo) => photo.id));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    expect(new Set(seen).size).toBe(TOTAL);
    // E sem repetir nenhuma pelo caminho.
    expect(seen).toHaveLength(TOTAL);
  });

  it("um cursor inválido devolve a primeira página em vez de rebentar", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ permissions: ["view"] }),
    ]);
    const photos = createFakePhotosRepository([
      makePhotoRow({ album_id: "album-1", status: "ready" }),
    ]);

    for (const cursor of ["lixo", "123", "abc_def", "1_foto,bar"]) {
      const result = await listPhotosForViewer(
        "album-1",
        "user-1",
        { limit: 5, cursor },
        { sessions, photos, createSignedUrls: fakeSignedUrls },
      );
      expect(result.photos).toHaveLength(1);
    }
  });
});
