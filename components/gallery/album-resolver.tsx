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
      <header className="safe-top px-4 pt-6 sm:px-6 sm:pt-8">
        {album.coverPhotoUrl ? (
          <div className="rounded-card border-border mx-auto max-w-2xl overflow-hidden border shadow-md">
            <div className="relative h-72 sm:h-80">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL assinado do Supabase Storage, gerado por pedido (secção 5.4); decorativa, o título ao lado já descreve o álbum. */}
              <img
                src={album.coverPhotoUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="rounded-card border-border/40 bg-surface/60 absolute inset-x-3 bottom-3 border p-5 text-center shadow-lg backdrop-blur-md sm:p-6">
                <div
                  aria-hidden="true"
                  className="mb-4 flex items-center justify-center gap-3"
                >
                  <span className="bg-brand-600/40 h-px w-8 sm:w-10" />
                  <span className="bg-brand-600 h-1.5 w-1.5 rounded-full" />
                  <span className="bg-brand-600/40 h-px w-8 sm:w-10" />
                </div>
                <h1 className="text-foreground font-serif text-2xl font-semibold text-balance sm:text-3xl">
                  {album.title}
                </h1>
                {album.description && (
                  <p className="text-foreground/80 mx-auto mt-2 max-w-md text-sm text-balance">
                    {album.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-card border-border bg-surface mx-auto max-w-2xl border p-8 text-center shadow-md sm:p-10">
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
          </div>
        )}
      </header>

      <div
        className={`flex flex-1 flex-col ${canUpload ? "pb-36 sm:pb-40" : ""}`}
      >
        <PhotoGrid
          albumId={album.id}
          downloadEnabled={album.downloadEnabled}
          isOwner={isOwner}
        />
      </div>

      {canUpload && <UploadQueue albumId={album.id} />}
    </main>
  );
}
