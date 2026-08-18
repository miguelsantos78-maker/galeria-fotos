import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { encryptSecret } from "@/lib/security/encryption";
import {
  batchModeratePhotos,
  deleteOwnPhoto,
  deletePhoto,
  listPhotosForOwner,
  updatePhotoModeration,
} from "@/server/use-cases/moderation";
import {
  createFakeAlbumSessionsRepository,
  createFakeAlbumsRepository,
  createFakeAuditLogRepository,
  createFakeGoogleConnectionsRepository,
  createFakePhotosRepository,
  makeAlbumRow,
  makeAlbumSessionRow,
  makeGoogleConnectionRow,
  makePhotoRow,
} from "../fakes/repositories";
import { createFakeDriveStorageProvider } from "../fakes/drive-provider";
import { createFakePreviewStorage } from "../fakes/preview-storage";
import { validServerEnv } from "../fakes/env";
import { buildThumbnailPath } from "@/lib/media/storage-paths";

const originalEnv = { ...process.env };

function fakeSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const path of paths) map.set(path, `https://signed.example/${path}`);
  return Promise.resolve(map);
}

function makeDeps(
  overrides: {
    albumOverrides?: Parameters<typeof makeAlbumRow>[0];
    withConnection?: boolean;
  } = {},
) {
  const album = makeAlbumRow({
    id: "album-1",
    owner_id: "owner-1",
    ...overrides.albumOverrides,
  });
  const albums = createFakeAlbumsRepository([album]);
  const photos = createFakePhotosRepository();
  const auditLog = createFakeAuditLogRepository();
  const previewStorage = createFakePreviewStorage();

  const { ciphertext, keyVersion } = encryptSecret("refresh-token");
  const connections = createFakeGoogleConnectionsRepository(
    overrides.withConnection === false
      ? []
      : [
          makeGoogleConnectionRow({
            user_id: "owner-1",
            status: "active",
            encrypted_refresh_token: ciphertext,
            token_key_version: keyVersion,
          }),
        ],
  );

  const driveProvider = createFakeDriveStorageProvider();

  return {
    album,
    albums,
    photos,
    auditLog,
    previewStorage,
    connections,
    driveProvider,
    deps: {
      albums,
      photos,
      connections,
      auditLog,
      previewStorage,
      driveProviderFactory: () => driveProvider,
    },
  };
}

