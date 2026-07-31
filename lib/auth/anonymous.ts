import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

/**
 * Garante que o browser tem uma sessão anónima do Supabase antes de
 * aceder a um álbum partilhado (secção 6.3 do CLAUDE.md). Reutiliza a
 * sessão existente sempre que possível, em vez de criar uma nova a cada
 * visita.
 */
export async function ensureAnonymousSession() {
  const supabase = createSupabaseBrowserClient();

  const {
    data: { session: existingSession },
  } = await supabase.auth.getSession();

  if (existingSession) return existingSession;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;

  return data.session;
}
