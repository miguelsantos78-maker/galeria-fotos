import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "./database.types";

let cachedClient: SupabaseClient<Database> | undefined;

/**
 * Cliente Supabase com a service role key: ignora RLS por completo.
 *
 * Usar apenas em código de servidor (casos de uso / Route Handlers) que
 * já validou explicitamente a autorização do pedido. Nunca importar este
 * módulo a partir de um Client Component nem devolver este cliente (ou
 * a chave) ao browser.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient;

  const env = getServerEnv();

  cachedClient = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return cachedClient;
}
