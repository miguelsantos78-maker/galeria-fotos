"use client";

import Link from "next/link";
import { ApiRequestError } from "@/lib/api/client";
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
        <h1 className="text-foreground text-xl font-semibold">
          Álbum indisponível
        </h1>
        <p role="alert" className="text-foreground/70 max-w-md text-sm">
          {message}
        </p>
      </main>
    );
  }

  const { album, permissions } = mutation.data;
  const canUpload = permissions.includes("upload");

  return (
    <main className="flex flex-1 flex-col">
      <header className="safe-top border-border bg-background/90 sticky top-0 z-10 border-b px-4 py-3 backdrop-blur">
        <h1 className="text-foreground truncate text-lg font-semibold">
          {album.title}
        </h1>
        {album.description && (
          <p className="text-foreground/70 mt-0.5 truncate text-xs">
            {album.description}
          </p>
        )}
      </header>

      <div className="flex flex-1 flex-col pb-24">
        <PhotoGrid albumId={album.id} downloadEnabled={album.downloadEnabled} />
      </div>

      {canUpload && (
        <Link
          href={`/a/${token}/upload`}
          className="fab-bottom bg-brand-600 hover:bg-brand-700 active:bg-brand-700 fixed right-5 z-20 inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-medium text-white shadow-lg transition-colors"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z" />
          </svg>
          Adicionar fotografias
        </Link>
      )}
    </main>
  );
}
