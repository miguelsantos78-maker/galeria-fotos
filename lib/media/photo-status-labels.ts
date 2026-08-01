import type { PhotoStatus } from "@/lib/db/database.types";

/** Rótulos em pt-PT para `photos.status` (secção 5.3), partilhados entre o
 * dashboard e o painel de moderação. */
export const PHOTO_STATUS_LABELS: Record<PhotoStatus, string> = {
  queued: "Na fila",
  uploading: "A enviar",
  processing: "A processar",
  pending_review: "Por aprovar",
  ready: "Publicada",
  hidden: "Oculta",
  failed: "Falhou",
  deleted: "Eliminada",
};
