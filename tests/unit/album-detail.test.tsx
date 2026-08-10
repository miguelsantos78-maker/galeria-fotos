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
let serverEventStartAt: string | null = null;

beforeEach(() => {
  serverTitle = INITIAL_TITLE;
  serverEventStartAt = null;
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/albums/album-1") && !url.includes("?")) {
      if (init?.method === "PATCH") {
        const body = JSON.parse(init.body as string) as {
          title?: string;
          eventStartAt?: string | null;
        };
        if (body.title) serverTitle = body.title;
        if ("eventStartAt" in body)
          serverEventStartAt = body.eventStartAt ?? null;
      }
      return new Response(
        JSON.stringify({
          data: {
            id: "album-1",
            title: serverTitle,
            description: null,
            status: "published",
            event_start_at: serverEventStartAt,
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

describe("AlbumDetail — data do evento", () => {
  it("mostra 'não definida' e o botão para a definir quando o álbum não tem data", async () => {
    renderAlbumDetail();

    expect(
      await screen.findByText("Data do evento: não definida"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Definir data do evento" }),
    ).toBeInTheDocument();
  });

  it("guarda a data escolhida e mostra-a por extenso em português", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch");
    renderAlbumDetail();

    await screen.findByText("Data do evento: não definida");
    await user.click(
      screen.getByRole("button", { name: "Definir data do evento" }),
    );

    const input = screen.getByLabelText("Data do evento");
    await user.type(input, "2026-08-17");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const patchCall = fetchSpy.mock.calls.find(([, init]) => {
      const body = (init as RequestInit | undefined)?.body as
        string | undefined;
      return (
        (init as RequestInit | undefined)?.method === "PATCH" &&
        body?.includes("eventStartAt")
      );
    });
    expect(patchCall).toBeDefined();
    // Meio-dia UTC, não meia-noite — evita que a data mude de dia
    // consoante o fuso horário de quem a vê (ver album-detail.tsx).
    expect(JSON.parse((patchCall?.[1] as RequestInit).body as string)).toEqual({
      eventStartAt: "2026-08-17T12:00:00.000Z",
    });

    expect(
      await screen.findByText("Data do evento: 17 de agosto de 2026"),
    ).toBeInTheDocument();
  });

  it("remover a data (campo vazio) envia null", async () => {
    const user = userEvent.setup();
    serverEventStartAt = "2026-08-17T12:00:00.000Z";
    const fetchSpy = vi.spyOn(global, "fetch");
    renderAlbumDetail();

    await screen.findByText("Data do evento: 17 de agosto de 2026");
    await user.click(
      screen.getByRole("button", { name: "Editar data do evento" }),
    );
    await user.clear(screen.getByLabelText("Data do evento"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const patchCall = fetchSpy.mock.calls.find(([, init]) => {
      const body = (init as RequestInit | undefined)?.body as
        string | undefined;
      return (
        (init as RequestInit | undefined)?.method === "PATCH" &&
        body?.includes("eventStartAt")
      );
    });
    expect(JSON.parse((patchCall?.[1] as RequestInit).body as string)).toEqual({
      eventStartAt: null,
    });

    expect(
      await screen.findByText("Data do evento: não definida"),
    ).toBeInTheDocument();
  });
});
