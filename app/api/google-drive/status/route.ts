import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { getConnectionStatusForOwner } from "@/server/use-cases/google-drive-connection";
import { toPublicGoogleConnection } from "@/lib/google-drive/public-connection";
import { jsonError, jsonOk, newRequestId } from "@/lib/api/response";

/**
 * Não faz parte da lista "principal" da secção 14: dá à UI de admin o
 * estado atual da ligação (secção 10.4) sem bater no Google a cada
 * carregamento — só lê o que já está guardado na base de dados.
 */
export async function GET() {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const supabase = createSupabaseAdminClient();
    const connection = await getConnectionStatusForOwner(profile.id, {
      connections: createGoogleConnectionsRepository(supabase),
    });

    return jsonOk(connection ? toPublicGoogleConnection(connection) : null);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
