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

/**
 * Margem antes do fim: um URL só é reaproveitado enquanto lhe sobrar
 * pelo menos isto. Sem margem, um URL a dez segundos de expirar seria
 * entregue a alguém que ainda o vai usar durante minutos.
 */
const REUSE_SAFETY_MARGIN_MS = 10 * 60 * 1000;

/**
 * Teto de entradas memorizadas. ~1000 fotografias × 2 derivados dá 2000
 * entradas; o dobro disso deixa folga sem deixar a memória crescer sem
 * limite numa instância de longa duração.
 */
const MAX_CACHE_ENTRIES = 4000;

interface CachedUrl {
  url: string;
  expiresAtMs: number;
}

/**
 * Reaproveitamento por instância. Vive ao nível do módulo, tal como o
 * cliente Redis do rate limiting: as instâncias serverless são
 * reutilizadas entre pedidos, por isso isto acerta com frequência sem
 * precisar de infraestrutura nenhuma.
 *
 * A razão de existir não é poupar chamadas ao Supabase (essas já eram
 * uma só por página) — é a **cache do browser**. Cada assinatura
 * produz um `?token=<JWT>` diferente, porque o JWT leva a sua própria
 * expiração; um URL diferente é uma chave de cache diferente, por isso
 * o browser voltava a descarregar todas as miniaturas a cada abertura
 * da galeria, mesmo tendo-as acabado de ver. Num álbum de mil
 * fotografias vistas por uma centena de convidados, essa repetição
 * sozinha chega para esgotar o tráfego mensal do plano gratuito.
 *
 * Devolver o mesmo URL enquanto é válido não alarga o acesso: já se
 * entregavam URLs de uma hora: um reaproveitado tem sempre menos tempo
 * de vida pela frente do que um acabado de emitir.
 */
const cache = new Map<string, CachedUrl>();

function readFromCache(path: string, nowMs: number): string | null {
  const entry = cache.get(path);
  if (!entry) return null;
  if (entry.expiresAtMs - nowMs <= REUSE_SAFETY_MARGIN_MS) {
    cache.delete(path);
    return null;
  }
  return entry.url;
}

function writeToCache(path: string, url: string, expiresAtMs: number): void {
  // `Map` preserva a ordem de inserção: a primeira chave é a mais
  // antiga a entrar. Chega para não crescer sem limite; não vale a pena
  // um LRU verdadeiro para um caso em que tudo expira ao fim de uma hora.
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(path, { url, expiresAtMs });
}

/** Esvazia o reaproveitamento memorizado — só para testes. */
export function resetPreviewUrlCacheForTests(): void {
  cache.clear();
}

/**
 * Assina vários caminhos numa só chamada (evita N pedidos sequenciais
 * na grelha), reaproveitando os que já foram assinados há pouco.
 */
export async function createSignedPreviewUrls(
  client: SupabaseClient<Database>,
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const nowMs = Date.now();
  const result = new Map<string, string>();
  const missing: string[] = [];

  // `new Set` porque a mesma fotografia pode aparecer duas vezes na
  // mesma página (preview + miniatura partilham o prefixo, mas também
  // há chamadas que repetem um caminho) — assinar duas vezes o mesmo
  // caminho seria trabalho a dobrar.
  for (const path of new Set(paths)) {
    const cached = readFromCache(path, nowMs);
    if (cached) result.set(path, cached);
    else missing.push(path);
  }

  if (missing.length === 0) return result;

  const { data, error } = await client.storage
    .from(PHOTO_PREVIEWS_BUCKET)
    .createSignedUrls(missing, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;

  const expiresAtMs = nowMs + SIGNED_URL_TTL_SECONDS * 1000;
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) {
      result.set(entry.path, entry.signedUrl);
      writeToCache(entry.path, entry.signedUrl, expiresAtMs);
    }
  }
  return result;
}
