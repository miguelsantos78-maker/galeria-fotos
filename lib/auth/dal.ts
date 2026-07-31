import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getServerEnv } from "@/lib/env";
import { isAdmin } from "@/lib/auth/admin";
import { AppError } from "@/lib/api/response";
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
  // .schema("public") explícito: contorna uma resolução de tipos que, sem
  // isto, faz o cliente Supabase inferir "never" para tabelas (ver
  // docs/decisions/0003-fase-2-albuns-partilha.md).
  const { data } = await supabase
    .schema("public")
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
});

/**
 * Garante que o pedido atual pertence a um administrador. Redireciona
 * para o login caso contrário. Usar apenas em Server Components (Page/
 * Layout) — `redirect()` funciona lançando um sinal especial que só a
 * própria framework deve apanhar. Para Route Handlers, usar
 * `requireAdminApi()`.
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

/**
 * Equivalente a `requireAdmin()` para Route Handlers de API: nunca
 * chama `redirect()` (que devolveria HTML a um cliente que espera
 * JSON, e que um `try/catch` à volta apanharia incorretamente — ver
 * a documentação do Next.js sobre `redirect()` em Route Handlers).
 * Lança `AppError`, que `lib/api/response.ts#jsonError()` converte na
 * resposta 401 padrão.
 */
export async function requireAdminApi(): Promise<Profile> {
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
    throw new AppError(
      "UNAUTHORIZED",
      "Sessão administrativa necessária.",
      401,
    );
  }

  return profile;
}
