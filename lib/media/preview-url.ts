import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { PHOTO_PREVIEWS_BUCKET } from "./constants";

/**
 * URLs assinados de duração limitada (secção 5.4) — nunca URLs
 * públicas permanentes.
 *
 * Uma hora, não cinco minutos: num álbum grande (centenas ou milhares
 * de fotografias) um convidado passa facilmente mais de cinco minutos
 * a percorrer a galeria, e as miniaturas já carregadas partiam-se
 * quando os URLs caducavam a meio da visita. Continua bem abaixo da
 * validade da própria `album_session` (24h, ver
 * `server/use-cases/resolve-album.ts`), por isso revogar um link
 * continua a fechar o acesso muito antes de o último URL emitido
 * expirar.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Assina vários caminhos numa só chamada (evita N pedidos sequenciais na grelha). */
export async function createSignedPreviewUrls(
  client: SupabaseClient<Database>,
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const { data, error } = await client.storage
    .from(PHOTO_PREVIEWS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;

  const result = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) {
      result.set(entry.path, entry.signedUrl);
    }
  }
  return result;
}
