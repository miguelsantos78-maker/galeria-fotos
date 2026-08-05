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
  channelMock.subscribe.mockClear();
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
    renderHook(() => usePhotosRealtime("album-1"), { wrapper });

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

    renderHook(() => usePhotosRealtime("album-1"), {
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

    const { unmount } = renderHook(() => usePhotosRealtime("album-1"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

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

    const { result } = renderHook(() => usePhotosRealtime("album-1"), {
      wrapper,
    });

    expect(result.current.isConnected).toBe(true);
  });
});
