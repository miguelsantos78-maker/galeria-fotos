import { describe, expect, it } from "vitest";
import { getDashboardStats } from "@/server/use-cases/dashboard";
import {
  createFakeAlbumsRepository,
  createFakePhotosRepository,
  createFakeUploadJobsRepository,
  makeAlbumRow,
  makePhotoRow,
  makeUploadJobRow,
} from "../fakes/repositories";

describe("getDashboardStats", () => {
  it("conta álbuns e fotografias só do dono indicado", async () => {
    const ownAlbum = makeAlbumRow({ id: "album-1", owner_id: "owner-1" });
    const otherAlbum = makeAlbumRow({ id: "album-2", owner_id: "owner-2" });
    const albums = createFakeAlbumsRepository([ownAlbum, otherAlbum]);
    const photos = createFakePhotosRepository([
      makePhotoRow({ album_id: "album-1", status: "ready" }),
      makePhotoRow({ album_id: "album-1", status: "pending_review" }),
      makePhotoRow({ album_id: "album-2", status: "ready" }),
    ]);
    const uploadJobs = createFakeUploadJobsRepository();

    const stats = await getDashboardStats("owner-1", {
      albums,
      photos,
      uploadJobs,
    });

    expect(stats.albumsCount).toBe(1);
    expect(stats.photosCount).toBe(2);
  });

  it("ordena as fotografias recentes pela data de envio, mais recente primeiro", async () => {
    const album = makeAlbumRow({ id: "album-1", owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const photos = createFakePhotosRepository([
      makePhotoRow({
        album_id: "album-1",
        original_filename: "antiga.jpg",
        uploaded_at: "2026-01-01T00:00:00.000Z",
      }),
      makePhotoRow({
        album_id: "album-1",
        original_filename: "recente.jpg",
        uploaded_at: "2026-06-01T00:00:00.000Z",
      }),
    ]);
    const uploadJobs = createFakeUploadJobsRepository();

    const stats = await getDashboardStats("owner-1", {
      albums,
      photos,
      uploadJobs,
    });

    expect(stats.recentUploads[0].filename).toBe("recente.jpg");
    expect(stats.recentUploads[0].albumTitle).toBe(album.title);
  });

  it("conta envios com falha só dos álbuns do dono", async () => {
    const ownAlbum = makeAlbumRow({ id: "album-1", owner_id: "owner-1" });
    const otherAlbum = makeAlbumRow({ id: "album-2", owner_id: "owner-2" });
    const albums = createFakeAlbumsRepository([ownAlbum, otherAlbum]);
    const photos = createFakePhotosRepository();
    const uploadJobs = createFakeUploadJobsRepository([
      makeUploadJobRow({ album_id: "album-1", status: "failed" }),
      makeUploadJobRow({ album_id: "album-1", status: "completed" }),
      makeUploadJobRow({ album_id: "album-2", status: "failed" }),
    ]);

    const stats = await getDashboardStats("owner-1", {
      albums,
      photos,
      uploadJobs,
    });

    expect(stats.failedUploadsCount).toBe(1);
  });

  it("devolve zeros quando o dono não tem álbuns", async () => {
    const albums = createFakeAlbumsRepository();
    const photos = createFakePhotosRepository();
    const uploadJobs = createFakeUploadJobsRepository();

    const stats = await getDashboardStats("owner-1", {
      albums,
      photos,
      uploadJobs,
    });

    expect(stats).toEqual({
      albumsCount: 0,
      photosCount: 0,
      recentUploads: [],
      failedUploadsCount: 0,
    });
  });
});
