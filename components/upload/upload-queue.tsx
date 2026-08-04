"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

/**
 * Espelham os valores por omissão de `MAX_UPLOAD_BYTES`/
 * `MAX_FILES_PER_UPLOAD` em `lib/env.ts` — o browser não tem acesso às
 * variáveis de servidor, por isso só serve de validação rápida no
 * cliente (secção 10.3); o servidor volta sempre a validar os limites
 * reais configurados (`server/use-cases/uploads.ts`). Valor baixo por
 * causa do limite de 4,5 MB por pedido nas Serverless Functions da
 * Vercel (docs/decisions/0009-deploy-vercel.md) — não é uma restrição
 * do Google Drive nem do Supabase.
 */
const MAX_FILE_BYTES = 4_000_000;
const MAX_FILES = 50;
const MAX_CONCURRENT_UPLOADS = 3;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Substitui a pré-visualização por um ícone genérico quando o
 * `blob:` local não consegue carregar (ex.: um bloqueio de CSP
 * inesperado, ou um ficheiro que o browser não sabe decodificar) — nunca
 * o ícone de imagem partida do browser.
 */
const FALLBACK_PREVIEW =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' fill='%23e5e0da'/%3E%3Cpath d='M8 34l9-11 7 8 5-6 11 9v2H8z' fill='%23b8ada0'/%3E%3Ccircle cx='16' cy='16' r='4' fill='%23b8ada0'/%3E%3C/svg%3E";

type QueueStatus = "queued" | "uploading" | "done" | "error" | "canceled";

interface QueueItem {
  id: string;
  clientUploadId: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  progress: number;
  errorMessage?: string;
}

class UploadCanceledError extends Error {}

function uploadFileWithProgress(options: {
  url: string;
  file: File;
  onProgress: (percent: number) => void;
  registerXhr: (xhr: XMLHttpRequest) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    options.registerXhr(xhr);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        options.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = "Não foi possível enviar esta fotografia.";
      try {
        const body = JSON.parse(xhr.responseText) as {
          error?: { message?: string };
        };
        if (body.error?.message) message = body.error.message;
      } catch {
        // A resposta não é JSON — mantém a mensagem genérica.
      }
      reject(new Error(message));
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Falha de rede ao enviar a fotografia.")),
    );
    xhr.addEventListener("abort", () => reject(new UploadCanceledError()));

    const formData = new FormData();
    formData.append("file", options.file);

    xhr.open("POST", options.url);
    xhr.send(formData);
  });
}

