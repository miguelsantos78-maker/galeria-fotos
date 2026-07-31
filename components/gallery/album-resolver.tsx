"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { ResolveAlbumResult } from "@/server/use-cases/resolve-album";

async function resolve(token: string, pin?: string) {
  return apiFetch<ResolveAlbumResult>("/api/albums/resolve", {
    method: "POST",
    body: JSON.stringify(pin ? { token, pin } : { token }),
  });
}

export function AlbumResolver({ token }: { token: string }) {
  const [pinInput, setPinInput] = useState("");
  const [pinWasTried, setPinWasTried] = useState(false);

  const mutation = useMutation({
    mutationFn: (pin?: string) => resolve(token, pin),
  });

  useEffect(() => {
    mutation.mutate(undefined);
    // Só corre uma vez, quando o token muda — não a cada nova referência de `mutation`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function handlePinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPinWasTried(true);
    mutation.mutate(pinInput);
  }

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
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="text-foreground text-xl font-semibold">
          Este álbum está protegido por PIN
        </h1>
        <form
          onSubmit={handlePinSubmit}
          className="flex flex-col items-center gap-3"
        >
          <input
            type="text"
            inputMode="numeric"
            placeholder="PIN"
            value={pinInput}
            onChange={(event) => setPinInput(event.target.value)}
            className="border-border bg-background w-32 rounded-md border px-3 py-2 text-center text-sm"
            autoFocus
          />
          {pinWasTried &&
            mutation.error instanceof ApiRequestError &&
            mutation.error.code === "ALBUM_PIN_INVALID" && (
              <p role="alert" className="text-danger text-sm">
                PIN incorreto.
              </p>
            )}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 rounded-full px-5 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "A verificar…" : "Continuar"}
          </button>
        </form>
      </main>
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

  const { album } = mutation.data;

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-16 text-center">
      <div>
        <h1 className="text-foreground text-3xl font-semibold">
          {album.title}
        </h1>
        {album.description && (
          <p className="text-foreground/70 mt-2 max-w-xl">
            {album.description}
          </p>
        )}
      </div>
      <div className="rounded-card border-border flex flex-1 flex-col items-center justify-center gap-2 border border-dashed px-8 py-16">
        <p className="text-foreground/70">
          Ainda não há fotografias neste álbum.
        </p>
        <p className="text-foreground/50 text-sm">
          O envio de fotografias fica disponível numa fase seguinte do projeto.
        </p>
      </div>
    </main>
  );
}
