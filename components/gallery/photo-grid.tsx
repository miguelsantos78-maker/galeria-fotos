"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import type { ListPhotosResult } from "@/server/use-cases/photos";
import { usePhotosRealtime } from "@/lib/realtime/use-photos-realtime";
import { Lightbox } from "./lightbox";

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
}: {
  albumId: string;
  downloadEnabled: boolean;
}) {
  const { isConnected } = usePhotosRealtime(albumId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useInfiniteQuery({
    queryKey: ["albums", albumId, "photos"],
    queryFn: ({ pageParam }: { pageParam: number | undefined }) =>
      apiFetch<ListPhotosResult>(
        `/api/albums/${albumId}/photos${
          pageParam !== undefined ? `?cursor=${pageParam}` : ""
        }`,
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const photos = query.data?.pages.flatMap((page) => page.photos) ?? [];
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const [presenting, setPresenting] = useState(false);

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

      {photos.length === 0 ? (
        <div className="rounded-card border-border mx-4 my-6 flex flex-1 flex-col items-center justify-center gap-2 border border-dashed px-8 py-16">
          <p className="text-foreground/70 text-center">
            Ainda não há fotografias neste álbum.
          </p>
        </div>
      ) : (
        <>
          <div className="flex justify-end px-3 py-2">
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
          </div>

          {/* Grelha densa e sem espaçamento visual entre miniaturas — o
              padrão de um álbum partilhado (secção 1/10.1): tudo
              quadrado, tudo até à borda do ecrã em telemóvel. */}
          <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => updatePhotoParam(photo.id)}
                className="bg-surface-muted focus-visible:ring-brand-600 relative block aspect-square w-full overflow-hidden focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset"
              >
                {photo.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinado de um domínio de Storage dinâmico (por instalação); ver docs/decisions/0005.
                  <img
                    src={photo.thumbnailUrl}
                    alt="Fotografia do álbum"
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
              </button>
            ))}
          </div>

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

      {openIndex !== -1 && (
        <Lightbox
          photos={photos}
          initialIndex={openIndex}
          downloadEnabled={downloadEnabled}
          startInPresentationMode={presenting}
          onClose={handleClose}
          onIndexChange={updatePhotoParam}
        />
      )}
    </div>
  );
}
