"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { PHOTO_STATUS_LABELS } from "@/lib/media/photo-status-labels";
import type { AdminPhotoView } from "@/server/use-cases/admin-photo-view";
import type { BatchModerationResult } from "@/server/use-cases/moderation";

type SortBy = "uploaded_at" | "captured_at";

const SORT_LABELS: Record<SortBy, string> = {
  uploaded_at: "Data de envio",
  captured_at: "Data de captura",
};

export function PhotoModeration({ albumId }: { albumId: string }) {
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<SortBy>("uploaded_at");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queryKey = ["albums", albumId, "photos", "moderation", sortBy];

  const photosQuery = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<AdminPhotoView[]>(
        `/api/albums/${albumId}/photos/moderation?sortBy=${sortBy}`,
      ),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({
      queryKey: ["albums", albumId, "photos", "moderation"],
    });
  }

  const updateMutation = useMutation({
    mutationFn: ({
      photoId,
      patch,
    }: {
      photoId: string;
      patch: Record<string, unknown>;
    }) =>
      apiFetch<AdminPhotoView>(`/api/photos/${photoId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) =>
      apiFetch(`/api/photos/${photoId}`, { method: "DELETE" }),
    onSuccess: (_data, photoId) => {
      setSelected((current) => {
        const next = new Set(current);
        next.delete(photoId);
        return next;
      });
      invalidateAll();
    },
  });

  const batchMutation = useMutation({
    mutationFn: ({
      action,
      photoIds,
    }: {
      action: "approve" | "hide" | "delete";
      photoIds: string[];
    }) =>
      apiFetch<BatchModerationResult>(
        `/api/albums/${albumId}/photos/batch`,
        {
          method: "POST",
          body: JSON.stringify({ action, photoIds }),
        },
      ),
    onSuccess: () => {
      setSelected(new Set());
      invalidateAll();
    },
  });

  function toggleSelected(photoId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function runBatch(action: "approve" | "hide" | "delete") {
    if (selected.size === 0) return;
    if (
      action === "delete" &&
      !window.confirm(
        `Eliminar ${selected.size} fotografia(s)? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    batchMutation.mutate({ action, photoIds: Array.from(selected) });
  }

  if (photosQuery.isLoading) {
    return <p className="text-foreground/60 text-sm">A carregar…</p>;
  }

  if (photosQuery.isError) {
    return (
      <p role="alert" className="text-danger text-sm">
        Não foi possível carregar as fotografias.
      </p>
    );
  }

  const photos = photosQuery.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-foreground text-lg font-medium">Fotografias</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-foreground/60">Ordenar por:</span>
          {(Object.keys(SORT_LABELS) as SortBy[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSortBy(option)}
              className={
                option === sortBy
                  ? "bg-brand-600 rounded-full px-3 py-1 font-medium text-white"
                  : "border-border text-foreground hover:bg-surface-muted rounded-full border px-3 py-1"
              }
            >
              {SORT_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="rounded-card border-border bg-surface-muted flex flex-wrap items-center gap-3 border px-4 py-2.5 text-sm">
          <span className="text-foreground font-medium">
            {selected.size} selecionada(s)
          </span>
          <button
            type="button"
            onClick={() => runBatch("approve")}
            disabled={batchMutation.isPending}
            className="border-border text-foreground hover:bg-surface rounded-full border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => runBatch("hide")}
            disabled={batchMutation.isPending}
            className="border-border text-foreground hover:bg-surface rounded-full border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Ocultar
          </button>
          <button
            type="button"
            onClick={() => runBatch("delete")}
            disabled={batchMutation.isPending}
            className="border-danger/40 text-danger hover:bg-danger/10 rounded-full border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Eliminar
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-foreground/60 hover:text-foreground underline"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {batchMutation.data && batchMutation.data.failed.length > 0 && (
        <p role="alert" className="text-danger text-sm">
          {batchMutation.data.failed.length} fotografia(s) não puderam ser
          processadas.
        </p>
      )}

      {photos.length === 0 ? (
        <p className="text-foreground/60 text-sm">
          Ainda não há fotografias neste álbum.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="rounded-card border-border bg-surface flex flex-col gap-2 border p-2"
            >
              <div className="relative">
                <input
                  type="checkbox"
                  checked={selected.has(photo.id)}
                  onChange={() => toggleSelected(photo.id)}
                  aria-label={`Selecionar ${photo.originalFilename}`}
                  className="absolute top-1 left-1 h-4 w-4"
                />
                <div className="bg-surface-muted aspect-square overflow-hidden rounded-md">
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
              </div>

              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="bg-surface-muted text-foreground/70 rounded-full px-2 py-0.5">
                  {PHOTO_STATUS_LABELS[photo.status]}
                </span>
                {photo.isFeatured && (
                  <span className="bg-warning/15 text-warning rounded-full px-2 py-0.5">
                    Destaque
                  </span>
                )}
                {photo.isCover && (
                  <span className="bg-brand-600/15 text-brand-600 rounded-full px-2 py-0.5">
                    Capa
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1 text-xs">
                {photo.status === "pending_review" && (
                  <button
                    type="button"
                    onClick={() =>
                      updateMutation.mutate({
                        photoId: photo.id,
                        patch: { status: "ready" },
                      })
                    }
                    className="border-border text-foreground hover:bg-surface-muted rounded-full border px-2 py-1"
                  >
                    Aprovar
                  </button>
                )}
                {photo.status === "ready" && (
                  <button
                    type="button"
                    onClick={() =>
                      updateMutation.mutate({
                        photoId: photo.id,
                        patch: { status: "hidden" },
                      })
                    }
                    className="border-border text-foreground hover:bg-surface-muted rounded-full border px-2 py-1"
                  >
                    Ocultar
                  </button>
                )}
                {photo.status === "hidden" && (
                  <button
                    type="button"
                    onClick={() =>
                      updateMutation.mutate({
                        photoId: photo.id,
                        patch: { status: "ready" },
                      })
                    }
                    className="border-border text-foreground hover:bg-surface-muted rounded-full border px-2 py-1"
                  >
                    Republicar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    updateMutation.mutate({
                      photoId: photo.id,
                      patch: { isFeatured: !photo.isFeatured },
                    })
                  }
                  className="border-border text-foreground hover:bg-surface-muted rounded-full border px-2 py-1"
                >
                  {photo.isFeatured ? "Remover destaque" : "Destacar"}
                </button>
                {!photo.isCover && (
                  <button
                    type="button"
                    onClick={() =>
                      updateMutation.mutate({
                        photoId: photo.id,
                        patch: { setAsCover: true },
                      })
                    }
                    className="border-border text-foreground hover:bg-surface-muted rounded-full border px-2 py-1"
                  >
                    Definir como capa
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Eliminar esta fotografia? Esta ação não pode ser desfeita.",
                      )
                    ) {
                      deleteMutation.mutate(photo.id);
                    }
                  }}
                  className="border-danger/40 text-danger hover:bg-danger/10 rounded-full border px-2 py-1"
                >
                  Eliminar
                </button>
              </div>

              {updateMutation.isError &&
                updateMutation.variables?.photoId === photo.id && (
                  <p role="alert" className="text-danger text-xs">
                    {updateMutation.error instanceof ApiRequestError
                      ? updateMutation.error.message
                      : "Não foi possível atualizar."}
                  </p>
                )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
