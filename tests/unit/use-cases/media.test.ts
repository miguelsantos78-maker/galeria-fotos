import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { encryptSecret } from "@/lib/security/encryption";
import { getOriginalForViewer } from "@/server/use-cases/media";
import {
  createFakeAlbumSessionsRepository,
  createFakeAlbumsRepository,
  createFakeGoogleConnectionsRepository,
  createFakePhotosRepository,
  makeAlbumRow,
  makeAlbumSessionRow,
  makeGoogleConnectionRow,
  makePhotoRow,
} from "../fakes/repositories";
import { createFakeDriveStorageProvider } from "../fakes/drive-provider";
import { validServerEnv } from "../fakes/env";

const originalEnv = { ...process.env };

function makeDeps(
  overrides: {
    albumOverrides?: Parameters<typeof makeAlbumRow>[0];
    photoOverrides?: Parameters<typeof makePhotoRow>[0];
    sessionOverrides?: Parameters<typeof makeAlbumSessionRow>[0] | null;
    withConnection?: boolean;
  } = {},
) {
  const album = makeAlbumRow({
    id: "album-1",
    owner_id: "owner-1",
    download_enabled: true,
    ...overrides.albumOverrides,
  });
  const photo = makePhotoRow({
    id: "photo-1",
    album_id: "album-1",
    status: "ready",
    drive_file_id: "drive-file-1",
    ...overrides.photoOverrides,
  });

  const albums = createFakeAlbumsRepository([album]);
  const photos = createFakePhotosRepository([photo]);
  const sessions = createFakeAlbumSessionsRepository(
    overrides.sessionOverrides === null
      ? []
      : [
          makeAlbumSessionRow({
            album_id: "album-1",
            user_id: "user-1",
            permissions: ["view"],
            ...overrides.sessionOverrides,
          }),
        ],
  );

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
  driveProvider.state.originalContentByFileId.set(
    "drive-file-1",
    Buffer.from("bytes do original"),
  );

  return {
    album,
    photo,
    driveProvider,
    deps: {
      albums,
      photos,
      sessions,
      connections,
      driveProviderFactory: () => driveProvider,
    },
  };
}

describe("getOriginalForViewer", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    process.env = { ...originalEnv, ...validServerEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  it("devolve o stream do original quando a sessão é válida e o download está ativado", async () => {
    const { deps } = makeDeps();

    const media = await getOriginalForViewer("photo-1", "user-1", deps);

    expect(media.mimeType).toBe("image/jpeg");
    expect(media.filename).toBeTruthy();

    const chunks: Buffer[] = [];
    for await (const chunk of media.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe("bytes do original");
  });

  it("lança PHOTO_NOT_FOUND para uma fotografia inexistente", async () => {
    const { deps } = makeDeps();

    await expect(
      getOriginalForViewer("photo-inexistente", "user-1", deps),
    ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" });
  });

  it("lança PHOTO_NOT_FOUND para uma fotografia eliminada", async () => {
    const { deps } = makeDeps({
      photoOverrides: { deleted_at: new Date().toISOString() },
    });

    await expect(
      getOriginalForViewer("photo-1", "user-1", deps),
    ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" });
  });

  it("lança ALBUM_SESSION_INVALID sem sessão válida", async () => {
    const { deps } = makeDeps({ sessionOverrides: null });

    await expect(
      getOriginalForViewer("photo-1", "user-1", deps),
    ).rejects.toMatchObject({ code: "ALBUM_SESSION_INVALID" });
  });

  it("nunca revela uma fotografia pending_review sem permissão de moderação (mesmo erro de 'não encontrada')", async () => {
    const { deps } = makeDeps({
      photoOverrides: { status: "pending_review" },
      sessionOverrides: { permissions: ["view"] },
    });

    await expect(
      getOriginalForViewer("photo-1", "user-1", deps),
    ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" });
  });

  it("permite pending_review com permissão de moderação", async () => {
    const { deps } = makeDeps({
      photoOverrides: { status: "pending_review" },
      sessionOverrides: { permissions: ["view", "moderate"] },
    });

    const media = await getOriginalForViewer("photo-1", "user-1", deps);
    expect(media.mimeType).toBe("image/jpeg");
  });

  it("lança ALBUM_DOWNLOAD_DISABLED quando o álbum tem a transferência desativada", async () => {
    const { deps } = makeDeps({
      albumOverrides: { download_enabled: false },
    });

    await expect(
      getOriginalForViewer("photo-1", "user-1", deps),
    ).rejects.toMatchObject({ code: "ALBUM_DOWNLOAD_DISABLED" });
  });

  it("lança GOOGLE_DRIVE_NOT_CONNECTED sem ligação ativa do dono do álbum", async () => {
    const { deps } = makeDeps({ withConnection: false });

    await expect(
      getOriginalForViewer("photo-1", "user-1", deps),
    ).rejects.toMatchObject({ code: "GOOGLE_DRIVE_NOT_CONNECTED" });
  });
});
