import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { verifyGoogleDriveConnection } from "@/server/use-cases/google-drive-connection";
import { toPublicGoogleConnection } from "@/lib/google-drive/public-connection";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

/**
 * Não faz parte da lista "principal" da secção 14, mas é o que dá corpo
 * a "estado da ligação ao Google Drive" / "verificação e reconexão"
 * (secções 10.4 e 22, Fase 3) — chamado a pedido do admin, não em cada
 * carregamento da página, para não bater no Google a cada visita.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const body = (await request.json().catch(() => null)) as { connectionId?: unknown } | null;

    if (typeof body?.connectionId !== "string" || !body.connectionId) {
      throw new AppError("VALIDATION_ERROR", "connectionId em falta.", 400);
    }

    const supabase = createSupabaseAdminClient();
    const connection = await verifyGoogleDriveConnection(body.connectionId, profile.id, {
      connections: createGoogleConnectionsRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
    });

    return jsonOk(toPublicGoogleConnection(connection));
  } catch (error) {
    return jsonError(error, requestId);
  }
}
