// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlbumDetail } from "@/components/admin/album-detail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Isola o teste ao cabeçalho (onde vive a edição do nome) — estes dois
// fazem os seus próprios pedidos, irrelevantes aqui.
vi.mock("@/components/admin/share-links-manager", () => ({
  ShareLinksManager: () => null,
}));
vi.mock("@/components/admin/photo-moderation", () => ({
  PhotoModeration: () => null,
}));

const INITIAL_TITLE = "Casamento da Ana e do João";

function renderAlbumDetail() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AlbumDetail albumId="album-1" />
    </QueryClientProvider>,
  );
}

/** Estado do "servidor" falso — como uma API real, um GET a seguir a um
 * PATCH bem-sucedido tem de devolver o valor já atualizado. Um mock
 * estático (sempre o mesmo título) escondia esse detalhe: o `PATCH`
 * parecia funcionar, mas o `invalidateQueries` a seguir refazia o
 * pedido e repunha o título antigo por cima. */
let serverTitle = INITIAL_TITLE;

beforeEach(() => {
  serverTitle = INITIAL_TITLE;
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/albums/album-1") && !url.includes("?")) {
      if (init?.method === "PATCH") {
        const body = JSON.parse(init.body as string) as { title?: string };
        if (body.title) serverTitle = body.title;
      }
      return new Response(
        JSON.stringify({
          data: {
            id: "album-1",
            title: serverTitle,
            description: null,
            status: "published",
          },
          error: null,
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ data: null, error: null }), {
      status: 200,
    });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AlbumDetail — editar nome do álbum", () => {
  it("mostra o título e um botão para o editar", async () => {
    renderAlbumDetail();

    expect(
      await screen.findByRole("heading", {
        name: INITIAL_TITLE,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Editar nome do álbum" }),
    ).toBeInTheDocument();
  });

  it("envia o novo título por PATCH e atualiza o cabeçalho", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch");
    renderAlbumDetail();

    await screen.findByRole("heading", { name: INITIAL_TITLE });
    await user.click(
      screen.getByRole("button", { name: "Editar nome do álbum" }),
    );

    const input = screen.getByRole("textbox", { name: "Nome do álbum" });
    await user.clear(input);
    await user.type(input, "Novo nome do álbum");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const patchCall = fetchSpy.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse((patchCall?.[1] as RequestInit).body as string)).toEqual({
      title: "Novo nome do álbum",
    });

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Novo nome do álbum" }),
      ).toBeInTheDocument(),
    );
  });

  it("cancelar não envia pedido nenhum e repõe o título original", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch");
    renderAlbumDetail();

    await screen.findByRole("heading", { name: INITIAL_TITLE });
    await user.click(
      screen.getByRole("button", { name: "Editar nome do álbum" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Nome do álbum" }),
      " (rascunho)",
    );

    const callsBeforeCancel = fetchSpy.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(fetchSpy.mock.calls.length).toBe(callsBeforeCancel);
    expect(
      screen.getByRole("heading", { name: INITIAL_TITLE }),
    ).toBeInTheDocument();
  });

  it("não deixa guardar um nome em branco", async () => {
    const user = userEvent.setup();
    renderAlbumDetail();

    await screen.findByRole("heading", { name: INITIAL_TITLE });
    await user.click(
      screen.getByRole("button", { name: "Editar nome do álbum" }),
    );
    await user.clear(screen.getByRole("textbox", { name: "Nome do álbum" }));

    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });
});
