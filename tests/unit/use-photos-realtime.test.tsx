// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePhotosRealtime } from "@/lib/realtime/use-photos-realtime";

const { channelMock, supabaseMock } = vi.hoisted(() => {
  const channelMock = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channelMock.on.mockReturnValue(channelMock);
  const supabaseMock = {
    channel: vi.fn(() => channelMock),
    removeChannel: vi.fn(),
  };
  return { channelMock, supabaseMock };
});

vi.mock("@/lib/db/supabase-browser", () => ({
  createSupabaseBrowserClient: () => supabaseMock,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Extrai o callback registado via `channel.on("postgres_changes", ..., cb)`. */
function getRealtimeCallback(): () => void {
  const call = channelMock.on.mock.calls.at(-1);
  return call?.[2];
}

beforeEach(() => {
  vi.useFakeTimers();
  channelMock.on.mockClear();
  // `mockReset`, não `mockClear`: um teste que defina uma
  // implementação para `subscribe` (ex.: confirmar SUBSCRIBED) deixava-a
  // a valer nos testes seguintes — `vi.restoreAllMocks()` não desfaz
  // implementações de `vi.fn()`, só de espias. Sem isto, os testes do
  // fallback viam o canal como ligado e nunca chegavam a sondar.
  channelMock.subscribe.mockReset();
  channelMock.subscribe.mockReturnValue(channelMock);
  supabaseMock.channel.mockClear();
  supabaseMock.removeChannel.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePhotosRealtime", () => {
  it("subscreve um canal filtrado pelo album_id", () => {
    renderHook(() => usePhotosRealtime("album-1", { canAutoRefresh: true }), {
      wrapper,
    });

    expect(supabaseMock.channel).toHaveBeenCalledWith("album-photos-album-1");
    expect(channelMock.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ filter: "album_id=eq.album-1" }),
      expect.any(Function),
    );
  });

  it("uma rajada de eventos só invalida a query uma vez, depois de uma pausa", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => usePhotosRealtime("album-1", { canAutoRefresh: true }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    const onEvent = getRealtimeCallback();

    // Cinco eventos em rajada, bem dentro da janela de debounce.
    act(() => {
      for (let i = 0; i < 5; i++) {
        onEvent();
        vi.advanceTimersByTime(100);
      }
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["albums", "album-1", "photos"],
    });
  });

  it("cancela a invalidação pendente ao desmontar", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { unmount } = renderHook(
      () => usePhotosRealtime("album-1", { canAutoRefresh: true }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
    );

    const onEvent = getRealtimeCallback();
    act(() => onEvent());
    unmount();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("fica ligado quando a subscrição confirma SUBSCRIBED", () => {
    channelMock.subscribe.mockImplementation((cb: (status: string) => void) => {
      cb("SUBSCRIBED");
      return channelMock;
    });

    const { result } = renderHook(
      () => usePhotosRealtime("album-1", { canAutoRefresh: true }),
      {
        wrapper,
      },
    );

    expect(result.current.isConnected).toBe(true);
  });

  describe("custo de atualização com a galeria já percorrida", () => {
    function renderWithClient(canAutoRefresh: boolean) {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const view = renderHook(
        () => usePhotosRealtime("album-1", { canAutoRefresh }),
        {
          wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
              {children}
            </QueryClientProvider>
          ),
        },
      );
      return { ...view, invalidateSpy };
    }

    it("NÃO refaz a query sozinho quando há mais do que uma página carregada", () => {
      // O cenário caro: refazer uma query paginada refaz todas as
      // páginas em cache. Com 20 páginas eram 20 pedidos por rajada,
      // por convidado (medido — ver docs/decisions/0038).
      const { result, invalidateSpy } = renderWithClient(false);
      const onEvent = getRealtimeCallback();

      act(() => {
        onEvent();
        vi.advanceTimersByTime(1000);
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(result.current.hasPendingUpdates).toBe(true);
    });

    it("refaz sozinho quando só a primeira página está carregada", () => {
      const { result, invalidateSpy } = renderWithClient(true);
      const onEvent = getRealtimeCallback();

      act(() => {
        onEvent();
        vi.advanceTimersByTime(1000);
      });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(result.current.hasPendingUpdates).toBe(false);
    });

    it("`refreshNow` aplica o que estava pendente e limpa o indicador", () => {
      const { result, invalidateSpy } = renderWithClient(false);
      const onEvent = getRealtimeCallback();

      act(() => {
        onEvent();
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.hasPendingUpdates).toBe(true);

      act(() => result.current.refreshNow());

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["albums", "album-1", "photos"],
      });
      expect(result.current.hasPendingUpdates).toBe(false);
    });

    it("o fallback por sondagem também respeita o limite, em vez de refazer tudo em ciclo", () => {
      // Sem canal ligado (subscribe nunca confirma SUBSCRIBED), o
      // fallback sondava a cada 15s. Numa galeria percorrida isso eram
      // 20 pedidos a cada 15s, por convidado, indefinidamente.
      const { result, invalidateSpy } = renderWithClient(false);

      act(() => {
        vi.advanceTimersByTime(120_000);
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(result.current.hasPendingUpdates).toBe(true);
    });
  });
});
