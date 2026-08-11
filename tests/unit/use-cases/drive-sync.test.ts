import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { encryptSecret } from "@/lib/security/encryption";
import { syncDeletedDrivePhotos } from "@/server/use-cases/drive-sync";
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

const originalEnv = { ...process.env };

function makeDeps() {
  const album = makeAlbumRow({ id: "album-1", owner_id: "owner-1" });
  const albums = createFakeAlbumsRepository([album]);
  const photos = createFakePhotosRepository();
  const auditLog = createFakeAuditLogRepository();
  const previewStorage = createFakePreviewStorage();

  const { ciphertext, keyVersion } = encryptSecret("refresh-token");
  const connections = createFakeGoogleConnectionsRepository([
    makeGoogleConnectionRow({
      id: "connection-1",
      user_id: "owner-1",
      status: "active",
      encrypted_refresh_token: ciphertext,
      token_key_version: keyVersion,
    }),
  ]);

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
      connections,
      albums,
      photos,
      auditLog,
      previewStorage,
      driveProviderFactory: () => driveProvider,
    },
  };
}

describe("syncDeletedDrivePhotos", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    process.env = { ...originalEnv, ...validServerEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  it("apaga fotografias que já não estão ativas no Drive", async () => {
    const { deps, photos, auditLog, driveProvider } = makeDeps();
    const stillThere = await photos.insert(
      makePhotoRow({ album_id: "album-1", status: "ready" }),
    );
    const removedFromDrive = await photos.insert(
      makePhotoRow({ album_id: "album-1", status: "ready" }),
    );
    driveProvider.state.activePhotoIds = new Set([stillThere.id]);

    const result = await syncDeletedDrivePhotos(deps);

    expect(result).toEqual({
      connectionsChecked: 1,
      connectionsFailed: 0,
      connectionsSkipped: 0,
      photosChecked: 2,
      photosRemoved: 1,
    });

    expect((await photos.findById(stillThere.id))?.status).toBe("ready");
    const removed = await photos.findById(removedFromDrive.id);
    expect(removed?.status).toBe("deleted");
    expect(removed?.deleted_at).not.toBeNull();
    expect(auditLog.entries[0]).toMatchObject({
      photo_id: removedFromDrive.id,
      action: "photo.deleted_from_drive",
      actor_user_id: null,
    });
    // Nunca chama deleteFile: o Drive já é a origem da remoção.
    expect(driveProvider.state.deletedFileIds).toHaveLength(0);
  });

  it("limpa a capa do álbum se a fotografia removida era a capa", async () => {
    const { deps, photos, albums, driveProvider } = makeDeps();
    // Várias fotografias e só a capa em falta: uma remoção isolada,
    // dentro do que a salvaguarda considera credível.
    const cover = await photos.insert(
      makePhotoRow({ album_id: "album-1", status: "ready" }),
    );
    const survivors = [];
    for (let i = 0; i < 4; i++) {
      survivors.push(
        await photos.insert(
          makePhotoRow({ album_id: "album-1", status: "ready" }),
        ),
      );
    }
    await albums.update("album-1", { cover_photo_id: cover.id });
    driveProvider.state.activePhotoIds = new Set(survivors.map((p) => p.id));

    await syncDeletedDrivePhotos(deps);

    expect((await albums.findById("album-1"))?.cover_photo_id).toBeNull();
  });

  it("não apaga nada quando todas as fotografias continuam ativas no Drive", async () => {
    const { deps, photos, driveProvider } = makeDeps();
    const photo = await photos.insert(
      makePhotoRow({ album_id: "album-1", status: "ready" }),
    );
    driveProvider.state.activePhotoIds = new Set([photo.id]);

    const result = await syncDeletedDrivePhotos(deps);

    expect(result.photosRemoved).toBe(0);
    expect((await photos.findById(photo.id))?.status).toBe("ready");
  });

  it("ignora fotografias já eliminadas (listForAlbumIds não as devolve)", async () => {
    const { deps, photos, driveProvider } = makeDeps();
    await photos.insert(
      makePhotoRow({
        album_id: "album-1",
        status: "deleted",
        deleted_at: new Date().toISOString(),
      }),
    );
    driveProvider.state.activePhotoIds = new Set();

    const result = await syncDeletedDrivePhotos(deps);

    expect(result.photosChecked).toBe(0);
    expect(result.photosRemoved).toBe(0);
  });

  it("isola falhas por ligação: uma ligação com erro não impede as restantes", async () => {
    const { deps, photos, connections, albums } = makeDeps();
    const brokenConnection = makeGoogleConnectionRow({
      id: "connection-2",
      user_id: "owner-2",
      status: "active",
      encrypted_refresh_token: "token-invalido-nao-encriptado",
      token_key_version: 1,
    });
    connections.rows.push(brokenConnection);
    const otherOwnerAlbum = makeAlbumRow({
      id: "album-2",
      owner_id: "owner-2",
    });
    albums.rows.push(otherOwnerAlbum);

    const stillThere = await photos.insert(
      makePhotoRow({ album_id: "album-1", status: "ready" }),
    );
    deps.driveProviderFactory().state.activePhotoIds = new Set([stillThere.id]);

    const result = await syncDeletedDrivePhotos(deps);

    expect(result.connectionsChecked).toBe(2);
    expect(result.connectionsFailed).toBe(1);
  });

  it("não faz nada quando não existem ligações ativas", async () => {
    const { deps, connections } = makeDeps();
    connections.rows.length = 0;

    const result = await syncDeletedDrivePhotos(deps);

    expect(result).toEqual({
      connectionsChecked: 0,
      connectionsFailed: 0,
      connectionsSkipped: 0,
      photosChecked: 0,
      photosRemoved: 0,
    });
  });

  describe("salvaguarda contra eliminação em massa", () => {
    async function seedPhotos(
      photos: ReturnType<typeof createFakePhotosRepository>,
      count: number,
    ) {
      const rows = [];
      for (let i = 0; i < count; i++) {
        rows.push(
          await photos.insert(
            makePhotoRow({ album_id: "album-1", status: "ready" }),
          ),
        );
      }
      return rows;
    }

    it("não apaga nada quando o Drive devolve uma listagem vazia", async () => {
      const { deps, photos, driveProvider, auditLog } = makeDeps();
      const rows = await seedPhotos(photos, 30);
      // O cenário real: administrador reconecta o Drive com a conta
      // Google errada. Com o âmbito `drive.file`, a app deixa de ver
      // qualquer ficheiro — indistinguível de "apagaram tudo à mão".
      driveProvider.state.activePhotoIds = new Set();

      const result = await syncDeletedDrivePhotos(deps);

      expect(result.photosRemoved).toBe(0);
      expect(result.connectionsSkipped).toBe(1);
      // Não é uma falha: é a precaução a funcionar.
      expect(result.connectionsFailed).toBe(0);
      for (const row of rows) {
        expect((await photos.findById(row.id))?.status).toBe("ready");
      }
      expect(auditLog.entries.at(-1)).toMatchObject({
        action: "drive_sync.aborted_unsafe",
        metadata: { reason: "drive_listing_empty" },
      });
    });

    it("não apaga nada quando falta uma fatia grande do álbum de uma só vez", async () => {
      const { deps, photos, driveProvider, auditLog } = makeDeps();
      const rows = await seedPhotos(photos, 100);
      // 40 em falta de 100: acima do teto de 20%, mas sem ser a
      // listagem toda — uma listagem truncada a meio, por exemplo.
      driveProvider.state.activePhotoIds = new Set(
        rows.slice(40).map((row) => row.id),
      );

      const result = await syncDeletedDrivePhotos(deps);

      expect(result.photosRemoved).toBe(0);
      expect(result.connectionsSkipped).toBe(1);
      expect(auditLog.entries.at(-1)).toMatchObject({
        action: "drive_sync.aborted_unsafe",
        metadata: { reason: "removal_ratio_exceeded", missingCount: 40 },
      });
    });

    it("continua a apagar quando as remoções cabem no que é credível", async () => {
      const { deps, photos, driveProvider } = makeDeps();
      const rows = await seedPhotos(photos, 100);
      // 10 em falta de 100 — dentro do teto de 20%.
      driveProvider.state.activePhotoIds = new Set(
        rows.slice(10).map((row) => row.id),
      );

      const result = await syncDeletedDrivePhotos(deps);

      expect(result.photosRemoved).toBe(10);
      expect(result.connectionsSkipped).toBe(0);
    });

    it("permite remoções isoladas em álbuns pequenos, onde 20% arredondaria a zero", async () => {
      const { deps, photos, driveProvider } = makeDeps();
      const rows = await seedPhotos(photos, 4);
      driveProvider.state.activePhotoIds = new Set(
        rows.slice(1).map((row) => row.id),
      );

      const result = await syncDeletedDrivePhotos(deps);

      expect(result.photosRemoved).toBe(1);
      expect(result.connectionsSkipped).toBe(0);
    });
  });
});
