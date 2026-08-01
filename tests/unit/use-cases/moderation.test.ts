import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { encryptSecret } from "@/lib/security/encryption";
import {
  batchModeratePhotos,
  deletePhoto,
  listPhotosForOwner,
  updatePhotoModeration,
} from "@/server/use-cases/moderation";
import {
  createFakeAlbumsRepository,
  createFakeAuditLogRepository,
  createFakeGoogleConnectionsRepository,
  createFakePhotosRepository,
  makeAlbumRow,
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

      expect(result).toHaveLength(3);
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

      expect(result[0].isCover).toBe(true);
      expect(result[0].previewUrl).toContain("preview.webp");
      expect(result[0].thumbnailUrl).toContain("thumbnail.webp");
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
