"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import {
  CLIENT_OPTIMIZE_TRIGGER_BYTES,
  optimizeImageFile,
} from "@/lib/media/client-image-optimizer";

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
const TOO_LARGE_MESSAGE = "Ficheiro demasiado grande.";

/**
 * Substitui a pré-visualização por um ícone genérico quando o
 * `blob:` local não consegue carregar (ex.: um bloqueio de CSP
 * inesperado, ou um ficheiro que o browser não sabe decodificar) — nunca
 * o ícone de imagem partida do browser.
 */
const FALLBACK_PREVIEW =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' fill='%23e5e0da'/%3E%3Cpath d='M8 34l9-11 7 8 5-6 11 9v2H8z' fill='%23b8ada0'/%3E%3Ccircle cx='16' cy='16' r='4' fill='%23b8ada0'/%3E%3C/svg%3E";

type QueueStatus =
  "optimizing" | "queued" | "uploading" | "done" | "error" | "canceled";

interface QueueItem {
  id: string;
  clientUploadId: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  progress: number;
  errorMessage?: string;
  errorCode?: string;
}

class UploadCanceledError extends Error {}

class UploadHttpError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

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
      let code = "UNKNOWN_ERROR";
      try {
        const body = JSON.parse(xhr.responseText) as {
          error?: { message?: string; code?: string };
        };
        if (body.error?.message) message = body.error.message;
        if (body.error?.code) code = body.error.code;
      } catch {
        // A resposta não é JSON — mantém a mensagem/código genéricos.
      }
      reject(new UploadHttpError(message, code));
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
            errorCode:
              error instanceof UploadHttpError ? error.code : undefined,
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

  // Fotos grandes (câmara de telemóvel facilmente excede o limite de
  // 4 MB por pedido) são otimizadas no browser antes de entrarem na
  // fila de envio — ver lib/media/client-image-optimizer.ts.
  const optimizeItem = useCallback(
    async (item: QueueItem) => {
      const optimized = await optimizeImageFile(item.file);

      let previewUrl = item.previewUrl;
      if (optimized !== item.file) {
        previewUrl = URL.createObjectURL(optimized);
        previewUrls.current.push(previewUrl);
        URL.revokeObjectURL(item.previewUrl);
      }

      const tooLarge = optimized.size > MAX_FILE_BYTES;
      updateItem(item.id, {
        file: optimized,
        previewUrl,
        status: tooLarge ? "error" : "queued",
        errorMessage: tooLarge ? TOO_LARGE_MESSAGE : undefined,
      });
    },
    [updateItem],
  );

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
      // Ficheiros grandes passam primeiro pelo otimizador — só depois
      // (já mais pequenos, na maioria dos casos) é validado o limite.
      if (file.size > CLIENT_OPTIMIZE_TRIGGER_BYTES) {
        return {
          id,
          clientUploadId: crypto.randomUUID(),
          file,
          previewUrl,
          status: "optimizing",
          progress: 0,
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
    for (const item of newItems) {
      if (item.status === "optimizing") void optimizeItem(item);
    }
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
      errorCode: undefined,
      clientUploadId: crypto.randomUUID(),
    });
  }

  function handleDismiss(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  const doneCount = items.filter((item) => item.status === "done").length;

  return (
    // Botão flutuante fixo em baixo, em vez de um campo inline no topo
    // da página — a fila de miniaturas (quando há envios em curso)
    // aparece por cima do botão, dentro do mesmo grupo fixo.
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      {selectionError && (
        <p
          role="alert"
          className="bg-danger rounded-full px-4 py-1.5 text-center text-xs font-medium text-white shadow-lg"
        >
          {selectionError}
        </p>
      )}

      <div aria-live="polite" className="sr-only">
        {items.length > 0 &&
          `${doneCount} de ${items.length} fotografias enviadas`}
      </div>

      {items.length > 0 && (
        <ul className="border-border bg-surface/95 rounded-card flex max-w-full gap-1.5 overflow-x-auto border p-1.5 shadow-lg backdrop-blur">
          {items.map((item) => (
            <li
              key={item.id}
              className="bg-surface-muted relative h-16 w-16 shrink-0 overflow-hidden rounded-md"
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
                <div
                  className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1"
                  aria-label={`A enviar, ${item.progress}%`}
                >
                  <div className="h-1 overflow-hidden rounded-full bg-white/30">
                    <div
                      className="bg-brand-400 h-full transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {(item.status === "optimizing" || item.status === "queued") && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/30"
                  aria-label={
                    item.status === "optimizing" ? "A otimizar" : "Na fila"
                  }
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                </div>
              )}

              {item.status === "done" && (
                <div className="text-success absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}

              {item.status === "canceled" && (
                <div
                  className="absolute inset-0 bg-black/60"
                  aria-label="Envio cancelado"
                />
              )}

              {/* Duplicado (secção 13): não é um erro no sentido habitual
                  — a fotografia já está no álbum — por isso usa um tom
                  de aviso (âmbar), enquadrado com o resto da interface,
                  em vez do vermelho/preto genérico de falha. Ícone só
                  (sem texto): a miniatura de 64px não tem espaço para
                  frase + botão, por isso a ação (remover) fica no
                  próprio toque no ícone, com o texto completo acessível
                  via aria-label/title. */}
              {item.status === "error" &&
              item.errorCode === "PHOTO_DUPLICATE" ? (
                <button
                  type="button"
                  onClick={() => handleDismiss(item.id)}
                  aria-label="Já enviada para este álbum. Tocar para remover da lista."
                  title="Já enviada para este álbum — tocar para remover"
                  className="bg-surface/80 border-warning/50 absolute inset-0 flex items-center justify-center border"
                >
                  <span className="bg-warning/20 text-warning flex h-7 w-7 items-center justify-center rounded-full">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-8-5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm0 8.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                </button>
              ) : (
                item.status === "error" && (
                  <button
                    type="button"
                    onClick={() => handleRetry(item.id)}
                    aria-label={`Tentar novamente: ${item.errorMessage}`}
                    title={`${item.errorMessage} — tocar para tentar novamente`}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 transition active:scale-95 motion-reduce:active:scale-100"
                  >
                    <span
                      role="alert"
                      className="bg-danger/80 flex h-7 w-7 items-center justify-center rounded-full text-white"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 0 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  </button>
                )
              )}

              {(item.status === "queued" || item.status === "uploading") && (
                <button
                  type="button"
                  onClick={() => handleCancel(item.id)}
                  aria-label="Cancelar envio"
                  className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white transition active:scale-90 motion-reduce:active:scale-100"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-2.5 w-2.5"
                  >
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* `active:` também responde ao toque num `<label>`, por isso o
          botão principal ganha o mesmo sinal de clique dos restantes
          (sem `hover` no telemóvel, era o único sem resposta visual). */}
      <label className="bg-brand-600 hover:bg-brand-700 flex cursor-pointer items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition active:scale-95 motion-reduce:active:scale-100">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path
            fillRule="evenodd"
            d="M6.5 3.5A1.5 1.5 0 0 1 7.83 2.6l.5-1A1.5 1.5 0 0 1 9.67 1h.66a1.5 1.5 0 0 1 1.34 1.6l.5 1a1.5 1.5 0 0 0 1.33.9H15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h1.17a1.5 1.5 0 0 0 1.33-.9v-.1ZM10 13a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            clipRule="evenodd"
          />
        </svg>
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
    </div>
  );
}
