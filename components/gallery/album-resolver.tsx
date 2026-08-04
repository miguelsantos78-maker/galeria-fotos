"use client";

import { ApiRequestError } from "@/lib/api/client";
import { UploadQueue } from "@/components/upload/upload-queue";
import { useResolveAlbum } from "./use-resolve-album";
import { PinGate } from "./pin-gate";
import { PhotoGrid } from "./photo-grid";

export function AlbumResolver({ token }: { token: string }) {
  const mutation = useResolveAlbum(token);

  const isPinError =
    mutation.isError &&
    mutation.error instanceof ApiRequestError &&
    (mutation.error.code === "ALBUM_PIN_REQUIRED" ||
      mutation.error.code === "ALBUM_PIN_INVALID");

  if (mutation.isPending || mutation.isIdle) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <p className="text-foreground/60 text-sm">A abrir álbum…</p>
      </main>
    );
  }

  if (isPinError) {
    return (
      <PinGate
        onSubmit={(pin) => mutation.mutate(pin)}
        isPending={mutation.isPending}
        error={mutation.error}
      />
    );
  }

  if (mutation.isError) {
    const message =
      mutation.error instanceof ApiRequestError
        ? mutation.error.message
        : "Não foi possível abrir este álbum. Tente novamente.";

    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <h1 className="text-foreground font-serif text-2xl font-semibold">
          Álbum indisponível
        </h1>
        <p role="alert" className="text-foreground/70 max-w-md text-sm">
          {message}
        </p>
      </main>
    );
  }

  const { album, permissions, isOwner } = mutation.data;
  const canUpload = permissions.includes("upload");

  return (
    <main className="flex flex-1 flex-col">
      <header className="safe-top from-brand-600/15 border-border border-b bg-gradient-to-b to-transparent px-6 pt-20 pb-14 text-center sm:pt-24 sm:pb-16">
        <div
          aria-hidden="true"
          className="mb-5 flex items-center justify-center gap-3"
        >
          <span className="bg-brand-600/40 h-px w-10 sm:w-14" />
          <span className="bg-brand-600 h-1.5 w-1.5 rounded-full" />
          <span className="bg-brand-600/40 h-px w-10 sm:w-14" />
        </div>
        <h1 className="text-foreground font-serif text-3xl font-semibold text-balance sm:text-4xl">
          {album.title}
        </h1>
        {album.description && (
          <p className="text-foreground/70 mx-auto mt-3 max-w-md text-sm text-balance">
            {album.description}
          </p>
        )}
      </header>

      {canUpload && (
        <div className="rounded-card border-brand-600/25 bg-brand-600/5 mx-4 my-5 flex flex-col gap-4 border p-5 sm:mx-6 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="bg-brand-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white">
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z" />
              </svg>
            </span>
            <div>
              <h2 className="text-foreground font-serif text-lg font-semibold">
                Adicionar fotografias
              </h2>
              <p className="text-foreground/70 text-sm">
                Partilhe as suas fotos deste dia com todos os convidados.
              </p>
            </div>
          </div>

          <UploadQueue albumId={album.id} />
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <PhotoGrid
          albumId={album.id}
          downloadEnabled={album.downloadEnabled}
          isOwner={isOwner}
        />
      </div>
    </main>
  );
}
