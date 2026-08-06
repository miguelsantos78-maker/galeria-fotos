import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { disconnectGoogleDriveConnection } from "@/server/use-cases/google-drive-connection";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

export async function POST(request: Request) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const body = (await request.json().catch(() => null)) as {
      connectionId?: unknown;
    } | null;

    if (typeof body?.connectionId !== "string" || !body.connectionId) {
      throw new AppError("VALIDATION_ERROR", "connectionId em falta.", 400);
    }

    const supabase = createSupabaseAdminClient();
    await disconnectGoogleDriveConnection(body.connectionId, profile.id, {
      connections: createGoogleConnectionsRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
    });

    return jsonOk({ disconnected: true });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
