"use client";

import Link from "next/link";
import { ApiRequestError } from "@/lib/api/client";
import { useResolveAlbum } from "@/components/gallery/use-resolve-album";
import { PinGate } from "@/components/gallery/pin-gate";
import { UploadQueue } from "./upload-queue";

export function UploadPage({ token }: { token: string }) {
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

  const { album, permissions } = mutation.data;

  if (!permissions.includes("upload")) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <h1 className="text-foreground font-serif text-2xl font-semibold">
          O envio de fotografias não está disponível
        </h1>
        <p className="text-foreground/70 max-w-md text-sm">
          Este link não permite enviar fotografias para o álbum
          &ldquo;{album.title}&rdquo;.
        </p>
        <Link
          href={`/a/${token}`}
          className="text-foreground/70 hover:text-foreground text-sm underline"
        >
          Voltar ao álbum
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="safe-top border-border bg-background/90 sticky top-0 z-10 border-b px-4 py-3 backdrop-blur">
        <Link
          href={`/a/${token}`}
          className="text-foreground/60 hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path
              fillRule="evenodd"
              d="M12.79 5.23a.75.75 0 0 1 0 1.06L9.06 10l3.73 3.71a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
              clipRule="evenodd"
            />
          </svg>
          Voltar ao álbum
        </Link>
        <h1 className="text-foreground font-serif mt-1 truncate text-lg font-semibold sm:text-xl">
          Enviar fotografias — {album.title}
        </h1>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 sm:px-6">
        <UploadQueue albumId={album.id} />
      </div>
    </main>
  );
}
