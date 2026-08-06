// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Lightbox } from "@/components/gallery/lightbox";
import type { PublicPhoto } from "@/server/use-cases/photos";

function makePhoto(overrides: Partial<PublicPhoto> = {}): PublicPhoto {
  return {
    id: "photo-1",
    width: 800,
    height: 600,
    blurhash: null,
    status: "ready",
    isFeatured: false,
    uploadedAt: new Date().toISOString(),
    previewUrl: "https://signed.example/preview.webp",
    thumbnailUrl: "https://signed.example/thumbnail.webp",
    isMine: false,
    ...overrides,
  };
}

const photos: PublicPhoto[] = [
  makePhoto({ id: "photo-1" }),
  makePhoto({ id: "photo-2" }),
  makePhoto({ id: "photo-3" }),
];

/** `Lightbox` usa `useMutation` (botão "Eliminar") mesmo quando `isOwner`
 * é falso — precisa sempre de um `QueryClientProvider` à volta. */
function renderLightbox(
  props: Partial<ComponentProps<typeof Lightbox>> = {},
) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={false}
        isOwner={false}
        onClose={() => {}}
        onDeleted={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Lightbox", () => {
  it("mostra a fotografia inicial com atributos de diálogo modal", () => {
    renderLightbox();

    const dialog = screen.getByRole("dialog", {
      name: "Visualização de fotografia",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("avança com a seta direita e retrocede com a seta esquerda do teclado", async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("não recua antes da primeira nem avança depois da última fotografia", async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("chama onClose ao premir Escape", () => {
    const onClose = vi.fn();
    renderLightbox({ onClose });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("chama onClose ao clicar em Fechar", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderLightbox({ onClose });

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("foca o botão Fechar ao abrir", () => {
    renderLightbox();

    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
  });

  it("não mostra o botão Transferir quando downloadEnabled é falso", () => {
    renderLightbox({ downloadEnabled: false });

    expect(
      screen.queryByRole("link", { name: "Transferir" }),
    ).not.toBeInTheDocument();
  });

  it("mostra o botão Transferir a apontar para o endpoint do original quando downloadEnabled é verdadeiro", () => {
    renderLightbox({ downloadEnabled: true });

    const link = screen.getByRole("link", { name: "Transferir" });
    expect(link).toHaveAttribute("href", "/api/media/photo-1/original");
  });

  it("chama onIndexChange com o id da fotografia atual", async () => {
    const onIndexChange = vi.fn();
    const user = userEvent.setup();
    renderLightbox({ onIndexChange });

    expect(onIndexChange).toHaveBeenCalledWith("photo-1");

    await user.keyboard("{ArrowRight}");
    expect(onIndexChange).toHaveBeenCalledWith("photo-2");
  });

  it("não mostra o botão Eliminar para um visitante (isOwner falso)", () => {
    renderLightbox({ isOwner: false });

    expect(
      screen.queryByRole("button", { name: "Eliminar" }),
    ).not.toBeInTheDocument();
  });

  it("mostra o botão Eliminar para o dono do álbum", () => {
    renderLightbox({ isOwner: true });

    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("pede confirmação e chama onDeleted após eliminar com sucesso", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { deleted: true }, error: null }), {
        status: 200,
      }),
    );
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    renderLightbox({ isOwner: true, onDeleted });

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/photos/photo-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("photo-1"));
  });

  it("não elimina nem chama a API quando a confirmação é recusada", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchSpy = vi.spyOn(global, "fetch");
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    renderLightbox({ isOwner: true, onDeleted });

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("não mostra um botão para ligar/pausar a apresentação", () => {
    renderLightbox();

    expect(
      screen.queryByRole("button", { name: "Apresentação" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pausar apresentação" }),
    ).not.toBeInTheDocument();
  });

  it("avança automaticamente quando startInPresentationMode é verdadeiro", () => {
    vi.useFakeTimers();
    try {
      renderLightbox({ startInPresentationMode: true });
      expect(screen.getByText("1 / 3")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mostra um marcador por fotografia quando há poucas fotografias", () => {
    renderLightbox();

    const dots = document.querySelectorAll('[role="presentation"] > span');
    expect(dots).toHaveLength(3);
  });

  it("esconde os marcadores quando há muitas fotografias", () => {
    const manyPhotos = Array.from({ length: 13 }, (_, i) =>
      makePhoto({ id: `photo-${i + 1}` }),
    );
    renderLightbox({ photos: manyPhotos });

    expect(document.querySelector('[role="presentation"]')).toBeNull();
    // O contador continua a indicar a posição mesmo sem marcadores.
    expect(screen.getByText("1 / 13")).toBeInTheDocument();
  });
});
