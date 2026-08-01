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

type QueueStatus = "queued" | "uploading" | "done" | "error" | "canceled";

interface QueueItem {
  id: string;
  clientUploadId: string;
  file: File;
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
  const [consentGiven, setConsentGiven] = useState(false);
  const xhrByItemId = useRef(new Map<string, XMLHttpRequest>());
  const activeCountRef = useRef(0);

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
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return {
          id,
          clientUploadId: crypto.randomUUID(),
          file,
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
          status: "error",
          progress: 0,
          errorMessage: "Ficheiro demasiado grande.",
        };
      }
      return {
        id,
        clientUploadId: crypto.randomUUID(),
        file,
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
    <section className="rounded-card border-border bg-surface flex flex-col gap-4 border p-6">
      <h2 className="text-foreground text-lg font-medium">
        Adicionar fotografias
      </h2>

      <label className="text-foreground/80 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consentGiven}
          onChange={(event) => setConsentGiven(event.target.checked)}
          className="mt-0.5"
        />
        As fotografias que enviar ficam visíveis a todas as pessoas com
        acesso a este álbum. Só envie fotografias que possa partilhar.
      </label>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!consentGiven) return;
          handleFilesSelected(event.dataTransfer.files);
        }}
        className="border-border rounded-card flex flex-col items-center gap-3 border border-dashed px-6 py-10 text-center"
      >
        <p className="text-foreground/70 text-sm">
          Arraste fotografias para aqui, ou
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <label className="bg-brand-600 hover:bg-brand-700 cursor-pointer rounded-full px-5 py-2 text-sm font-medium text-white transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
            Escolher ficheiros
            <input
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              disabled={!consentGiven}
              onChange={(event) => {
                handleFilesSelected(event.target.files);
                event.target.value = "";
              }}
              className="sr-only"
            />
          </label>
          <label className="border-border text-foreground hover:bg-surface-muted cursor-pointer rounded-full border px-5 py-2 text-sm font-medium transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
            Tirar fotografia
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={!consentGiven}
              onChange={(event) => {
                handleFilesSelected(event.target.files);
                event.target.value = "";
              }}
              className="sr-only"
            />
          </label>
        </div>
        {!consentGiven && (
          <p className="text-foreground/70 text-xs">
            Aceite as condições acima para poder enviar fotografias.
          </p>
        )}
      </div>

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
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-card border-border flex items-center gap-3 border px-4 py-2.5 text-sm"
            >
              <span className="text-foreground/80 flex-1 truncate">
                {item.file.name}
              </span>

              {item.status === "queued" && (
                <span className="text-foreground/70 text-xs">Na fila…</span>
              )}

              {item.status === "uploading" && (
                <div className="flex items-center gap-2">
                  <div className="bg-surface-muted h-1.5 w-24 overflow-hidden rounded-full">
                    <div
                      className="bg-brand-600 h-full transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className="text-foreground/60 w-9 text-right text-xs">
                    {item.progress}%
                  </span>
                </div>
              )}

              {item.status === "done" && (
                <span className="text-success text-xs">Enviada</span>
              )}

              {item.status === "canceled" && (
                <span className="text-foreground/70 text-xs">Cancelada</span>
              )}

              {item.status === "error" && (
                <span role="alert" className="text-danger text-xs">
                  {item.errorMessage}
                </span>
              )}

              {(item.status === "queued" || item.status === "uploading") && (
                <button
                  type="button"
                  onClick={() => handleCancel(item.id)}
                  className="text-foreground/60 hover:text-foreground text-xs underline"
                >
                  Cancelar
                </button>
              )}

              {item.status === "error" && (
                <button
                  type="button"
                  onClick={() => handleRetry(item.id)}
                  className="text-foreground/60 hover:text-foreground text-xs underline"
                >
                  Tentar novamente
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
