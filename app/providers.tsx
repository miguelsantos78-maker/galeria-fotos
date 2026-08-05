"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Sem isto, o valor por omissão do React Query (`staleTime: 0`) trata
 * todos os dados como imediatamente obsoletos — qualquer remontagem ou
 * regresso à aba refaz o pedido, mesmo que os dados tenham chegado há
 * instantes. Uma janela pequena de "ainda fresco" reduz pedidos
 * redundantes sem atrasar visivelmente nada: uma invalidação explícita
 * (mutação, evento de tempo real) continua sempre a refazer o pedido
 * de imediato, `staleTime` só limita os refetches automáticos.
 */
const DEFAULT_STALE_TIME_MS = 15_000;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: DEFAULT_STALE_TIME_MS },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
