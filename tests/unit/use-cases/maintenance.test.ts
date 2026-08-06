import { describe, expect, it } from "vitest";
import { cleanupExpiredRecords } from "@/server/use-cases/maintenance";
import {
  createFakeAlbumSessionsRepository,
  createFakeUploadJobsRepository,
  makeAlbumSessionRow,
  makeUploadJobRow,
} from "../fakes/repositories";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_MS).toISOString();

describe("cleanupExpiredRecords", () => {
  it("apaga sessões expiradas há mais de 7 dias e mantém as recentes", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ expires_at: daysAgo(30) }),
      makeAlbumSessionRow({ expires_at: daysAgo(10) }),
      // Expirou há pouco: fica, para ainda se poder diagnosticar.
      makeAlbumSessionRow({ expires_at: daysAgo(2) }),
      // Ainda válida.
      makeAlbumSessionRow({ expires_at: daysAgo(-1) }),
    ]);
    const uploadJobs = createFakeUploadJobsRepository();

    const result = await cleanupExpiredRecords({ sessions, uploadJobs });

    expect(result.deletedAlbumSessions).toBe(2);
    expect(sessions.rows).toHaveLength(2);
  });

  it("apaga envios terminados há mais de 7 dias, mas nunca os que ainda estão em curso", async () => {
    const sessions = createFakeAlbumSessionsRepository();
    const uploadJobs = createFakeUploadJobsRepository([
      makeUploadJobRow({ status: "completed", created_at: daysAgo(30) }),
      makeUploadJobRow({ status: "failed", created_at: daysAgo(30) }),
      makeUploadJobRow({ status: "expired", created_at: daysAgo(30) }),
      // Antigo mas ainda por concluir: nunca apagar.
      makeUploadJobRow({ status: "uploading", created_at: daysAgo(30) }),
      makeUploadJobRow({ status: "pending", created_at: daysAgo(30) }),
      // Terminado mas recente: fica.
      makeUploadJobRow({ status: "completed", created_at: daysAgo(1) }),
    ]);

    const result = await cleanupExpiredRecords({ sessions, uploadJobs });

    expect(result.deletedUploadJobs).toBe(3);
    expect(uploadJobs.rows.map((row) => row.status).sort()).toEqual([
      "completed",
      "pending",
      "uploading",
    ]);
  });

  it("não apaga nada quando não há registos antigos", async () => {
    const sessions = createFakeAlbumSessionsRepository([
      makeAlbumSessionRow({ expires_at: daysAgo(-1) }),
    ]);
    const uploadJobs = createFakeUploadJobsRepository([
      makeUploadJobRow({ status: "completed", created_at: daysAgo(1) }),
    ]);

    const result = await cleanupExpiredRecords({ sessions, uploadJobs });

    expect(result).toEqual({
      deletedAlbumSessions: 0,
      deletedUploadJobs: 0,
    });
  });
});
