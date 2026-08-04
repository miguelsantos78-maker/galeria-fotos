import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { createSupabasePreviewStorage } from "@/lib/media/preview-storage";
import { syncDeletedDrivePhotos } from "@/server/use-cases/drive-sync";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

export const maxDuration = 60;

/**
 * Chamado periodicamente pela Vercel (ver vercel.json) para refletir na
 * aplicação fotografias apagadas diretamente no Google Drive (secção
 * 25 — exceção pedida explicitamente pelo administrador; ver
 * server/use-cases/drive-sync.ts). Protegido pelo cabeçalho
 * "Authorization: Bearer <CRON_SECRET>" que a Vercel injeta
 * automaticamente nos Cron Jobs — fecha por omissão se a variável não
 * estiver configurada, nunca corre "aberto".
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
    const result = await syncDeletedDrivePhotos({
      connections: createGoogleConnectionsRepository(supabase),
      albums: createAlbumsRepository(supabase),
      photos: createPhotosRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
      previewStorage: createSupabasePreviewStorage(supabase),
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
