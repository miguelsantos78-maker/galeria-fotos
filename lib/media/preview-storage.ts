import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { PHOTO_PREVIEWS_BUCKET } from "./constants";

/**
 * Interface própria sobre o Supabase Storage (em vez de chamar o
 * cliente diretamente no caso de uso), na mesma linha de
 * `DriveStorageProvider` e dos repositórios — permite um adaptador
 * falso em memória nos testes.
 */
export interface PreviewStorage {
  upload(path: string, buffer: Buffer, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

/**
 * Um ano. Os derivados são imutáveis: o caminho inclui o `photoId`
 * (`albums/{albumId}/{photoId}/preview.webp`) e o conteúdo desse
 * caminho nunca é reescrito — reprocessar geraria um `photoId` novo.
 * Sem isto vale o valor por omissão do Supabase (uma hora), que obriga
 * o browser a voltar a descarregar miniaturas que não mudaram.
 */
const IMMUTABLE_CACHE_SECONDS = 31_536_000;

export function createSupabasePreviewStorage(
  client: SupabaseClient<Database>,
): PreviewStorage {
  const bucket = client.storage.from(PHOTO_PREVIEWS_BUCKET);

  return {
    async upload(path, buffer, contentType) {
      const { error } = await bucket.upload(path, buffer, {
        contentType,
        upsert: false,
        cacheControl: String(IMMUTABLE_CACHE_SECONDS),
      });
      if (error) throw error;
    },

    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket.remove(paths);
      if (error) throw error;
    },
  };
}
