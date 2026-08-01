// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    ...overrides,
  };
}

const photos: PublicPhoto[] = [
  makePhoto({ id: "photo-1" }),
  makePhoto({ id: "photo-2" }),
  makePhoto({ id: "photo-3" }),
];

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
});

describe("Lightbox", () => {
  it("mostra a fotografia inicial com atributos de diálogo modal", () => {
    render(
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={false}
        onClose={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Visualização de fotografia",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("avança com a seta direita e retrocede com a seta esquerda do teclado", async () => {
    const user = userEvent.setup();
    render(
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={false}
        onClose={() => {}}
      />,
    );

    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("não recua antes da primeira nem avança depois da última fotografia", async () => {
    const user = userEvent.setup();
    render(
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={false}
        onClose={() => {}}
      />,
    );

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("chama onClose ao premir Escape", () => {
    const onClose = vi.fn();
    render(
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={false}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("chama onClose ao clicar em Fechar", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={false}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("foca o botão Fechar ao abrir", () => {
    render(
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={false}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
  });

  it("não mostra o botão Transferir quando downloadEnabled é falso", () => {
    render(
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={false}
        onClose={() => {}}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Transferir" }),
    ).not.toBeInTheDocument();
  });

  it("mostra o botão Transferir a apontar para o endpoint do original quando downloadEnabled é verdadeiro", () => {
    render(
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={true}
        onClose={() => {}}
      />,
    );

    const link = screen.getByRole("link", { name: "Transferir" });
    expect(link).toHaveAttribute("href", "/api/media/photo-1/original");
  });

  it("chama onIndexChange com o id da fotografia atual", async () => {
    const onIndexChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Lightbox
        photos={photos}
        initialIndex={0}
        downloadEnabled={false}
        onClose={() => {}}
        onIndexChange={onIndexChange}
      />,
    );

    expect(onIndexChange).toHaveBeenCalledWith("photo-1");

    await user.keyboard("{ArrowRight}");
    expect(onIndexChange).toHaveBeenCalledWith("photo-2");
  });
});
