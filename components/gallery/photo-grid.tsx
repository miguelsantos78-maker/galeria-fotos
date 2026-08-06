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
}: {
  albumId: string;
  downloadEnabled: boolean;
  isOwner: boolean;
}) {
  const { isConnected } = usePhotosRealtime(albumId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [onlyMine, setOnlyMine] = useState(false);

  const query = useInfiniteQuery({
    queryKey: ["albums", albumId, "photos", { onlyMine }],
    queryFn: ({ pageParam }: { pageParam: number | undefined }) => {
      const params = new URLSearchParams();
      if (pageParam !== undefined) params.set("cursor", String(pageParam));
      if (onlyMine) params.set("mine", "true");
      const queryString = params.toString();
      return apiFetch<ListPhotosResult>(
        `/api/albums/${albumId}/photos${queryString ? `?${queryString}` : ""}`,
      );
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
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

  const [presenting, setPresenting] = useState(false);

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
    setPresenting(false);
    updatePhotoParam(null);
  }

  function handleDeleted() {
    setPresenting(false);
    updatePhotoParam(null);
    queryClient.invalidateQueries({ queryKey: ["albums", albumId, "photos"] });
  }

  function openPresentation() {
    if (photos.length === 0) return;
    setPresenting(true);
    updatePhotoParam(photos[0].id);
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
        <p role="status" className="text-foreground/70 px-4 py-2 text-center text-xs">
          Ligação em tempo real indisponível — a atualizar periodicamente.
        </p>
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyMine((current) => !current)}
              aria-pressed={onlyMine}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                onlyMine
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-border text-foreground hover:bg-surface-muted"
              }`}
            >
              As minhas
            </button>

            {photos.length > 0 && (
              <button
                type="button"
                onClick={openPresentation}
                aria-label="Iniciar apresentação"
                className="border-border text-foreground hover:bg-surface-muted inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path d="M6 4.5v11l9-5.5-9-5.5Z" />
                </svg>
                Apresentação
              </button>
            )}
          </div>
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
              {photos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  onOpen={updatePhotoParam}
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
              className="border-border text-foreground hover:bg-surface-muted mx-auto my-6 rounded-full border px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
          startInPresentationMode={presenting}
          onClose={handleClose}
          onIndexChange={updatePhotoParam}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
