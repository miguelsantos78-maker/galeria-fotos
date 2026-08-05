"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

/** Refetch periódico quando o canal não está ligado (secção 11). */
const FALLBACK_REFETCH_INTERVAL_MS = 15_000;

/**
 * Espera por uma pausa nos eventos antes de invalidar (secção 16:
 * limites de concorrência) — cada invalidação refaz *todas* as páginas
 * já carregadas de uma consulta paginada (não só a mais recente), para
 * as manter consistentes entre si. Sem isto, uma rajada de envios (ex.:
 * vários convidados a enviar fotos ao mesmo tempo durante o evento)
 * dispararia essa mesma cascata de pedidos uma vez por fotografia; com
 * debounce, uma rajada inteira só provoca uma única invalidação, pouco
 * depois de a rajada abrandar.
 */
const INVALIDATE_DEBOUNCE_MS = 800;

/**
 * Subscreve `postgres_changes` em `photos`, filtrado por `album_id`
 * (secção 11). Nunca confia no payload do evento — só o usa como sinal
 * para invalidar a query e refazer o pedido autorizado do costume
 * (`GET /api/albums/[albumId]/photos`), que já replica manualmente a
 * mesma visibilidade da política de RLS. Isto também significa que um
 * `DELETE`, cujo `old record` pode não passar pela verificação de RLS
 * do Realtime, nunca bloqueia a atualização: o próximo refetch (por
 * evento ou pelo fallback periódico) converge sempre para o estado
 * correto.
 */
export function usePhotosRealtime(albumId: string) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let isMounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const invalidate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: ["albums", albumId, "photos"],
        });
      }, INVALIDATE_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`album-photos-${albumId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "photos",
          filter: `album_id=eq.${albumId}`,
        },
        invalidate,
      )
      .subscribe((status) => {
        if (!isMounted) return;
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      isMounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [albumId, queryClient]);

  useEffect(() => {
    if (isConnected) return;

    const interval = setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: ["albums", albumId, "photos"],
      });
    }, FALLBACK_REFETCH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isConnected, albumId, queryClient]);

  return { isConnected };
}