export function UploadQueue({ albumId }: { albumId: string }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const xhrByItemId = useRef(new Map<string, XMLHttpRequest>());
  const activeCountRef = useRef(0);
  const previewUrls = useRef<string[]>([]);

  // As pré-visualizações são locais (URL.createObjectURL) — só fazem
  // sentido enquanto esta página está montada; libertar a memória ao sair.
  // O cleanup tem mesmo de ler `.current` no momento em que desmonta (não
  // uma cópia feita no mount), porque a lista cresce a cada seleção.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentário acima
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
    };
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const runUpload = useCallback(
    async (item: QueueItem) => {
      updateItem(item.id, { status: "uploading", progress: 0 });

      try {
        const initiated = await apiFetch<{ uploadId: string }>(
          `/api/albums/${albumId}/uploads`,
          {
            method: "POST",
            body: JSON.stringify({
              clientUploadId: item.clientUploadId,
              filename: item.file.name,
              expectedSize: item.file.size,
            }),
          },
        );

        await uploadFileWithProgress({
          url: `/api/albums/${albumId}/uploads/${initiated.uploadId}/complete`,
          file: item.file,
          onProgress: (progress) => updateItem(item.id, { progress }),
          registerXhr: (xhr) => xhrByItemId.current.set(item.id, xhr),
        });

        xhrByItemId.current.delete(item.id);
        updateItem(item.id, { status: "done", progress: 100 });
        queryClient.invalidateQueries({
          queryKey: ["albums", albumId, "photos"],
        });
      } catch (error) {
        xhrByItemId.current.delete(item.id);
        if (error instanceof UploadCanceledError) {
          updateItem(item.id, { status: "canceled" });
        } else {
          updateItem(item.id, {
            status: "error",
            errorMessage:
              error instanceof Error
                ? error.message
                : "Não foi possível enviar esta fotografia.",
          });
        }
      } finally {
        activeCountRef.current -= 1;
      }
    },
    [albumId, queryClient, updateItem],
  );

  // Backpressure da fila: no máximo 3 envios em simultâneo (secção 16).
  useEffect(() => {
    const queued = items.filter((item) => item.status === "queued");
    for (const item of queued) {
      if (activeCountRef.current >= MAX_CONCURRENT_UPLOADS) break;
      activeCountRef.current += 1;
      void runUpload(item);
    }
  }, [items, runUpload]);

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    if (items.length + files.length > MAX_FILES) {
      setSelectionError(
        `Pode enviar no máximo ${MAX_FILES} fotografias de cada vez.`,
      );
      return;
    }
    setSelectionError(null);

    const newItems: QueueItem[] = files.map((file) => {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.push(previewUrl);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        return {
          id,
          clientUploadId: crypto.randomUUID(),
          file,
          previewUrl,
          status: "error",
          progress: 0,
          errorMessage: "Formato não suportado. Envie JPEG, PNG ou WebP.",
        };
      }
      if (file.size > MAX_FILE_BYTES) {
        return {
          id,
          clientUploadId: crypto.randomUUID(),
          file,
          previewUrl,
          status: "error",
          progress: 0,
          errorMessage: "Ficheiro demasiado grande.",
        };
      }
      return {
        id,
        clientUploadId: crypto.randomUUID(),
        file,
        previewUrl,
        status: "queued",
        progress: 0,
      };
    });

    setItems((current) => [...current, ...newItems]);
  }

  function handleCancel(itemId: string) {
    const xhr = xhrByItemId.current.get(itemId);
    if (xhr) {
      xhr.abort();
    } else {
      updateItem(itemId, { status: "canceled" });
    }
  }

  function handleRetry(itemId: string) {
    updateItem(itemId, {
      status: "queued",
      progress: 0,
      errorMessage: undefined,
      clientUploadId: crypto.randomUUID(),
    });
  }

  const doneCount = items.filter((item) => item.status === "done").length;

  return (
    <div className="flex flex-col gap-4">
      <label className="bg-brand-600 hover:bg-brand-700 flex w-full cursor-pointer items-center justify-center rounded-full px-5 py-3 text-center text-sm font-medium text-white transition-colors">
        Escolher ou tirar fotografias
        <input
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          onChange={(event) => {
            handleFilesSelected(event.target.files);
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>

      {selectionError && (
        <p role="alert" className="text-danger text-sm">
          {selectionError}
        </p>
      )}

      <div aria-live="polite" className="sr-only">
        {items.length > 0 &&
          `${doneCount} de ${items.length} fotografias enviadas`}
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="bg-surface-muted rounded-card relative aspect-square overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- pré-visualização local via URL.createObjectURL, nunca um URL remoto. */}
              <img
                src={item.previewUrl}
                alt={item.file.name}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = FALLBACK_PREVIEW;
                }}
                className="absolute inset-0 h-full w-full object-cover"
              />

              {item.status === "uploading" && (
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-black/60 px-2 py-1.5">
                  <div className="h-1 overflow-hidden rounded-full bg-white/30">
                    <div
                      className="bg-brand-400 h-full transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-white">
                    {item.progress}%
                  </span>
                </div>
              )}

              {item.status === "queued" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white">
                    Na fila…
                  </span>
                </div>
              )}

              {item.status === "done" && (
                <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-success">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}

              {(item.status === "canceled" || item.status === "error") && (
                <button
                  type="button"
                  onClick={() =>
                    item.status === "error"
                      ? handleRetry(item.id)
                      : undefined
                  }
                  aria-label={
                    item.status === "error"
                      ? `Tentar novamente: ${item.errorMessage}`
                      : "Envio cancelado"
                  }
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 px-2 text-center text-white disabled:cursor-default"
                  disabled={item.status === "canceled"}
                >
                  <span role={item.status === "error" ? "alert" : undefined} className="text-[11px] font-medium">
                    {item.status === "error" ? item.errorMessage : "Cancelada"}
                  </span>
                  {item.status === "error" && (
                    <span className="text-[11px] font-semibold underline">
                      Tentar novamente
                    </span>
                  )}
                </button>
              )}

              {(item.status === "queued" || item.status === "uploading") && (
                <button
                  type="button"
                  onClick={() => handleCancel(item.id)}
                  aria-label="Cancelar envio"
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
