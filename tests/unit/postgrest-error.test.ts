import { describe, expect, it } from "vitest";
import { toPostgrestError } from "@/lib/db/postgrest-error";
import { createPhotosRepository } from "@/server/repositories/photos-repository";

describe("toPostgrestError", () => {
  it("devolve instâncias de Error inalteradas", () => {
    const original = new Error("violação de restrição");
    expect(toPostgrestError(original)).toBe(original);
  });

  it("converte o objeto simples de uma falha de rede do PostgREST numa Error com mensagem legível", () => {
    // Forma real devolvida por `PostgrestBuilder.then()` quando o
    // `fetch` para o Supabase falha ao nível da rede (timeout, ligação
    // interrompida) — não é uma instância de `PostgrestError`.
    const networkFailure = {
      message: "FetchError: fetch failed",
      details: "TypeError: fetch failed\n\nCaused by: Error: aborted",
      hint: "",
      code: "",
    };

    const result = toPostgrestError(networkFailure);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("FetchError: fetch failed");
  });

  it("usa uma mensagem por omissão quando o objeto nem sequer tem 'message'", () => {
    const result = toPostgrestError({ code: "23505" });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe(
      "Falha de rede ao comunicar com a base de dados.",
    );
  });

  it("tolera valores que não são objetos", () => {
    expect(toPostgrestError("boom")).toBeInstanceOf(Error);
    expect(toPostgrestError(null)).toBeInstanceOf(Error);
    expect(toPostgrestError(undefined)).toBeInstanceOf(Error);
  });
});

/**
 * Prova de ponta a ponta do incidente real: um `insert()` que falha ao
 * nível da rede lança uma `Error` de verdade, não o objeto simples que
 * `supabase-js` devolve nesse caso — sem isto, `lib/api/response.ts`
 * não conseguia extrair mensagem nenhuma do erro (`"[object Object]"`
 * nos logs de produção).
 */
describe("createPhotosRepository — normalização de erros de rede", () => {
  function makeFakeSupabaseClientWithNetworkFailure() {
    const networkFailure = {
      message: "FetchError: fetch failed",
      details: "",
      hint: "",
      code: "",
    };
    const builder = {
      insert: () => builder,
      select: () => builder,
      single: () => Promise.resolve({ data: null, error: networkFailure }),
    };
    return {
      schema: () => ({ from: () => builder }),
    } as unknown as Parameters<typeof createPhotosRepository>[0];
  }

  it("lança uma Error (não um objeto simples) quando o insert falha por rede", async () => {
    const repository = createPhotosRepository(
      makeFakeSupabaseClientWithNetworkFailure(),
    );

    let caught: unknown;
    try {
      await repository.insert({
        id: "photo-1",
        album_id: "album-1",
        drive_file_id: "file-1",
        drive_folder_id: "folder-1",
        original_filename: "foto.jpg",
        safe_filename: "foto.jpg",
        mime_type: "image/jpeg",
        file_size: 1,
        status: "ready",
      } as Parameters<typeof repository.insert>[0]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("FetchError: fetch failed");
  });
});
