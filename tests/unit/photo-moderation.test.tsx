// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
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
