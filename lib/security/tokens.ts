import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Gera um token de partilha com entropia suficiente (256 bits) para um
 * link de álbum não adivinhável (secção 6.3). Formato URL-safe, sem
 * padding, para poder viver diretamente num segmento de rota.
 */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Calcula o hash determinístico do token (HMAC-SHA256 com
 * APP_TOKEN_PEPPER) para o guardar e procurar na base de dados. Nunca
 * guardar o token em texto simples.
 */
export function hashShareToken(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

/** Comparação em tempo constante entre dois hashes hexadecimais. */
export function safeCompareHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
