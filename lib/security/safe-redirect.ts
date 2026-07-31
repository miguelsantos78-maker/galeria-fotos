/**
 * Valida um destino de redirecionamento fornecido pelo cliente (por
 * exemplo, o parâmetro "next" do login), aceitando apenas caminhos
 * relativos internos. Previne open-redirect (ex.: "//evil.com" ou
 * "https://evil.com").
 */
export function sanitizeRedirectPath(
  path: string | null | undefined,
  fallback = "/admin",
): string {
  if (!path) return fallback;
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  return path;
}