describe("moderation use-cases", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    process.env = { ...originalEnv, ...validServerEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  describe("listPhotosForOwner", () => {
    it("lança FORBIDDEN quando o álbum não pertence ao dono", async () => {
      const { deps } = makeDeps();

      await expect(
        listPhotosForOwner(
          "album-1",
          "owner-2",
          {},
          { ...deps, createSignedUrls: fakeSignedUrls },
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("devolve todas as fotografias não eliminadas, incluindo pending_review e hidden", async () => {
      const { deps, photos } = makeDeps();
      await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );
      await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "pending_review" }),
      );
      await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "hidden" }),
      );
      await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "deleted",
          deleted_at: new Date().toISOString(),
        }),
      );

      const result = await listPhotosForOwner(
        "album-1",
        "owner-1",
        {},
        { ...deps, createSignedUrls: fakeSignedUrls },
      );

      expect(result.photos).toHaveLength(3);
      expect(result.nextOffset).toBeNull();
    });

    it("marca isCover corretamente e inclui URLs assinados", async () => {
      const { deps, photos, albums } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          preview_path: "albums/album-1/photo-x/preview.webp",
        }),
      );
      await albums.update("album-1", { cover_photo_id: photo.id });

      const result = await listPhotosForOwner(
        "album-1",
        "owner-1",
        {},
        { ...deps, createSignedUrls: fakeSignedUrls },
      );

      expect(result.photos[0].isCover).toBe(true);
      expect(result.photos[0].previewUrl).toContain("preview.webp");
      expect(result.photos[0].thumbnailUrl).toContain("thumbnail.webp");
    });

    it("pagina: devolve nextOffset enquanto houver mais páginas", async () => {
      const { deps, photos } = makeDeps();
      for (let i = 0; i < 5; i++) {
        await photos.insert(
          makePhotoRow({ album_id: "album-1", status: "ready" }),
        );
      }

      const firstPage = await listPhotosForOwner(
        "album-1",
        "owner-1",
        { limit: 2 },
        { ...deps, createSignedUrls: fakeSignedUrls },
      );
      expect(firstPage.photos).toHaveLength(2);
      expect(firstPage.nextOffset).toBe(2);

      const lastPage = await listPhotosForOwner(
        "album-1",
        "owner-1",
        { limit: 2, offset: 4 },
        { ...deps, createSignedUrls: fakeSignedUrls },
      );
      expect(lastPage.photos).toHaveLength(1);
      expect(lastPage.nextOffset).toBeNull();
    });
  });

  describe("updatePhotoModeration", () => {
    it("aprova uma fotografia pending_review", async () => {
      const { deps, photos, auditLog } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "pending_review" }),
      );

      const updated = await updatePhotoModeration(
        photo.id,
        "owner-1",
        { status: "ready" },
        deps,
      );

      expect(updated.status).toBe("ready");
      expect(auditLog.entries[0].action).toBe("photo.approved");
    });

    it("recusa aprovar uma fotografia já publicada", async () => {
      const { deps, photos } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );

      await expect(
        updatePhotoModeration(photo.id, "owner-1", { status: "ready" }, deps),
      ).rejects.toMatchObject({ code: "PHOTO_INVALID_TRANSITION" });
    });

    it("oculta uma fotografia publicada", async () => {
      const { deps, photos, auditLog } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );

      const updated = await updatePhotoModeration(
        photo.id,
        "owner-1",
        { status: "hidden" },
        deps,
      );

      expect(updated.status).toBe("hidden");
      expect(auditLog.entries[0].action).toBe("photo.hidden");
    });

    it("recusa ocultar uma fotografia que ainda não foi publicada", async () => {
      const { deps, photos } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "pending_review" }),
      );

      await expect(
        updatePhotoModeration(photo.id, "owner-1", { status: "hidden" }, deps),
      ).rejects.toMatchObject({ code: "PHOTO_INVALID_TRANSITION" });
    });

    it("republica uma fotografia oculta", async () => {
      const { deps, photos, auditLog } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "hidden" }),
      );

      const updated = await updatePhotoModeration(
        photo.id,
        "owner-1",
        { status: "ready" },
        deps,
      );

      expect(updated.status).toBe("ready");
      expect(auditLog.entries[0].action).toBe("photo.unhidden");
    });

    it("destaca e remove destaque, registando auditoria", async () => {
      const { deps, photos, auditLog } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );

      const featured = await updatePhotoModeration(
        photo.id,
        "owner-1",
        { isFeatured: true },
        deps,
      );
      expect(featured.is_featured).toBe(true);
      expect(auditLog.entries[0].action).toBe("photo.featured");

      const unfeatured = await updatePhotoModeration(
        photo.id,
        "owner-1",
        { isFeatured: false },
        deps,
      );
      expect(unfeatured.is_featured).toBe(false);
      expect(auditLog.entries[1].action).toBe("photo.unfeatured");
    });

    it("define e remove como capa, registando auditoria", async () => {
      const { deps, photos, auditLog, albums } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );

      await updatePhotoModeration(
        photo.id,
        "owner-1",
        { setAsCover: true },
        deps,
      );
      let album = await albums.findById("album-1");
      expect(album?.cover_photo_id).toBe(photo.id);
      expect(auditLog.entries[0].action).toBe("photo.set_as_cover");

      await updatePhotoModeration(
        photo.id,
        "owner-1",
        { setAsCover: false },
        deps,
      );
      album = await albums.findById("album-1");
      expect(album?.cover_photo_id).toBeNull();
      expect(auditLog.entries[1].action).toBe("photo.unset_as_cover");
    });

    it("lança FORBIDDEN quando o álbum não pertence ao dono", async () => {
      const { deps, photos } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );

      await expect(
        updatePhotoModeration(photo.id, "owner-2", { isFeatured: true }, deps),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lança PHOTO_NOT_FOUND para uma fotografia inexistente", async () => {
      const { deps } = makeDeps();

      await expect(
        updatePhotoModeration(
          "photo-inexistente",
          "owner-1",
          { isFeatured: true },
          deps,
        ),
      ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" });
    });
  });

  describe("deletePhoto", () => {
    it("elimina o original do Drive, os derivados e marca a linha como eliminada", async () => {
      const { deps, photos, auditLog, driveProvider, previewStorage } =
        makeDeps();
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          drive_file_id: "drive-file-1",
        }),
      );
      const previewPath = `albums/album-1/${photo.id}/preview.webp`;
      const thumbnailPath = buildThumbnailPath(photo.album_id, photo.id);
      await photos.update(photo.id, { preview_path: previewPath });
      previewStorage.uploads.set(previewPath, Buffer.from("x"));
      previewStorage.uploads.set(thumbnailPath, Buffer.from("y"));

      await deletePhoto(photo.id, "owner-1", deps);

      const updated = await photos.findById(photo.id);
      expect(updated?.status).toBe("deleted");
      expect(updated?.deleted_at).not.toBeNull();
      expect(driveProvider.state.deletedFileIds).toContain("drive-file-1");
      expect(previewStorage.uploads.size).toBe(0);
      expect(auditLog.entries[0].action).toBe("photo.deleted");
    });

    it("é idempotente: eliminar duas vezes não gera erro", async () => {
      const { deps, photos } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );

      await deletePhoto(photo.id, "owner-1", deps);
      await expect(
        deletePhoto(photo.id, "owner-1", deps),
      ).resolves.toBeUndefined();
    });

    it("é um no-op silencioso para uma fotografia inexistente", async () => {
      const { deps } = makeDeps();
      await expect(
        deletePhoto("nao-existe", "owner-1", deps),
      ).resolves.toBeUndefined();
    });

    it("limpa a capa do álbum se a fotografia eliminada era a capa", async () => {
      const { deps, photos, albums } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );
      await albums.update("album-1", { cover_photo_id: photo.id });

      await deletePhoto(photo.id, "owner-1", deps);

      const album = await albums.findById("album-1");
      expect(album?.cover_photo_id).toBeNull();
    });

    it("lança GOOGLE_DRIVE_NOT_CONNECTED sem ligação ativa", async () => {
      const { deps, photos } = makeDeps({ withConnection: false });
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );

      await expect(
        deletePhoto(photo.id, "owner-1", deps),
      ).rejects.toMatchObject({ code: "GOOGLE_DRIVE_NOT_CONNECTED" });
    });

    it("lança FORBIDDEN quando o álbum não pertence ao dono", async () => {
      const { deps, photos } = makeDeps();
      const photo = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );

      await expect(
        deletePhoto(photo.id, "owner-2", deps),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("deleteOwnPhoto", () => {
    function makeGuestDeps(
      sessions = createFakeAlbumSessionsRepository([
        makeAlbumSessionRow({ album_id: "album-1", user_id: "convidado-1" }),
      ]),
    ) {
      const base = makeDeps();
      return { ...base, sessions, deps: { ...base.deps, sessions } };
    }

    it("um convidado elimina a fotografia que enviou", async () => {
      const { deps, photos, auditLog, driveProvider } = makeGuestDeps();
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          uploaded_by: "convidado-1",
          drive_file_id: "drive-file-1",
        }),
      );

      await deleteOwnPhoto(photo.id, "convidado-1", deps);

      const updated = await photos.findById(photo.id);
      expect(updated?.status).toBe("deleted");
      expect(driveProvider.state.deletedFileIds).toContain("drive-file-1");
      // Registado como ação do autor, não como moderação — a auditoria
      // tem de distinguir quem apagou o quê (secção 15).
      expect(auditLog.entries[0].action).toBe("photo.deleted_by_uploader");
      expect(auditLog.entries[0].actor_user_id).toBe("convidado-1");
    });

    it("não deixa um convidado eliminar a fotografia de outro", async () => {
      const { deps, photos, driveProvider } = makeGuestDeps();
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          uploaded_by: "outro-convidado",
        }),
      );

      await expect(
        deleteOwnPhoto(photo.id, "convidado-1", deps),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(driveProvider.state.deletedFileIds).toHaveLength(0);
    });

    it("não deixa eliminar sem sessão de álbum válida", async () => {
      // Ter enviado a fotografia não chega: o `auth.uid()` anónimo
      // sobrevive à revogação do link, por isso quem já não tem acesso
      // ao álbum também não apaga lá dentro.
      const { deps, photos, driveProvider } = makeGuestDeps(
        createFakeAlbumSessionsRepository([]),
      );
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          uploaded_by: "convidado-1",
        }),
      );

      await expect(
        deleteOwnPhoto(photo.id, "convidado-1", deps),
      ).rejects.toMatchObject({ code: "ALBUM_SESSION_INVALID" });
      expect(driveProvider.state.deletedFileIds).toHaveLength(0);
    });

    it("não deixa eliminar com uma sessão expirada", async () => {
      const { deps, photos } = makeGuestDeps(
        createFakeAlbumSessionsRepository([
          makeAlbumSessionRow({
            album_id: "album-1",
            user_id: "convidado-1",
            expires_at: new Date(Date.now() - 1000).toISOString(),
          }),
        ]),
      );
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          uploaded_by: "convidado-1",
        }),
      );

      await expect(
        deleteOwnPhoto(photo.id, "convidado-1", deps),
      ).rejects.toMatchObject({ code: "ALBUM_SESSION_INVALID" });
    });

    it("não deixa eliminar com uma sessão válida noutro álbum", async () => {
      const { deps, photos } = makeGuestDeps(
        createFakeAlbumSessionsRepository([
          makeAlbumSessionRow({ album_id: "album-9", user_id: "convidado-1" }),
        ]),
      );
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          uploaded_by: "convidado-1",
        }),
      );

      await expect(
        deleteOwnPhoto(photo.id, "convidado-1", deps),
      ).rejects.toMatchObject({ code: "ALBUM_SESSION_INVALID" });
    });

    it("elimina também uma fotografia ainda por aprovar", async () => {
      const { deps, photos } = makeGuestDeps();
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "pending_review",
          uploaded_by: "convidado-1",
        }),
      );

      await deleteOwnPhoto(photo.id, "convidado-1", deps);

      expect((await photos.findById(photo.id))?.status).toBe("deleted");
    });

    it("é idempotente e silencioso para uma fotografia já eliminada", async () => {
      const { deps, photos } = makeGuestDeps();
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          uploaded_by: "convidado-1",
        }),
      );

      await deleteOwnPhoto(photo.id, "convidado-1", deps);
      await expect(
        deleteOwnPhoto(photo.id, "convidado-1", deps),
      ).resolves.toBeUndefined();
      await expect(
        deleteOwnPhoto("nao-existe", "convidado-1", deps),
      ).resolves.toBeUndefined();
    });

    it("limpa a capa do álbum se a fotografia eliminada era a capa", async () => {
      const { deps, photos, albums } = makeGuestDeps();
      const photo = await photos.insert(
        makePhotoRow({
          album_id: "album-1",
          status: "ready",
          uploaded_by: "convidado-1",
        }),
      );
      await albums.update("album-1", { cover_photo_id: photo.id });

      await deleteOwnPhoto(photo.id, "convidado-1", deps);

      expect((await albums.findById("album-1"))?.cover_photo_id).toBeNull();
    });
  });

  describe("batchModeratePhotos", () => {
    it("aprova várias fotografias em lote", async () => {
      const { deps, photos } = makeDeps();
      const a = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "pending_review" }),
      );
      const b = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "pending_review" }),
      );

      const result = await batchModeratePhotos(
        "album-1",
        "owner-1",
        { photoIds: [a.id, b.id], action: "approve" },
        deps,
      );

      expect(result.succeeded).toEqual([a.id, b.id]);
      expect(result.failed).toHaveLength(0);
      expect((await photos.findById(a.id))?.status).toBe("ready");
      expect((await photos.findById(b.id))?.status).toBe("ready");
    });

    it("regista falhas individuais sem interromper as restantes", async () => {
      const { deps, photos } = makeDeps();
      const approvable = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "pending_review" }),
      );
      const alreadyReady = await photos.insert(
        makePhotoRow({ album_id: "album-1", status: "ready" }),
      );

      const result = await batchModeratePhotos(
        "album-1",
        "owner-1",
        { photoIds: [approvable.id, alreadyReady.id], action: "approve" },
        deps,
      );

      expect(result.succeeded).toEqual([approvable.id]);
      expect(result.failed).toEqual([
        { photoId: alreadyReady.id, error: expect.any(String) },
      ]);
    });

    it("ignora (falha) fotografias que pertencem a outro álbum", async () => {
      const { deps, photos, albums } = makeDeps();
      const otherAlbum = makeAlbumRow({
        id: "album-2",
        owner_id: "owner-1",
      });
      albums.rows.push(otherAlbum);
      const photoInOtherAlbum = await photos.insert(
        makePhotoRow({ album_id: "album-2", status: "pending_review" }),
      );

      const result = await batchModeratePhotos(
        "album-1",
        "owner-1",
        { photoIds: [photoInOtherAlbum.id], action: "approve" },
        deps,
      );

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
    });

    it("lança FORBIDDEN quando o álbum não pertence ao dono", async () => {
      const { deps } = makeDeps();

      await expect(
        batchModeratePhotos(
          "album-1",
          "owner-2",
          { photoIds: ["qualquer"], action: "approve" },
          deps,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
