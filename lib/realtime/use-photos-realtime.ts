"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

/** Refetch periódico quando o canal não está ligado (secção 11). */
const FALLBACK_REFETCH_INTERVAL_MS = 15_000;

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

    const invalidate = () => {
      void queryClient.invalidateQueries({
        queryKey: ["albums", albumId, "photos"],
      });
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
