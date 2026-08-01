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
    <div className="flex w-full flex-col gap-4">
      {!isConnected && (
        <p role="status" className="text-foreground/50 text-center text-xs">
          Ligação em tempo real indisponível — a atualizar periodicamente.
        </p>
      )}

      {photos.length === 0 ? (
        <div className="rounded-card border-border flex flex-1 flex-col items-center justify-center gap-2 border border-dashed px-8 py-16">
          <p className="text-foreground/70">
            Ainda não há fotografias neste álbum.
          </p>
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={openPresentation}
              className="border-border text-foreground hover:bg-surface-muted rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
            >
              Apresentação
            </button>
          </div>

          <div className="columns-2 gap-2 sm:columns-3 md:columns-4">
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => updatePhotoParam(photo.id)}
                className="bg-surface-muted mb-2 block w-full overflow-hidden rounded-md break-inside-avoid"
                style={{
                  aspectRatio:
                    photo.width && photo.height
                      ? `${photo.width} / ${photo.height}`
                      : "1 / 1",
                }}
              >
                {photo.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinado de um domínio de Storage dinâmico (por instalação); ver docs/decisions/0005.
                  <img
                    src={photo.thumbnailUrl}
                    alt="Fotografia do álbum"
                    loading="lazy"
                    className="h-full w-full object-cover"
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
              className="border-border text-foreground hover:bg-surface-muted mx-auto rounded-full border px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
