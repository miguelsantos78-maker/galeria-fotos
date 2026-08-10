import "server-only";

/**
 * Normaliza o `error` devolvido por uma chamada `supabase-js`/PostgREST
 * antes de o lançar.
 *
 * Na maioria dos casos (erro do Postgres — violação de restrição,
 * política RLS, etc.) `error` já é uma instância de `PostgrestError`,
 * que estende `Error`. MAS numa falha ao nível da rede (timeout,
 * ligação interrompida a meio, cabeçalhos demasiado grandes —
 * `@supabase/postgrest-js`, `PostgrestBuilder.then()`, ramo
 * `!shouldThrowOnError`), a biblioteca devolve um **objeto simples**
 * `{ message, details, hint, code }`, não uma instância de `Error`.
 *
 * Sem esta normalização, `throw error` lançava esse objeto tal e qual.
 * Como `lib/api/response.ts` só sabe extrair `.message` de instâncias
 * de `Error` (`error instanceof Error ? error.message : String(error)`),
 * o resultado era um log opaco (`"[object Object]"`) e nenhuma pista do
 * que realmente falhou — foi assim que uma falha transitória de rede a
 * meio de um envio ficou impossível de diagnosticar a partir dos logs.
 *
 * Cada `repository` chama isto em vez de `throw error` diretamente.
 */
export function toPostgrestError(error: unknown): Error {
  if (error instanceof Error) return error;

  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const message =
      typeof candidate.message === "string" && candidate.message
        ? candidate.message
        : "Falha de rede ao comunicar com a base de dados.";
    const normalized = new Error(message);
    normalized.name = "PostgrestNetworkError";
    // Preserva o resto do contexto (code/details/hint) para quem
    // inspecionar o erro mais tarde, sem depender dele para o essencial:
    // um `Error` com mensagem legível.
    Object.assign(normalized, {
      code: candidate.code,
      details: candidate.details,
      hint: candidate.hint,
    });
    return normalized;
  }

  return new Error(String(error));
}
