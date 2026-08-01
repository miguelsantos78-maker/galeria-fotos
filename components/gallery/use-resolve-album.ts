"use client";

import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { ResolveAlbumResult } from "@/server/use-cases/resolve-album";

/**
 * Troca o token do link por uma `album_session` (secção 5.2) ao montar,
 * e outra vez sempre que o utilizador submeter um PIN. Partilhado entre
 * a página pública do álbum e a página de envio — ambas usam o mesmo
 * segmento `[slug]` (o token), por isso ambas precisam de resolver a
 * sessão da mesma forma.
 */
export function useResolveAlbum(token: string) {
  const mutation = useMutation({
    mutationFn: (pin?: string) =>
      apiFetch<ResolveAlbumResult>("/api/albums/resolve", {
        method: "POST",
        body: JSON.stringify(pin ? { token, pin } : { token }),
      }),
  });

  useEffect(() => {
    mutation.mutate(undefined);
    // Só corre uma vez, quando o token muda — não a cada nova referência de `mutation`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return mutation;
}
