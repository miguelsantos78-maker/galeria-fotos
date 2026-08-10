// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PhotoModeration } from "@/components/admin/photo-moderation";
import type { AdminPhotoView } from "@/server/use-cases/admin-photo-view";

/** jsdom não implementa `IntersectionObserver` — o componente cria um
 * assim que há página seguinte (sentinela de carregamento progressivo,
 * o mesmo padrão de `photo-grid.tsx`). Guarda a última instância para
 * os testes poderem disparar `onIntersect` manualmente. */
let observed: { callback: IntersectionObserverCallback } | null;

class FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observed = { callback };
  }
  observe() {}
  disconnect() {
    observed = null;
  }
  unobserve() {}
}

function makePhoto(overrides: Partial<AdminPhotoView> = {}): AdminPhotoView {
  return {
    id: `photo-${Math.random()}`,
    albumId: "album-1",
    status: "ready",
    isFeatured: false,
    isCover: false,
    moderationNote: null,
    originalFilename: "foto.jpg",
    width: 800,
    height: 600,
    fileSize: 1000,
    uploadedAt: new Date().toISOString(),
    capturedAt: null,
    previewUrl: null,
    thumbnailUrl: `https://signed.example.com/${Math.random()}.png`,
    ...overrides,
  };
}

function renderModeration() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PhotoModeration albumId="album-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  observed = null;
  vi.stubGlobal(
    "IntersectionObserver",
    FakeIntersectionObserver as unknown as typeof IntersectionObserver,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PhotoModeration — carregamento", () => {
  it("mostra marcadores em forma de grelha enquanto a primeira página carrega", () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    renderModeration();

    // aria-hidden: não são anunciados por leitores de ecrã, só visuais.
    const skeleton = document.querySelector('ul[aria-hidden="true"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.children.length).toBe(20);
  });

  it("substitui os marcadores pelas fotografias reais depois de carregar", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              photos: [makePhoto({ originalFilename: "a.jpg" })],
              nextOffset: null,
            },
            error: null,
          }),
          { status: 200 },
        ),
    );
    renderModeration();

    await waitFor(() =>
      expect(
        document.querySelector('ul[aria-hidden="true"]'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByAltText("Fotografia do álbum")).toHaveLength(1);
  });

  it("mostra 'Carregar mais' quando há página seguinte, e não quando não há", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: { photos: [makePhoto()], nextOffset: 20 },
            error: null,
          }),
          { status: 200 },
        ),
    );
    renderModeration();

    expect(
      await screen.findByRole("button", { name: "Carregar mais" }),
    ).toBeInTheDocument();
  });

  it("carrega a página seguinte quando a sentinela entra em vista, sem clicar no botão", async () => {
    let callCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      callCount += 1;
      const isFirstPage = callCount === 1;
      return new Response(
        JSON.stringify({
          data: {
            photos: [makePhoto({ id: `p-${callCount}` })],
            nextOffset: isFirstPage ? 20 : null,
          },
          error: null,
        }),
        { status: 200 },
      );
    });
    renderModeration();

    await screen.findByRole("button", { name: "Carregar mais" });
    expect(callCount).toBe(1);

    observed?.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    await waitFor(() => expect(callCount).toBe(2));
    await waitFor(() =>
      expect(screen.getAllByAltText("Fotografia do álbum")).toHaveLength(2),
    );
  });
});

describe("PhotoModeration — selecionar tudo e ações em lote", () => {
  it("'Selecionar tudo' marca todas as fotografias já carregadas", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              photos: [makePhoto(), makePhoto(), makePhoto()],
              nextOffset: null,
            },
            error: null,
          }),
          { status: 200 },
        ),
    );
    renderModeration();

    await user.click(
      await screen.findByRole("button", { name: "Selecionar tudo" }),
    );

    expect(await screen.findByText("3 selecionada(s)")).toBeInTheDocument();
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeChecked();
    }
  });

  it("'Selecionar tudo' carrega primeiro as páginas em falta", async () => {
    let moderationCalls = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/photos/moderation")) {
        moderationCalls += 1;
        const isFirstPage = moderationCalls === 1;
        return new Response(
          JSON.stringify({
            data: {
              photos: [makePhoto({ id: `p-${moderationCalls}` })],
              nextOffset: isFirstPage ? 20 : null,
            },
            error: null,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    });
    const user = userEvent.setup();
    renderModeration();

    const selectAllButton = await screen.findByRole("button", {
      name: "Selecionar tudo",
    });
    // Só uma fotografia visível antes de clicar — a segunda página
    // ainda não tinha sido pedida.
    expect(moderationCalls).toBe(1);

    await user.click(selectAllButton);

    await waitFor(() => expect(moderationCalls).toBe(2));
    expect(await screen.findByText("2 selecionada(s)")).toBeInTheDocument();
  });

  it("divide uma seleção grande em pedidos de 25, em vez de um só", async () => {
    const PHOTO_COUNT = 30;
    const batchCalls: string[][] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/photos/moderation")) {
        return new Response(
          JSON.stringify({
            data: {
              photos: Array.from({ length: PHOTO_COUNT }, (_, i) =>
                makePhoto({ id: `p-${i}` }),
              ),
              nextOffset: null,
            },
            error: null,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/photos/batch")) {
        const body = JSON.parse(init?.body as string) as {
          photoIds: string[];
        };
        batchCalls.push(body.photoIds);
        return new Response(
          JSON.stringify({
            data: { succeeded: body.photoIds, failed: [] },
            error: null,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    renderModeration();

    await user.click(
      await screen.findByRole("button", { name: "Selecionar tudo" }),
    );
    await screen.findByText(`${PHOTO_COUNT} selecionada(s)`);

    await user.click(screen.getAllByRole("button", { name: "Ocultar" })[0]);

    // 30 fotografias, chunks de 25: um pedido com 25, outro com 5 — não
    // um único pedido com as 30 de uma vez.
    await waitFor(() => expect(batchCalls).toHaveLength(2));
    expect(batchCalls[0]).toHaveLength(25);
    expect(batchCalls[1]).toHaveLength(5);

    // No fim, a seleção limpa-se e não fica nenhum aviso de falha.
    await waitFor(() =>
      expect(screen.queryByText(/selecionada\(s\)/)).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("soma as falhas de todos os chunks numa única mensagem", async () => {
    const PHOTO_COUNT = 30;
    let chunkIndex = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/photos/moderation")) {
        return new Response(
          JSON.stringify({
            data: {
              photos: Array.from({ length: PHOTO_COUNT }, (_, i) =>
                makePhoto({ id: `p-${i}` }),
              ),
              nextOffset: null,
            },
            error: null,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/photos/batch")) {
        chunkIndex += 1;
        const body = JSON.parse(init?.body as string) as {
          photoIds: string[];
        };
        // O primeiro chunk (25 fotografias) falha em 2; o segundo (5)
        // falha em todas.
        const failed =
          chunkIndex === 1
            ? body.photoIds
                .slice(0, 2)
                .map((photoId) => ({ photoId, error: "boom" }))
            : body.photoIds.map((photoId) => ({ photoId, error: "boom" }));
        return new Response(
          JSON.stringify({ data: { succeeded: [], failed }, error: null }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    renderModeration();

    await user.click(
      await screen.findByRole("button", { name: "Selecionar tudo" }),
    );
    await screen.findByText(`${PHOTO_COUNT} selecionada(s)`);
    await user.click(screen.getAllByRole("button", { name: "Ocultar" })[0]);

    expect(
      await screen.findByText("7 fotografia(s) não puderam ser processadas."),
    ).toBeInTheDocument();
  });
});
