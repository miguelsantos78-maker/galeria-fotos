import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSignedPreviewUrls,
  resetPreviewUrlCacheForTests,
} from "@/lib/media/preview-url";

/**
 * Cliente Supabase mínimo: só o que `createSignedPreviewUrls` toca.
 * Cada assinatura devolve um token diferente, tal como o Supabase real
 * — é precisamente isso que quebrava a cache do browser.
 */
function makeClient() {
  let signCallCount = 0;
  const signedPathsPerCall: string[][] = [];

  const client = {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          signCallCount += 1;
          signedPathsPerCall.push(paths);
          return {
            data: paths.map((path) => ({
              path,
              signedUrl: `https://storage.example/${path}?token=jwt-${signCallCount}`,
              error: null,
            })),
            error: null,
          };
        },
      }),
    },
  };

  return {
    client: client as unknown as Parameters<typeof createSignedPreviewUrls>[0],
    get signCallCount() {
      return signCallCount;
    },
    signedPathsPerCall,
  };
}

beforeEach(() => {
  resetPreviewUrlCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetPreviewUrlCacheForTests();
});

describe("createSignedPreviewUrls", () => {
  it("assina os caminhos pedidos e devolve-os indexados pelo caminho", async () => {
    const { client } = makeClient();

    const result = await createSignedPreviewUrls(client, ["a.webp", "b.webp"]);

    expect(result.get("a.webp")).toContain("a.webp");
    expect(result.get("b.webp")).toContain("b.webp");
  });

  it("devolve o MESMO URL em pedidos seguidos — é o que faz a cache do browser acertar", async () => {
    const { client, signedPathsPerCall } = makeClient();

    const first = await createSignedPreviewUrls(client, ["a.webp"]);
    const second = await createSignedPreviewUrls(client, ["a.webp"]);

    // Sem reaproveitamento, cada chamada devolvia um `?token=` novo — um
    // URL diferente é uma chave de cache diferente, por isso o browser
    // voltava a descarregar a mesma miniatura a cada abertura da galeria.
    expect(second.get("a.webp")).toBe(first.get("a.webp"));
    expect(signedPathsPerCall).toHaveLength(1);
  });

  it("só assina o que ainda não tem URL válido", async () => {
    const { client, signedPathsPerCall } = makeClient();

    await createSignedPreviewUrls(client, ["a.webp", "b.webp"]);
    await createSignedPreviewUrls(client, ["b.webp", "c.webp"]);

    expect(signedPathsPerCall[0]).toEqual(["a.webp", "b.webp"]);
    // Só o "c.webp" era novo.
    expect(signedPathsPerCall[1]).toEqual(["c.webp"]);
  });

  it("volta a assinar quando o URL guardado está perto de expirar", async () => {
    vi.useFakeTimers();
    const { client, signedPathsPerCall } = makeClient();

    const first = await createSignedPreviewUrls(client, ["a.webp"]);

    // TTL de 1h, margem de segurança de 10min: aos 55 minutos já não
    // sobra tempo suficiente para entregar este URL a mais alguém.
    vi.advanceTimersByTime(55 * 60 * 1000);
    const later = await createSignedPreviewUrls(client, ["a.webp"]);

    expect(later.get("a.webp")).not.toBe(first.get("a.webp"));
    expect(signedPathsPerCall).toHaveLength(2);
  });

  it("não assina duas vezes o mesmo caminho repetido no mesmo pedido", async () => {
    const { client, signedPathsPerCall } = makeClient();

    await createSignedPreviewUrls(client, ["a.webp", "a.webp", "b.webp"]);

    expect(signedPathsPerCall[0]).toEqual(["a.webp", "b.webp"]);
  });

  it("não chama o Supabase quando não há caminhos", async () => {
    const { client, signedPathsPerCall } = makeClient();

    const result = await createSignedPreviewUrls(client, []);

    expect(result.size).toBe(0);
    expect(signedPathsPerCall).toHaveLength(0);
  });
});
