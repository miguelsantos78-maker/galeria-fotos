"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

/**
 * Refetch periódico quando o canal não está ligado (secção 11).
 *
 * Com desfasamento aleatório (abaixo): sem isso, todos os convidados
 * que abrissem a galeria por volta da mesma hora — o que num casamento
 * acontece literalmente — acabariam a sondar em uníssono, concentrando
 * os pedidos em picos em vez de os espalhar.
 */
const FALLBACK_REFETCH_INTERVAL_MS = 30_000;
const FALLBACK_JITTER_RATIO = 0.25;

/**
 * Espera por uma pausa nos eventos antes de agir (secção 16: limites de
 * concorrência) — uma rajada de envios (vários convidados a enviar ao
 * mesmo tempo durante o evento) provoca uma única reação, pouco depois
 * de a rajada abrandar, em vez de uma por fotografia.
 */
const INVALIDATE_DEBOUNCE_MS = 800;

function nextFallbackDelay(): number {
  const jitter = FALLBACK_REFETCH_INTERVAL_MS * FALLBACK_JITTER_RATIO;
  return FALLBACK_REFETCH_INTERVAL_MS + (Math.random() * 2 - 1) * jitter;
}

export interface PhotosRealtimeState {
  isConnected: boolean;
  /**
   * Há alterações por mostrar que não foram aplicadas automaticamente.
   * A grelha usa isto para o "indicador discreto quando entram novas
   * fotografias" (secção 10.1).
   */
  hasPendingUpdates: boolean;
  /** Aplica agora o que estiver pendente (o toque no indicador). */
  refreshNow: () => void;
}

/**
 * Subscreve `postgres_changes` em `photos`, filtrado por `album_id`
 * (secção 11). Nunca confia no payload do evento — só o usa como sinal
 * para refazer o pedido autorizado do costume
 * (`GET /api/albums/[albumId]/photos`), que já replica manualmente a
 * mesma visibilidade da política de RLS. Isto também significa que um
 * `DELETE`, cujo `old record` pode não passar pela verificação de RLS
 * do Realtime, nunca bloqueia a atualização: o próximo refetch converge
 * sempre para o estado correto.
 *
 * `canAutoRefresh` existe por uma razão de escala medida, não teórica:
 * invalidar uma query paginada refaz **todas** as páginas já
 * carregadas, não só a mais recente. Num álbum de 1000 fotografias são
 * 20 páginas — ou seja, 20 pedidos por cada rajada, por cada convidado
 * que tenha percorrido a galeria até ao fim. Com uma centena de
 * convidados, uma única foto nova custava dois mil pedidos.
 *
 * Como as fotografias novas entram sempre na primeira página
 * (`sort_order desc`), refazer as outras dezanove nunca traz nada de
 * novo. Por isso quem só tem a primeira página carregada continua a ver
 * as fotos aparecer sozinhas (custo: um pedido); quem já desceu na
 * galeria recebe o indicador e decide quando atualizar — o que também
 * evita que a grelha lhe salte debaixo do dedo a meio do scroll.
 */
export function usePhotosRealtime(
  albumId: string,
  options: { canAutoRefresh: boolean },
): PhotosRealtimeState {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [hasPendingUpdates, setHasPendingUpdates] = useState(false);

  // Lido de dentro do callback do canal e do temporizador, ambos com
  // vida mais longa do que a renderização que os criou — uma `ref`
  // evita ter de voltar a subscrever o canal só porque o número de
  // páginas carregadas mudou. Atualizada num efeito, e não durante a
  // renderização: escrever numa ref a meio do render é precisamente o
  // que torna o valor imprevisível quando o React reexecuta o corpo do
  // componente.
  const canAutoRefreshRef = useRef(options.canAutoRefresh);
  useEffect(() => {
    canAutoRefreshRef.current = options.canAutoRefresh;
  }, [options.canAutoRefresh]);

  const refreshNow = useCallback(() => {
    setHasPendingUpdates(false);
    void queryClient.invalidateQueries({
      queryKey: ["albums", albumId, "photos"],
    });
  }, [albumId, queryClient]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let isMounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const onChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!isMounted) return;
        if (canAutoRefreshRef.current) {
          void queryClient.invalidateQueries({
            queryKey: ["albums", albumId, "photos"],
          });
        } else {
          setHasPendingUpdates(true);
        }
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
        onChange,
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

  // Fallback por sondagem enquanto o canal não estiver ligado. Usa
  // `setTimeout` reagendado (e não `setInterval`) porque cada espera
  // tem uma duração diferente, por causa do desfasamento aleatório.
  useEffect(() => {
    if (isConnected) return;

    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (canAutoRefreshRef.current) {
        void queryClient.invalidateQueries({
          queryKey: ["albums", albumId, "photos"],
        });
      } else {
        setHasPendingUpdates(true);
      }
      timer = setTimeout(tick, nextFallbackDelay());
    };

    timer = setTimeout(tick, nextFallbackDelay());
    return () => clearTimeout(timer);
  }, [isConnected, albumId, queryClient]);

  return { isConnected, hasPendingUpdates, refreshNow };
}
