"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

export function GoogleSignInButton({ next }: { next: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const callbackUrl = new URL("/api/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", next);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });

    if (signInError) {
      setError("Não foi possível iniciar sessão. Tente novamente.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="bg-brand-600 hover:bg-brand-700 inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "A abrir o Google…" : "Entrar com Google"}
      </button>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
