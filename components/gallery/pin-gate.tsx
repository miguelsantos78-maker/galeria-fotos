"use client";

import { useState, type FormEvent } from "react";
import { ApiRequestError } from "@/lib/api/client";

/** Formulário de PIN, partilhado entre a galeria e a página de envio. */
export function PinGate({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (pin: string) => void;
  isPending: boolean;
  error: unknown;
}) {
  const [pinInput, setPinInput] = useState("");
  const [pinWasTried, setPinWasTried] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPinWasTried(true);
    onSubmit(pinInput);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <h1 className="text-foreground font-serif text-2xl font-semibold">
        Este álbum está protegido por PIN
      </h1>
      <form
        onSubmit={handleSubmit}
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
          error instanceof ApiRequestError &&
          error.code === "ALBUM_PIN_INVALID" && (
            <p role="alert" className="text-danger text-sm">
              PIN incorreto.
            </p>
          )}
        <button
          type="submit"
          disabled={isPending}
          className="bg-brand-600 hover:bg-brand-700 rounded-full px-5 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "A verificar…" : "Continuar"}
        </button>
      </form>
    </main>
  );
}
