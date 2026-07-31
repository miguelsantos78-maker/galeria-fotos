import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cliente Supabase para Server Components, Route Handlers e Server
 * Actions. Usa a sessão do utilizador (via cookies), respeitando RLS —
 * nunca ignora as políticas de segurança da base de dados.
 *
 * Criar uma instância nova por pedido; nunca partilhar entre pedidos.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Chamado a partir de um Server Component: não é possível
            // escrever cookies aqui. O proxy.ts renova a sessão nesse
            // caso, através de lib/auth/update-session.ts.
          }
        },
      },
    },
  );
}
