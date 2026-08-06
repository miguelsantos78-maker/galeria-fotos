import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { encryptSecret } from "@/lib/security/encryption";
import { completeUpload, initiateUpload } from "@/server/use-cases/uploads";
import {
  createFakeAlbumSessionsRepository,
  createFakeAlbumsRepository,
  createFakeAuditLogRepository,
  createFakeGoogleConnectionsRepository,
  createFakePhotosRepository,
  createFakeUploadJobsRepository,
  makeAlbumRow,
  makeAlbumSessionRow,
  makeGoogleConnectionRow,
  makeUploadJobRow,
} from "../fakes/repositories";
import { createFakeDriveStorageProvider } from "../fakes/drive-provider";
import { createFakePreviewStorage } from "../fakes/preview-storage";
import { createTestJpeg } from "../fakes/test-images";
import { validServerEnv } from "../fakes/env";

const originalEnv = { ...process.env };

function makeBaseAlbum(overrides = {}) {
  return makeAlbumRow({
    id: "album-1",
    owner_id: "owner-1",
    upload_enabled: true,
    moderation_enabled: false,
    status: "published",
    drive_folder_id: "drive-folder-1",
    ...overrides,
  });
}

function makeActiveConnection(overrides = {}) {
  const { ciphertext, keyVersion } = encryptSecret("refresh-token");
  return makeGoogleConnectionRow({
    user_id: "owner-1",
    status: "active",
    root_folder_id: "root-folder-1",
    encrypted_refresh_token: ciphertext,
    token_key_version: keyVersion,
    ...overrides,
  });
}

