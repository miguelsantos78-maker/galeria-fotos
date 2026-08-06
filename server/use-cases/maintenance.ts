import "server-only";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type { UploadJobsRepository } from "@/server/repositories/upload-jobs-repository";
import { logger } from "@/lib/observability/logger";

/**
 * Só apaga registos expirados/terminados há mais do que isto, em vez de
 * apagar tudo o que já expirou: dá margem para diagnosticar um problema
 * recente (porque é que uma sessão caducou, porque é que um envio
 * falhou) antes de a linha desaparecer.
 */
const RETENTION_DAYS = 7;

export interface MaintenanceResult {
  deletedAlbumSessions: number;
  deletedUploadJobs: number;
}

interface MaintenanceDeps {
  sessions: Pick<AlbumSessionsRepository, "deleteExpiredBefore">;
  uploadJobs: Pick<UploadJobsRepository, "deleteFinishedBefore">;
}

/**
 * Limpeza periódica de registos temporários (secção 15: "limpar
 * ficheiros parciais e registos falhados"). Ambas as tabelas crescem
 * com o uso normal e nunca encolhem sozinhas:
 *
 * - `album_sessions`: cada abertura de um link de partilha insere uma
 *   linha nova (`resolve-album.ts`), por isso um evento com muitos
 *   convidados a recarregar a página acumula rapidamente milhares de
 *   linhas sem uso depois de expirarem.
 * - `upload_jobs`: uma linha por ficheiro enviado, que deixa de ter
 *   utilidade assim que o envio termina (as fotografias vivem em
 *   `photos`, não aqui).
 *
 * Nunca toca em `photos`, `albums` nem em nada no Drive/Storage — só
 * remove registos temporários já sem efeito.
 */
export async function cleanupExpiredRecords(
  deps: MaintenanceDeps,
): Promise<MaintenanceResult> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [deletedAlbumSessions, deletedUploadJobs] = await Promise.all([
    deps.sessions.deleteExpiredBefore(cutoff),
    deps.uploadJobs.deleteFinishedBefore(cutoff),
  ]);

  logger.info({
    operation: "maintenance.cleanupExpiredRecords",
    deletedAlbumSessions,
    deletedUploadJobs,
    retentionDays: RETENTION_DAYS,
  });

  return { deletedAlbumSessions, deletedUploadJobs };
}
