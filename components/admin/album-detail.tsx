"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { ShareLinksManager } from "@/components/admin/share-links-manager";
import { PhotoModeration } from "@/components/admin/photo-moderation";
import type { Database } from "@/lib/db/database.types";

type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];

/** Espelha `title: z.string().trim().min(1).max(200)` em
 * `lib/validation/album.ts` — só para desativar o botão "Guardar" mais
 * cedo; o servidor volta sempre a validar. */
const TITLE_MAX_LENGTH = 200;

export function AlbumDetail({ albumId }: { albumId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

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

  // O slug (usado no link partilhado) nunca muda com isto — só o
  // título visível. `lib/validation/album.ts` já valida no servidor;
  // aqui só evitamos um pedido óbvio de ir dar erro.
  const renameMutation = useMutation({
    mutationFn: (title: string) =>
      apiFetch<AlbumRow>(`/api/albums/${albumId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums", albumId] });
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      setIsEditingTitle(false);
    },
  });

  function startEditingTitle(currentTitle: string) {
    setTitleDraft(currentTitle);
    renameMutation.reset();
    setIsEditingTitle(true);
  }

  function submitTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed.length > TITLE_MAX_LENGTH) return;
    renameMutation.mutate(trimmed);
  }

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
    // max-w-3xl chegava para o cabeçalho e os links, mas deixava a
    // grelha de fotografias presa a 3 colunas com uma faixa enorme de
    // espaço vazio ao lado em ecrãs largos — só essa secção precisa da
    // largura extra, mas mover só ela não valia a complexidade de dois
    // contentores; o cabeçalho e os links de partilha continuam
    // confortáveis num contentor mais largo, por usarem linhas com
    // `flex-wrap` em vez de texto corrido.
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-14">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitTitle();
                    if (event.key === "Escape") setIsEditingTitle(false);
                  }}
                  maxLength={TITLE_MAX_LENGTH}
                  autoFocus
                  aria-label="Nome do álbum"
                  className="border-border bg-surface text-foreground rounded-md border px-3 py-1.5 font-serif text-2xl font-semibold sm:text-3xl"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitTitle}
                  disabled={renameMutation.isPending || !titleDraft.trim()}
                  className="bg-brand-600 hover:bg-brand-700 rounded-full px-3.5 py-1.5 text-xs font-medium text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:active:scale-100"
                >
                  {renameMutation.isPending ? "A guardar…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  disabled={renameMutation.isPending}
                  className="border-border text-foreground hover:bg-surface-muted rounded-full border px-3.5 py-1.5 text-xs font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:active:scale-100"
                >
                  Cancelar
                </button>
              </div>
              {renameMutation.isError && (
                <p role="alert" className="text-danger text-xs">
                  {renameMutation.error instanceof ApiRequestError
                    ? renameMutation.error.message
                    : "Não foi possível guardar o novo nome."}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-foreground font-serif text-2xl font-semibold text-balance sm:text-3xl">
                {album.title}
              </h1>
              <button
                type="button"
                onClick={() => startEditingTitle(album.title)}
                aria-label="Editar nome do álbum"
                title="Editar nome"
                className="text-foreground/50 hover:text-foreground hover:bg-surface-muted rounded-full p-1.5 transition active:scale-90 motion-reduce:active:scale-100"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-8.5 8.5a2 2 0 0 1-.878.507l-3 .857a.5.5 0 0 1-.618-.618l.857-3a2 2 0 0 1 .507-.878l8.5-8.5Z" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-foreground/60 mt-1 text-sm">
            Estado: {album.status}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
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

      <PhotoModeration albumId={albumId} />
    </div>
  );
}