describe("uploads use-cases", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    process.env = { ...originalEnv, ...validServerEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  describe("initiateUpload", () => {
    it("cria upload_job quando a sessão tem permissão de upload", async () => {
      const albums = createFakeAlbumsRepository([makeBaseAlbum()]);
      const sessions = createFakeAlbumSessionsRepository([
        makeAlbumSessionRow({ permissions: ["view", "upload"] }),
      ]);
      const uploadJobs = createFakeUploadJobsRepository();

      const result = await initiateUpload(
        {
          clientUploadId: "client-1",
          filename: "foto.jpg",
          expectedSize: 1000,
        },
        { albumId: "album-1", userId: "user-1" },
        { albums, sessions, uploadJobs },
      );

      expect(result.uploadId).toBeTruthy();
      expect(uploadJobs.rows).toHaveLength(1);
      expect(uploadJobs.rows[0].status).toBe("pending");
    });

    it("recusa sem sessão válida", async () => {
      const albums = createFakeAlbumsRepository([makeBaseAlbum()]);
      const sessions = createFakeAlbumSessionsRepository();
      const uploadJobs = createFakeUploadJobsRepository();

      await expect(
        initiateUpload(
          { clientUploadId: "c", filename: "f.jpg", expectedSize: 100 },
          { albumId: "album-1", userId: "user-1" },
          { albums, sessions, uploadJobs },
        ),
      ).rejects.toMatchObject({ code: "ALBUM_UPLOAD_FORBIDDEN" });
    });

    it("recusa quando a sessão não tem permissão de upload", async () => {
      const albums = createFakeAlbumsRepository([makeBaseAlbum()]);
      const sessions = createFakeAlbumSessionsRepository([
        makeAlbumSessionRow({ permissions: ["view"] }),
      ]);
      const uploadJobs = createFakeUploadJobsRepository();

      await expect(
        initiateUpload(
          { clientUploadId: "c", filename: "f.jpg", expectedSize: 100 },
          { albumId: "album-1", userId: "user-1" },
          { albums, sessions, uploadJobs },
        ),
      ).rejects.toMatchObject({ code: "ALBUM_UPLOAD_FORBIDDEN" });
    });

    it("recusa quando o álbum tem o upload desativado", async () => {
      const albums = createFakeAlbumsRepository([
        makeBaseAlbum({ upload_enabled: false }),
      ]);
      const sessions = createFakeAlbumSessionsRepository([
        makeAlbumSessionRow({ permissions: ["view", "upload"] }),
      ]);
      const uploadJobs = createFakeUploadJobsRepository();

      await expect(
        initiateUpload(
          { clientUploadId: "c", filename: "f.jpg", expectedSize: 100 },
          { albumId: "album-1", userId: "user-1" },
          { albums, sessions, uploadJobs },
        ),
      ).rejects.toMatchObject({ code: "ALBUM_UPLOAD_DISABLED" });
    });

    it("recusa ficheiro maior que o limite configurado", async () => {
      const albums = createFakeAlbumsRepository([makeBaseAlbum()]);
      const sessions = createFakeAlbumSessionsRepository([
        makeAlbumSessionRow({ permissions: ["view", "upload"] }),
      ]);
      const uploadJobs = createFakeUploadJobsRepository();

      await expect(
        initiateUpload(
          {
            clientUploadId: "c",
            filename: "f.jpg",
            expectedSize: 999_999_999,
          },
          { albumId: "album-1", userId: "user-1" },
          { albums, sessions, uploadJobs },
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_FILE_TOO_LARGE" });
    });
  });

  describe("completeUpload", () => {
    async function makeDeps(overrides: { moderationEnabled?: boolean } = {}) {
      const album = makeBaseAlbum({
        moderation_enabled: overrides.moderationEnabled ?? false,
      });
      const connection = makeActiveConnection();
      const albums = createFakeAlbumsRepository([album]);
      const sessions = createFakeAlbumSessionsRepository([
        makeAlbumSessionRow({ permissions: ["view", "upload"] }),
      ]);
      const connections = createFakeGoogleConnectionsRepository([connection]);
      const uploadJobs = createFakeUploadJobsRepository();
      const photos = createFakePhotosRepository();
      const auditLog = createFakeAuditLogRepository();
      const previewStorage = createFakePreviewStorage();
      const driveProvider = createFakeDriveStorageProvider();

      const job = await uploadJobs.insert(
        makeUploadJobRow({
          album_id: "album-1",
          user_id: "user-1",
          filename: "foto.jpg",
        }),
      );

      return {
        album,
        job,
        deps: {
          albums,
          sessions,
          connections,
          uploadJobs,
          photos,
          auditLog,
          previewStorage,
          driveProviderFactory: () => driveProvider,
        },
        driveProvider,
        previewStorage,
        uploadJobs,
        photos,
        auditLog,
      };
    }

    it("conclui o envio: Drive + derivados + linha em photos com status 'ready'", async () => {
      const { job, deps, driveProvider, previewStorage, uploadJobs, auditLog } =
        await makeDeps({ moderationEnabled: false });
      const fileBuffer = await createTestJpeg();

      const photo = await completeUpload(
        { uploadId: job.id, fileBuffer, declaredFilename: "foto.jpg" },
        { albumId: "album-1", userId: "user-1" },
        deps,
      );

      expect(photo.status).toBe("ready");
      expect(photo.drive_file_id).toBeTruthy();
      expect(photo.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(driveProvider.state.createAlbumFolderCalls).toHaveLength(0);
      expect(previewStorage.uploads.size).toBe(2);
      expect(uploadJobs.rows[0].status).toBe("completed");
      expect(auditLog.entries[0].action).toBe("photo.uploaded");
    });

    it("usa o estado 'pending_review' quando a moderação está ligada", async () => {
      const { job, deps } = await makeDeps({ moderationEnabled: true });
      const fileBuffer = await createTestJpeg();

      const photo = await completeUpload(
        { uploadId: job.id, fileBuffer, declaredFilename: "foto.jpg" },
        { albumId: "album-1", userId: "user-1" },
        deps,
      );

      expect(photo.status).toBe("pending_review");
    });

    it("rejeita um duplicado (mesmo sha256 já presente no álbum)", async () => {
      const { job, deps, photos } = await makeDeps();
      const fileBuffer = await createTestJpeg();

      const first = await completeUpload(
        { uploadId: job.id, fileBuffer, declaredFilename: "foto.jpg" },
        { albumId: "album-1", userId: "user-1" },
        deps,
      );
      expect(photos.rows).toHaveLength(1);

      const secondJob = await deps.uploadJobs.insert(
        makeUploadJobRow({ album_id: "album-1", user_id: "user-1" }),
      );

      await expect(
        completeUpload(
          {
            uploadId: secondJob.id,
            fileBuffer,
            declaredFilename: "foto-2.jpg",
          },
          { albumId: "album-1", userId: "user-1" },
          deps,
        ),
      ).rejects.toMatchObject({ code: "PHOTO_DUPLICATE" });

      expect(photos.rows).toHaveLength(1);
      expect(first.sha256).toBe(photos.rows[0].sha256);
    });

    it("recusa quando o upload_job não pertence ao álbum/utilizador", async () => {
      const { deps } = await makeDeps();
      const fileBuffer = await createTestJpeg();

      await expect(
        completeUpload(
          {
            uploadId: "job-inexistente",
            fileBuffer,
            declaredFilename: "f.jpg",
          },
          { albumId: "album-1", userId: "user-1" },
          deps,
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_JOB_NOT_FOUND" });
    });

    it("recusa quando o upload_job já está concluído", async () => {
      const { job, deps } = await makeDeps();
      await deps.uploadJobs.update(job.id, { status: "completed" });
      const fileBuffer = await createTestJpeg();

      await expect(
        completeUpload(
          { uploadId: job.id, fileBuffer, declaredFilename: "f.jpg" },
          { albumId: "album-1", userId: "user-1" },
          deps,
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_JOB_ALREADY_COMPLETED" });
    });

    it("recusa quando o upload_job expirou", async () => {
      const { job, deps } = await makeDeps();
      await deps.uploadJobs.update(job.id, {
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const fileBuffer = await createTestJpeg();

      await expect(
        completeUpload(
          { uploadId: job.id, fileBuffer, declaredFilename: "f.jpg" },
          { albumId: "album-1", userId: "user-1" },
          deps,
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_JOB_EXPIRED" });
    });

    it("recusa quando o dono do álbum não tem ligação Google Drive ativa", async () => {
      const album = makeBaseAlbum();
      const albums = createFakeAlbumsRepository([album]);
      const sessions = createFakeAlbumSessionsRepository([
        makeAlbumSessionRow({ permissions: ["view", "upload"] }),
      ]);
      const connections = createFakeGoogleConnectionsRepository();
      const uploadJobs = createFakeUploadJobsRepository();
      const photos = createFakePhotosRepository();
      const auditLog = createFakeAuditLogRepository();
      const previewStorage = createFakePreviewStorage();

      const job = await uploadJobs.insert(
        makeUploadJobRow({ album_id: "album-1", user_id: "user-1" }),
      );
      const fileBuffer = await createTestJpeg();

      await expect(
        completeUpload(
          { uploadId: job.id, fileBuffer, declaredFilename: "f.jpg" },
          { albumId: "album-1", userId: "user-1" },
          {
            albums,
            sessions,
            connections,
            uploadJobs,
            photos,
            auditLog,
            previewStorage,
          },
        ),
      ).rejects.toMatchObject({ code: "GOOGLE_DRIVE_NOT_CONNECTED" });

      expect(uploadJobs.rows[0].status).toBe("failed");
    });

    it("limpa o ficheiro do Drive se a gravação do preview falhar", async () => {
      const { job, deps, driveProvider, previewStorage, uploadJobs, photos } =
        await makeDeps();
      previewStorage.failNextUpload = true;
      const fileBuffer = await createTestJpeg();

      await expect(
        completeUpload(
          { uploadId: job.id, fileBuffer, declaredFilename: "f.jpg" },
          { albumId: "album-1", userId: "user-1" },
          deps,
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_STORAGE_FAILED" });

      expect(driveProvider.state.deletedFileIds).toHaveLength(1);
      expect(uploadJobs.rows[0].status).toBe("failed");
      expect(photos.rows).toHaveLength(0);
    });

    it("recusa um ficheiro que não é uma imagem suportada", async () => {
      const { job, deps } = await makeDeps();
      const fileBuffer = Buffer.from("não é uma imagem", "utf8");

      await expect(
        completeUpload(
          { uploadId: job.id, fileBuffer, declaredFilename: "f.txt" },
          { albumId: "album-1", userId: "user-1" },
          deps,
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_UNSUPPORTED_TYPE" });
    });

    it("recusa um ficheiro vazio", async () => {
      const { job, deps } = await makeDeps();

      await expect(
        completeUpload(
          {
            uploadId: job.id,
            fileBuffer: Buffer.alloc(0),
            declaredFilename: "f.jpg",
          },
          { albumId: "album-1", userId: "user-1" },
          deps,
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_FILE_EMPTY" });
    });
  });
});
