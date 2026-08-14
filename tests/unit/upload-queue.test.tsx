// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UploadQueue } from "@/components/upload/upload-queue";

/**
 * `uploadFileWithProgress` fala diretamente com `XMLHttpRequest` (para
 * ter progresso), não com `fetch` — este duplo falso permite controlar
 * a resposta do envio real (`.../complete`) instância a instância,
 * enquanto `fetch` cobre a chamada de iniciar o envio.
 */
class FakeXHR {
  static instances: FakeXHR[] = [];
  status = 0;
  responseText = "";
  upload = { addEventListener: () => {} };
  private listeners: Record<string, Array<() => void>> = {};

  constructor() {
    FakeXHR.instances.push(this);
  }

  open() {}
  send() {}
  abort() {
    this.dispatchType("abort");
  }
  addEventListener(type: string, callback: () => void) {
    (this.listeners[type] ??= []).push(callback);
  }
  dispatchType(type: string) {
    for (const callback of this.listeners[type] ?? []) callback();
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.dispatchType("load");
  }
}

function renderUploadQueue() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <UploadQueue albumId="album-1" />
    </QueryClientProvider>,
  );
}

async function selectFile(name = "foto.jpg") {
  const user = userEvent.setup();
  const file = new File(["conteúdo"], name, { type: "image/jpeg" });
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await user.upload(input, file);
  return file;
}

