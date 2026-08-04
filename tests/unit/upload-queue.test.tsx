// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
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
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
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
  vi.spyOn(global, "fetch").mockImplementation(async () =>
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
});
