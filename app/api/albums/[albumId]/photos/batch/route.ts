import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { createSupabasePreviewStorage } from "@/lib/media/preview-storage";
import { batchModeratePhotos } from "@/server/use-cases/moderation";
import { batchModerateSchema } from "@/lib/validation/photo";
import { jsonError, jsonOk, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ albumId: string }>;
}

/**
 * Ações em lote (secção 10.4) — fora da lista "principal" da secção 14,
 * tal como os outros endpoints de administração já acrescentados nas
 * fases anteriores. Nunca falha tudo por causa de uma fotografia: devolve
 * sempre os ids que tiveram sucesso e os que falharam, com o motivo.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { albumId } = await params;
    const input = batchModerateSchema.parse(await request.json());

    const supabase = createSupabaseAdminClient();
    const result = await batchModeratePhotos(albumId, profile.id, input, {
      albums: createAlbumsRepository(supabase),
      photos: createPhotosRepository(supabase),
      connections: createGoogleConnectionsRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
      previewStorage: createSupabasePreviewStorage(supabase),
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
