import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getServerEnv } from "@/lib/env";
import { isAdmin } from "@/lib/auth/admin";
import type { Database } from "@/lib/db/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Confirma a sessão junto do Supabase Auth (nunca confia apenas no
 * cookie) e devolve o utilizador autenticado, ou `null`.
 */
export const verifySession = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
});

/**
 * Devolve o perfil (profiles) do utilizador autenticado, ou `null` se
 * não existir sessão ou se for um convidado anónimo (que nunca tem
 * linha em "profiles").
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await verifySession();
  if (!user || user.is_anonymous) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
});

/**
 * Garante que o pedido atual pertence a um administrador. Redireciona
 * para o login caso contrário. Usar no topo de páginas/Route Handlers
 * administrativos — nunca confiar apenas numa verificação no cliente.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  const env = getServerEnv();

  if (
    !profile ||
    !isAdmin({
      email: profile.email,
      role: profile.role,
      adminEmails: env.ADMIN_EMAILS,
    })
  ) {
    redirect("/admin/login");
  }

  return profile;
}
