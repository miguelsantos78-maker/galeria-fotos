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

  if (!permissions.includes("upload")) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <h1 className="text-foreground text-xl font-semibold">
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <Link
          href={`/a/${token}`}
          className="text-foreground/60 hover:text-foreground text-sm underline"
        >
          ← Voltar ao álbum
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-semibold">
          Enviar fotografias — {album.title}
        </h1>
      </div>

      <UploadQueue albumId={album.id} />
    </main>
  );
}
