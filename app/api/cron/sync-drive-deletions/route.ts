import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { createSupabasePreviewStorage } from "@/lib/media/preview-storage";
import { createAlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import { createUploadJobsRepository } from "@/server/repositories/upload-jobs-repository";
import { syncDeletedDrivePhotos } from "@/server/use-cases/drive-sync";
import { cleanupExpiredRecords } from "@/server/use-cases/maintenance";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

export const maxDuration = 60;

/**
 * Manutenção diária, chamada pela Vercel (ver vercel.json). Faz duas
 * coisas independentes:
 *
 * 1. Reflete na aplicação fotografias apagadas diretamente no Google
 *    Drive (secção 25 — exceção pedida explicitamente pelo
 *    administrador; ver server/use-cases/drive-sync.ts).
 * 2. Limpa registos temporários já sem uso (`album_sessions`,
 *    `upload_jobs` — ver server/use-cases/maintenance.ts).
 *
 * O caminho continua "sync-drive-deletions" por já estar configurado
 * em vercel.json e no ambiente de produção; o plano Hobby da Vercel
 * limita o número de Cron Jobs, por isso as duas tarefas partilham
 * deliberadamente o mesmo agendamento em vez de terem um cada.
 *
 * Protegido pelo cabeçalho "Authorization: Bearer <CRON_SECRET>" que a
 * Vercel injeta automaticamente nos Cron Jobs — fecha por omissão se a
 * variável não estiver configurada, nunca corre "aberto".
 */
export async function GET(request: Request) {
  const requestId = newRequestId();

  try {
    const env = getServerEnv();
    if (!env.CRON_SECRET) {
      throw new AppError(
        "CRON_NOT_CONFIGURED",
        "CRON_SECRET não está configurado.",
        503,
      );
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      throw new AppError("UNAUTHORIZED", "Pedido não autorizado.", 401);
    }

    const supabase = createSupabaseAdminClient();

    const driveSync = await syncDeletedDrivePhotos({
      connections: createGoogleConnectionsRepository(supabase),
      albums: createAlbumsRepository(supabase),
      photos: createPhotosRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
      previewStorage: createSupabasePreviewStorage(supabase),
    });

    // Corre depois da sincronização, não em paralelo: são tarefas
    // independentes, mas partilham o mesmo orçamento de 60s desta
    // função — sequencial é mais fácil de atribuir a um timeout.
    const cleanup = await cleanupExpiredRecords({
      sessions: createAlbumSessionsRepository(supabase),
      uploadJobs: createUploadJobsRepository(supabase),
    });

    return jsonOk({ driveSync, cleanup });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
