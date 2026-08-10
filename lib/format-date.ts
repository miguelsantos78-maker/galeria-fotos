/**
 * Formata a data de um evento por extenso (ex.: "17 de agosto de
 * 2026") — partilhado entre o painel de administração e o cabeçalho da
 * galeria pública, para as duas leituras da mesma data nunca
 * divergirem em formato.
 */
export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