beforeEach(() => {
  FakeXHR.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR as unknown as typeof XMLHttpRequest);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(global, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ data: { uploadId: "upload-1" }, error: null }),
        { status: 200 },
      ),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UploadQueue", () => {
  it("mostra o limite de fotografias por envio antes de qualquer seleção", () => {
    renderUploadQueue();

    expect(
      screen.getByText("Máximo de 50 fotografias de cada vez."),
    ).toBeInTheDocument();
  });

  it("esconde o aviso do limite depois de haver ficheiros selecionados", async () => {
    renderUploadQueue();
    await selectFile();

    expect(
      screen.queryByText("Máximo de 50 fotografias de cada vez."),
    ).not.toBeInTheDocument();
  });

  it("mostra um botão de tentar novamente para um erro genérico de envio", async () => {
    renderUploadQueue();
    await selectFile();

    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    FakeXHR.instances[0].respond(500, {
      data: null,
      error: { code: "UPLOAD_DRIVE_FAILED", message: "Falha no envio." },
    });

    expect(
      await screen.findByRole("button", {
        name: "Tentar novamente: Falha no envio.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Já enviada para este álbum/ }),
    ).not.toBeInTheDocument();
  });

  it("mostra um botão enquadrado (tom de aviso) para uma fotografia duplicada", async () => {
    renderUploadQueue();
    await selectFile();

    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    FakeXHR.instances[0].respond(409, {
      data: null,
      error: {
        code: "PHOTO_DUPLICATE",
        message: "Esta fotografia já foi enviada para este álbum.",
      },
    });

    const duplicateButton = await screen.findByRole("button", {
      name: "Já enviada para este álbum. Tocar para remover da lista.",
    });
    expect(duplicateButton).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Tentar novamente/ }),
    ).not.toBeInTheDocument();
  });

  it("remove o item da lista ao tocar no botão de duplicado", async () => {
    const user = userEvent.setup();
    renderUploadQueue();
    await selectFile("duplicada.jpg");

    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    FakeXHR.instances[0].respond(409, {
      data: null,
      error: { code: "PHOTO_DUPLICATE", message: "Já enviada." },
    });
    const duplicateButton = await screen.findByRole("button", {
      name: "Já enviada para este álbum. Tocar para remover da lista.",
    });

    await user.click(duplicateButton);

    expect(screen.queryByAltText("duplicada.jpg")).not.toBeInTheDocument();
  });

  it("mostra a mensagem real do servidor, e não só um ícone", async () => {
    renderUploadQueue();
    await selectFile();

    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    FakeXHR.instances[0].respond(503, {
      data: null,
      error: {
        code: "GOOGLE_CONNECTION_INVALID",
        message: "A ligação ao Google Drive do organizador expirou.",
      },
    });

    // Visível no ecrã, não escondida num `title` — num telemóvel não há
    // hover, e sem isto o convidado só via um ícone vermelho.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "A ligação ao Google Drive do organizador expirou.",
    );
  });

  it("agrupa numa linha só as falhas com a mesma mensagem", async () => {
    renderUploadQueue();
    const user = userEvent.setup();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
    ]);

    await waitFor(() => expect(FakeXHR.instances).toHaveLength(2));
    for (const instance of FakeXHR.instances) {
      instance.respond(502, {
        data: null,
        error: { code: "UPLOAD_DRIVE_FAILED", message: "Falha no envio." },
      });
    }

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("2 fotografias: Falha no envio.");
    expect(alert.querySelectorAll("p")).toHaveLength(1);
  });

  // A mensagem do duplicado já é dada na própria miniatura, em tom de
  // aviso — repeti-la no painel vermelho de falhas contradizia isso.
  it("não conta duplicados como falhas no painel de erros", async () => {
    renderUploadQueue();
    await selectFile();

    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    FakeXHR.instances[0].respond(409, {
      data: null,
      error: { code: "PHOTO_DUPLICATE", message: "Já enviada." },
    });

    await screen.findByRole("button", {
      name: "Já enviada para este álbum. Tocar para remover da lista.",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("prepara as fotografias grandes por ordem, não todas ao mesmo tempo", async () => {
    // 5 ficheiros acima do limite de otimização (2MB). Antes, os 5
    // arrancavam em simultâneo: num telemóvel isso trava a interface e
    // atrasa o primeiro envio, porque todos disputam o mesmo CPU.
    let concurrent = 0;
    let peakConcurrent = 0;
    const releases: Array<() => void> = [];

    vi.stubGlobal("createImageBitmap", async () => {
      concurrent += 1;
      peakConcurrent = Math.max(peakConcurrent, concurrent);
      await new Promise<void>((resolve) => releases.push(resolve));
      concurrent -= 1;
      return { width: 4000, height: 3000, close: () => {} };
    });

    renderUploadQueue();
    const user = userEvent.setup();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const big = () =>
      new File([new Uint8Array(2_500_000)], "grande.jpg", {
        type: "image/jpeg",
      });
    await user.upload(input, [big(), big(), big(), big(), big()]);

    await waitFor(() => expect(releases.length).toBeGreaterThan(0));
    expect(peakConcurrent).toBeLessThanOrEqual(2);

    for (const release of releases) release();
  });

  it("atualiza a galeria uma vez por rajada, não uma vez por fotografia", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    render(
      <QueryClientProvider client={queryClient}>
        <UploadQueue albumId="album-1" />
      </QueryClientProvider>,
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
      new File(["c"], "c.jpg", { type: "image/jpeg" }),
    ]);

    await waitFor(() => expect(FakeXHR.instances).toHaveLength(3));
    for (const instance of FakeXHR.instances) {
      instance.respond(200, { data: {}, error: null });
    }

    // Invalidar uma query paginada refaz TODAS as páginas em cache: uma
    // invalidação por fotografia multiplicava-se pelo número de páginas
    // que o convidado já tinha percorrido.
    // Deixar as promessas do envio resolverem antes de mexer no
    // relógio — senão o debounce ainda nem tinha sido agendado.
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    const galleryInvalidations = invalidateSpy.mock.calls.filter(
      ([arg]) =>
        JSON.stringify((arg as { queryKey?: unknown })?.queryKey) ===
        JSON.stringify(["albums", "album-1", "photos"]),
    );
    expect(galleryInvalidations).toHaveLength(1);
    vi.useRealTimers();
  });
});
