"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { ShareLinksManager } from "@/components/admin/share-links-manager";
import type { Database } from "@/lib/db/database.types";

type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];

export function AlbumDetail({ albumId }: { albumId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const albumQuery = useQuery({
    queryKey: ["albums", albumId],
    queryFn: () => apiFetch<AlbumRow>(`/api/albums/${albumId}`),
  });

  const statusMutation = useMutation({
    mutationFn: (status: AlbumRow["status"]) =>
      apiFetch<AlbumRow>(`/api/albums/${albumId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums", albumId] });
      queryClient.invalidateQueries({ queryKey: ["albums"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/albums/${albumId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      router.push("/admin/albums");
    },
  });

  if (albumQuery.isLoading) {
    return <p className="text-foreground/60 px-6 py-12 text-sm">A carregar…</p>;
  }

  if (albumQuery.isError || !albumQuery.data) {
    return (
      <p role="alert" className="text-danger px-6 py-12 text-sm">
        Não foi possível carregar este álbum.
      </p>
    );
  }

  const album = albumQuery.data;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">
            {album.title}
          </h1>
          <p className="text-foreground/60 text-sm">Estado: {album.status}</p>
        </div>
        <div className="flex gap-2">
          {album.status !== "published" && (
            <button
              type="button"
              onClick={() => statusMutation.mutate("published")}
              className="bg-brand-600 hover:bg-brand-700 rounded-full px-4 py-2 text-sm font-medium text-white"
            >
              Publicar
            </button>
          )}
          {album.status === "published" && (
            <button
              type="button"
              onClick={() => statusMutation.mutate("archived")}
              className="border-border text-foreground hover:bg-surface-muted rounded-full border px-4 py-2 text-sm font-medium"
            >
              Arquivar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Eliminar "${album.title}"? Esta ação não pode ser desfeita.`,
                )
              ) {
                deleteMutation.mutate();
              }
            }}
            className="border-danger/40 text-danger hover:bg-danger/10 rounded-full border px-4 py-2 text-sm font-medium"
          >
            Eliminar
          </button>
        </div>
      </header>

      {album.description && (
        <p className="text-foreground/80">{album.description}</p>
      )}

      <ShareLinksManager albumId={albumId} />
    </div>
  );
}
