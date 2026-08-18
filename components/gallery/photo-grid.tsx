"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import type { ListPhotosResult } from "@/server/use-cases/photos";
import { usePhotosRealtime } from "@/lib/realtime/use-photos-realtime";
import { Lightbox } from "./lightbox";
import { PhotoTile } from "./photo-tile";
import { VirtualizedPhotoGrid } from "./virtualized-photo-grid";
import { BackToTop } from "./back-to-top";

/** Acima disto, a grelha passa a virtualizar por linhas (secção 16:
 * "virtualizar a grelha quando o número de fotografias justificar") —
 * abaixo, a grelha simples já é suficiente e mais fácil de percorrer. */
const VIRTUALIZE_THRESHOLD = 60;

/** Quantas miniaturas carregam sem esperar pelo `lazy`. Cobre com folga
 * o primeiro ecrã num telemóvel (3 colunas), que é o que decide a
 * sensação de rapidez; passar muito disto só faria as primeiras
 * competirem por largura de banda com o que ainda nem está à vista. */
const EAGER_TILE_COUNT = 9;

/** "Já montou no cliente?" — o padrão recomendado pelo próprio React
 * para isto (em vez de `useState` + `useEffect`, que dispara uma
 * segunda renderização evitável): `getServerSnapshot` devolve sempre
 * `false`, nunca `true`, portanto o resultado no servidor e na
 * primeira passagem no cliente coincidem sempre — sem isso,
 * `useSyncExternalStore` lançaria um aviso de hidratação inconsistente. */
function subscribeNever() {
  return () => {};
}
function getMountedSnapshot() {
  return true;
}
function getServerMountedSnapshot() {
  return false;
}
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    getMountedSnapshot,
    getServerMountedSnapshot,
  );
}

/**
 * Grelha responsiva com paginação por cursor, lightbox e tempo real
 * (secção 22, Fase 5). A queryKey (`["albums", albumId, "photos"]`) é a
 * mesma que `usePhotosRealtime` invalida — qualquer evento Realtime
 * refaz esta página inteira em vez de tentar atualizar o cache à mão.
 *
 * A fotografia aberta na lightbox é sempre derivada do URL
 * (`?photo=<id>`), nunca de estado React separado — isso permite
 * partilhar/atualizar a página com a lightbox já aberta na fotografia
 * certa, e evita o padrão desaconselhado de sincronizar estado a partir
 * de um efeito.
 */
