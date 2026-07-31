import type { ProfileRole } from "@/lib/db/database.types";

export interface AdminCheckInput {
  email: string | null | undefined;
  role: ProfileRole | null | undefined;
  adminEmails: readonly string[];
}

/**
 * Um utilizador é administrador se o seu perfil tiver role='admin' OU se
 * o email estiver na lista de bootstrap ADMIN_EMAILS (secção 6.1 do
 * CLAUDE.md). Função pura para ser testável sem base de dados.
 */
export function isAdmin({
  email,
  role,
  adminEmails,
}: AdminCheckInput): boolean {
  if (role === "admin") return true;
  if (!email) return false;
  return adminEmails.includes(email.trim().toLowerCase());
}
