"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { ListPhotosResult } from "@/server/use-cases/photos";

/**
 * Grelha simples (secção 22, Fase 4): só prova que os originais chegam
 * ao Drive e ficam visíveis através do preview. Masonry, paginação por
 * scroll, lightbox e subscrição em tempo real ficam para a Fase 5 — por
 * isso usa `<img>` simples em vez de `next/image` (os URLs assinados
 * apontam para um domínio de Storage que varia por instalação) e só
 * carrega a primeira página.
 */
export function PhotoGrid({ albumId }: { albumId: string }) {
  const query = useQuery({
    queryKey: ["albums", albumId, "photos"],
    queryFn: () =>
      apiFetch<ListPhotosResult>(`/api/albums/${albumId}/photos`),
  });

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

  const photos = query.data?.photos ?? [];

  if (photos.length === 0) {
    return (
      <div className="rounded-card border-border flex flex-1 flex-col items-center justify-center gap-2 border border-dashed px-8 py-16">
        <p className="text-foreground/70">
          Ainda não há fotografias neste álbum.
        </p>
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {photos.map((photo) => (
        <div
          key={photo.id}
          className="bg-surface-muted overflow-hidden rounded-md"
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
        </div>
      ))}
    </div>
  );
}
