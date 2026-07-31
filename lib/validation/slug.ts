/**
 * Converte um título em slug URL-safe: minúsculas, sem diacríticos,
 * separado por hífens. Não garante unicidade — isso é responsabilidade
 * de quem persiste (ver server/use-cases/albums.ts).
 */
export function slugify(input: string): string {
  const withoutDiacritics = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const base = withoutDiacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "album";
}

/** Sufixo curto e aleatório para resolver colisões de slug. */
export function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
