import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/observability/logger";

/**
 * Rate limit por sessão/IP/álbum (secção 15). Sem `UPSTASH_REDIS_REST_URL`/
 * `UPSTASH_REDIS_REST_TOKEN` configurados (opcionais — secção 20), fica
 * desligado por omissão em vez de bloquear o arranque ou falhar pedidos:
 * aceitável para desenvolvimento local, mas as variáveis devem estar
 * definidas em produção (ver docs/operations/production-checklist.md).
 */

export type RateLimitBucket =
  "album-resolve" | "upload-initiate" | "upload-complete" | "photo-delete";

const BUCKET_CONFIG: Record<
  RateLimitBucket,
  { limit: number; window: `${number} ${"s" | "m" | "h"}` }
> = {
  // Tentativas de adivinhar token/PIN (secção 15) — generoso para um
  // convidado real a escrever o PIN à mão, apertado para automação.
  "album-resolve": { limit: 20, window: "1 m" },
  "upload-initiate": { limit: 60, window: "1 m" },
  "upload-complete": { limit: 30, window: "1 m" },
  // Por utilizador. Folgado para quem está a limpar as suas
  // fotografias uma a uma, apertado para um ciclo automático — cada
  // eliminação custa uma chamada à API do Drive.
  "photo-delete": { limit: 40, window: "1 m" },
};

let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const env = getServerEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    // Ficar desligado é aceitável em desenvolvimento, mas em produção é
    // uma ausência de proteção que ninguém escolheu conscientemente:
    // sem isto, a única pista de que o rate limit não existe seria não
    // haver pista nenhuma. Registado uma só vez (o cliente fica
    // memorizado a `null`), para não encher os logs a cada pedido.
    if (process.env.NODE_ENV === "production") {
      logger.warn({
        operation: "rateLimit.disabled",
        message:
          "Rate limiting DESLIGADO: UPSTASH_REDIS_REST_URL/TOKEN não configurados. Nenhum limite de envios, resoluções de link ou tentativas de PIN está a ser aplicado.",
      });
    }
    redisClient = null;
    return null;
  }

  redisClient = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisClient;
}

const limiters = new Map<RateLimitBucket, Ratelimit>();

function getLimiter(bucket: RateLimitBucket): Ratelimit | null {
  const redis = getRedisClient();
  if (!redis) return null;

  const existing = limiters.get(bucket);
  if (existing) return existing;

  const config = BUCKET_CONFIG[bucket];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    prefix: `livegallery:${bucket}`,
  });
  limiters.set(bucket, limiter);
  return limiter;
}

export interface RateLimitCheck {
  allowed: boolean;
}

/**
 * `identifier` deve já combinar o que for relevante para o balde (IP,
 * userId, albumId) — esta função não sabe nada sobre o pedido HTTP.
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<RateLimitCheck> {
  const limiter = getLimiter(bucket);
  if (!limiter) return { allowed: true };

  const result = await limiter.limit(identifier);
  return { allowed: result.success };
}

/** Reinicia o cliente/limitadores memorizados — só para testes. */
export function resetRateLimitCacheForTests(): void {
  redisClient = undefined;
  limiters.clear();
}

/**
 * IP do pedido a partir dos cabeçalhos de proxy habituais (Cloud Run e a
 * generalidade dos balanceadores de carga). Sem eles, usa um valor fixo
 * — nunca deixa o rate limit cair silenciosamente por falta de IP.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