export function PhotoGrid({
  albumId,
  downloadEnabled,
  isOwner,
  initialPhotos,
}: {
  albumId: string;
  downloadEnabled: boolean;
  isOwner: boolean;
  /** Primeira página já vinda com a resolução do link — ver
   * `ResolveAlbumResult.initialPhotos`. */
  initialPhotos: ListPhotosResult;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [onlyMine, setOnlyMine] = useState(false);

  const query = useInfiniteQuery({
    queryKey: ["albums", albumId, "photos", { onlyMine }],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams();
      if (pageParam !== undefined) params.set("cursor", pageParam);
      if (onlyMine) params.set("mine", "true");
      const queryString = params.toString();
      return apiFetch<ListPhotosResult>(
        `/api/albums/${albumId}/photos${queryString ? `?${queryString}` : ""}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // Semeada com o que já veio na resolução do link, para a galeria
    // aparecer sem um segundo pedido. Só na vista por omissão: com o
    // filtro "as minhas fotos" ligado, a lista é outra e tem mesmo de
    // ser pedida. `staleTime` (app/providers.tsx) evita que isto seja
    // refeito de imediato só por ter sido semeado.
    initialData: onlyMine
      ? undefined
      : { pages: [initialPhotos], pageParams: [undefined] },
    // Deliberadamente NÃO desligado: os URLs das miniaturas são
    // assinados e expiram (ver lib/media/preview-url.ts), por isso
    // voltar ao separador ao fim de muito tempo tem de os poder
    // renovar — sem isto, quem deixasse a galeria aberta encontrava
    // imagens partidas ao regressar. O `staleTime` global
    // (app/providers.tsx) já evita que isto dispare a toda a hora.
    refetchOnWindowFocus: true,
  });

  const photos = query.data?.pages.flatMap((page) => page.photos) ?? [];
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  // Só a primeira página traz a contagem (ver `listPhotosForViewer`).
  const totalCount = query.data?.pages[0]?.totalCount ?? null;

  // Atualizar sozinho só enquanto houver uma página carregada: refazer
  // uma query paginada refaz TODAS as páginas em cache, por isso o
  // custo de cada atualização automática cresce com o quanto o
  // convidado já desceu na galeria. Ver `usePhotosRealtime`.
  const loadedPageCount = query.data?.pages.length ?? 0;
  const { isConnected, hasPendingUpdates, refreshNow } = usePhotosRealtime(
    albumId,
    { canAutoRefresh: loadedPageCount <= 1 },
  );

  // A virtualização (abaixo) só pode ligar-se depois de montado no
  // cliente — nunca durante a renderização no servidor, para não
  // arriscar `useWindowVirtualizer` a tocar em `window` nesse passo.
  const mounted = useMounted();
  const shouldVirtualize = mounted && photos.length > VIRTUALIZE_THRESHOLD;

  const openPhotoId = searchParams.get("photo");
  const openIndex = openPhotoId
    ? photos.findIndex((photo) => photo.id === openPhotoId)
    : -1;

  // Carregamento progressivo: observa uma sentinela no fim da grelha.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const updatePhotoParam = useCallback(
    (photoId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (photoId) params.set("photo", photoId);
      else params.delete("photo");
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  function handleClose() {
    updatePhotoParam(null);
  }

  function handleDeleted() {
    updatePhotoParam(null);
    queryClient.invalidateQueries({ queryKey: ["albums", albumId, "photos"] });
  }

  if (query.isLoading) {
    return (
      <p className="text-foreground/60 text-sm">A carregar fotografias…</p>
    );
  }

  if (query.isError) {
    return (
      <p role="alert" className="text-danger text-sm">
        Não foi possível carregar as fotografias.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col">
      {!isConnected && (
        <p
          role="status"
          className="text-foreground/70 px-4 py-2 text-center text-xs"
        >
          Ligação em tempo real indisponível — a atualizar periodicamente.
        </p>
      )}

      {/* "Indicador discreto quando entram novas fotografias" (secção
          10.1). Só aparece a quem já desceu na galeria: aí as
          fotografias novas não são aplicadas sozinhas, tanto por custo
          (ver `usePhotosRealtime`) como para a grelha não saltar
          debaixo do dedo a meio do scroll. Fixo no topo do ecrã, para
          continuar à mão sem obrigar a voltar atrás. */}
      {hasPendingUpdates && (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex justify-center px-4">
          <button
            type="button"
            onClick={() => {
              refreshNow();
              window.scrollTo({
                top: 0,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
              });
            }}
            className="bg-brand-600 hover:bg-brand-700 pointer-events-auto rounded-full px-4 py-2 text-xs font-semibold text-white shadow-lg transition active:scale-95 motion-reduce:active:scale-100"
          >
            Há fotografias novas — toque para ver
          </button>
        </div>
      )}

      {/* A barra de controlos aparece mesmo com a lista vazia quando o
          filtro está ligado — senão não haveria forma de o desligar. */}
      {(photos.length > 0 || onlyMine) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <p className="text-foreground/60 text-xs" aria-live="polite">
            {totalCount !== null &&
              (onlyMine
                ? `${totalCount} ${totalCount === 1 ? "fotografia sua" : "fotografias suas"}`
                : `${totalCount} ${totalCount === 1 ? "fotografia" : "fotografias"}`)}
          </p>

          {/* O rótulo descreve a AÇÃO, não o estado atual ("As minhas
              fotos" → filtra; "Todas as fotos" → volta a mostrar tudo).
              Por isso não leva `aria-pressed`: um botão de alternância
              com esse atributo pressupõe um rótulo fixo, e teríamos o
              estado a ser anunciado duas vezes, de forma contraditória. */}
          <button
            type="button"
            onClick={() => setOnlyMine((current) => !current)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition active:scale-95 motion-reduce:active:scale-100 ${
              onlyMine
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-border text-foreground hover:bg-surface-muted"
            }`}
          >
            {onlyMine ? "Todas as fotos" : "As minhas fotos"}
          </button>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="rounded-card border-border mx-4 my-6 flex flex-1 flex-col items-center justify-center gap-2 border border-dashed px-8 py-16">
          <p className="text-foreground/70 text-center">
            {onlyMine
              ? "Ainda não enviou nenhuma fotografia para este álbum."
              : "Ainda não há fotografias neste álbum."}
          </p>
        </div>
      ) : (
        <>
          {/* Grelha densa e sem espaçamento visual entre miniaturas — o
              padrão de um álbum partilhado (secção 1/10.1): tudo até à
              borda do ecrã em telemóvel. Quadradas: num álbum com
              muitas fotografias, miniaturas mais altas tornariam a
              coluna de scroll desnecessariamente longa. Acima de
              VIRTUALIZE_THRESHOLD, só as
              linhas visíveis chegam a ser montadas (ver
              virtualized-photo-grid.tsx) — a sentinela abaixo continua
              a funcionar sem alterações, porque a posição dela na
              página depende da altura total reservada, não do número
              de nós DOM realmente montados. */}
          {shouldVirtualize ? (
            <VirtualizedPhotoGrid photos={photos} onOpen={updatePhotoParam} />
          ) : (
            <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {photos.map((photo, index) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  onOpen={updatePhotoParam}
                  priority={index < EAGER_TILE_COUNT}
                />
              ))}
            </div>
          )}

          <div ref={sentinelRef} aria-hidden="true" className="h-1" />

          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="border-border text-foreground hover:bg-surface-muted mx-auto my-6 rounded-full border px-5 py-2 text-sm font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:active:scale-100"
            >
              {isFetchingNextPage ? "A carregar…" : "Carregar mais"}
            </button>
          )}
        </>
      )}

      {/* Escondido com a lightbox aberta: aí o scroll da página está
          bloqueado e o botão só se sobreporia ao diálogo. */}
      {openIndex === -1 && <BackToTop />}

      {openIndex !== -1 && (
        <Lightbox
          photos={photos}
          initialIndex={openIndex}
          downloadEnabled={downloadEnabled}
          isOwner={isOwner}
          onClose={handleClose}
          onIndexChange={updatePhotoParam}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
