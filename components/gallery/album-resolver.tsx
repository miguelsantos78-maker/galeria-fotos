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
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-16">
      <div className="text-center">
        <h1 className="text-foreground text-3xl font-semibold">
          {album.title}
        </h1>
        {album.description && (
          <p className="text-foreground/70 mt-2 max-w-xl">
            {album.description}
          </p>
        )}
      </div>

      {canUpload && (
        <Link
          href={`/a/${token}/upload`}
          className="bg-brand-600 hover:bg-brand-700 rounded-full px-5 py-2 text-sm font-medium text-white transition-colors"
        >
          Adicionar fotografias
        </Link>
      )}

      <PhotoGrid albumId={album.id} downloadEnabled={album.downloadEnabled} />
    </main>
  );
}
