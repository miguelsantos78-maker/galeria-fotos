"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { createAlbumSchema } from "@/lib/validation/album";
import type { Database } from "@/lib/db/database.types";

type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];

const STATUS_LABELS: Record<AlbumRow["status"], string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
};

const VISIBILITY_LABELS: Record<AlbumRow["visibility"], string> = {
  private: "Privado",
  unlisted: "Não listado",
  public: "Público",
};

const createAlbumFormSchema = createAlbumSchema.pick({
  title: true,
  description: true,
  visibility: true,
  moderationEnabled: true,
});

type CreateAlbumFormValues = z.input<typeof createAlbumFormSchema>;

export function AlbumsList() {
  const queryClient = useQueryClient();

  const albumsQuery = useQuery({
    queryKey: ["albums"],
    queryFn: () => apiFetch<AlbumRow[]>("/api/albums"),
  });

  const form = useForm<CreateAlbumFormValues>({
    resolver: zodResolver(createAlbumFormSchema),
    defaultValues: {
      title: "",
      description: "",
      visibility: "unlisted",
      moderationEnabled: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateAlbumFormValues) =>
      apiFetch<AlbumRow>("/api/albums", {
        method: "POST",
        body: JSON.stringify(createAlbumFormSchema.parse(values)),
      }),
    onSuccess: () => {
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["albums"] });
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-14">
      <header className="flex items-center justify-between">
        <h1 className="text-foreground font-serif text-2xl font-semibold sm:text-3xl">
          Álbuns
        </h1>
        <Link
          href="/admin/settings/integrations"
          className="text-foreground/60 hover:text-foreground text-sm underline-offset-2 hover:underline"
        >
          Integração Google Drive
        </Link>
      </header>

      <form
        onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        className="rounded-card border-border bg-surface flex flex-col gap-4 border p-6"
      >
        <h2 className="text-foreground text-lg font-medium">Criar álbum</h2>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="title"
            className="text-foreground text-sm font-medium"
          >
            Título
          </label>
          <input
            id="title"
            type="text"
            className="border-border bg-background rounded-md border px-3 py-2 text-sm"
            {...form.register("title")}
          />
          {form.formState.errors.title && (
            <p className="text-danger text-sm">
              {form.formState.errors.title.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="description"
            className="text-foreground text-sm font-medium"
          >
            Descrição
          </label>
          <textarea
            id="description"
            rows={3}
            className="border-border bg-background rounded-md border px-3 py-2 text-sm"
            {...form.register("description")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="visibility"
            className="text-foreground text-sm font-medium"
          >
            Visibilidade
          </label>
          <select
            id="visibility"
            className="border-border bg-background rounded-md border px-3 py-2 text-sm"
            {...form.register("visibility")}
          >
            <option value="unlisted">Não listado (link partilhado)</option>
            <option value="private">Privado</option>
            <option value="public">Público</option>
          </select>
        </div>

        <label className="text-foreground flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register("moderationEnabled")} />
          Exigir aprovação antes de as fotografias ficarem visíveis
        </label>

        {createMutation.isError && (
          <p role="alert" className="text-danger text-sm">
            {createMutation.error instanceof ApiRequestError
              ? createMutation.error.message
              : "Não foi possível criar o álbum."}
          </p>
        )}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="bg-brand-600 hover:bg-brand-700 self-start rounded-full px-5 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createMutation.isPending ? "A criar…" : "Criar álbum"}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        {albumsQuery.isLoading && (
          <p className="text-foreground/60 text-sm">A carregar álbuns…</p>
        )}

        {albumsQuery.isError && (
          <p role="alert" className="text-danger text-sm">
            Não foi possível carregar os álbuns.
          </p>
        )}

        {albumsQuery.data?.length === 0 && (
          <p className="text-foreground/60 text-sm">
            Ainda não criou nenhum álbum.
          </p>
        )}

        {albumsQuery.data?.map((album) => (
          <Link
            key={album.id}
            href={`/admin/albums/${album.id}`}
            className="rounded-card border-border bg-surface hover:bg-surface-muted flex items-center justify-between border px-4 py-3 transition-colors"
          >
            <div>
              <p className="text-foreground font-medium">{album.title}</p>
              <p className="text-foreground/60 text-sm">
                {VISIBILITY_LABELS[album.visibility]}
              </p>
            </div>
            <span className="bg-surface-muted text-foreground/70 rounded-full px-3 py-1 text-xs font-medium">
              {STATUS_LABELS[album.status]}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
