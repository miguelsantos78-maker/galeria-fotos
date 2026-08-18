import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import type { Database } from "@/lib/db/database.types";

/**
 * Testes do repositório contra o cliente Supabase **real**, com o
 * `fetch` substituído. Não é um duplo do PostgREST: a cardinalidade de
 * `maybeSingle()` é validada dentro do `@supabase/postgrest-js`, por
 * isso é exatamente essa a lógica que aqui se exercita.
 */
function createClientWithStubbedFetch(rows: unknown[]): {
  client: SupabaseClient<Database>;
  urls: string[];
} {
  const urls: string[] = [];

  const client = createClient<Database>(
    "https://stub.supabase.co",
    "chave-de-teste",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();
          urls.push(url);

          // Honra o `limit`, como o PostgREST faz. Sem isto o duplo
          // devolveria sempre tudo e o teste provaria o contrário do
          // que interessa: que `limit(1)` corta o resultado na origem.
          const limit = new URL(url).searchParams.get("limit");
          const body = limit === null ? rows : rows.slice(0, Number(limit));

          return Promise.resolve(
            new Response(JSON.stringify(body), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        },
      },
    },
  );

  return { client, urls };
}

function makeRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "photo-1",
    album_id: "album-1",
    sha256: "abc",
    uploaded_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    status: "ready",
    ...overrides,
  };
}

describe("photosRepository.findByAlbumAndSha256", () => {
  it("limita a consulta a uma linha, porque (album_id, sha256) não é único", async () => {
    const { client, urls } = createClientWithStubbedFetch([makeRow({})]);

    await createPhotosRepository(client).findByAlbumAndSha256("album-1", "abc");

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("limit=1");
  });

  it("não rebenta quando o mesmo sha256 aparece em duas linhas do álbum", async () => {
    // O cenário: a deteção de duplicados é verifica-depois-insere, por
    // isso dois envios simultâneos da mesma imagem criam duas linhas.
    // Sem `limit(1)`, `maybeSingle()` devolvia PGRST116 e o envio
    // passava a falhar com um erro não mapeado — para sempre, e não só
    // nesse envio. Ver docs/decisions/0044.
    const { client } = createClientWithStubbedFetch([
      makeRow({ id: "photo-original", uploaded_at: "2026-01-01T10:00:00Z" }),
      makeRow({ id: "photo-duplicada", uploaded_at: "2026-01-01T10:00:01Z" }),
    ]);

    const found = await createPhotosRepository(client).findByAlbumAndSha256(
      "album-1",
      "abc",
    );

    // E devolve a primeira que entrou, a original.
    expect(found?.id).toBe("photo-original");
  });

  it("devolve null quando não há nenhuma com esse sha256", async () => {
    const { client } = createClientWithStubbedFetch([]);

    const found = await createPhotosRepository(client).findByAlbumAndSha256(
      "album-1",
      "abc",
    );

    expect(found).toBeNull();
  });
});
