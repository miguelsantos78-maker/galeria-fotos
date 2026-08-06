import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getServerEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const CURRENT_KEY_VERSION = 1;

/**
 * Deriva sempre uma chave de 32 bytes a partir do segredo configurado,
 * independentemente do encoding/tamanho exato de APP_ENCRYPTION_KEY.
 */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function getSecretForVersion(version: number): string {
  if (version === 1) return getServerEnv().APP_ENCRYPTION_KEY;
  throw new Error(`Versão de chave de encriptação desconhecida: ${version}`);
}

/** AES-256-GCM: "<iv>:<authTag>:<ciphertext>", tudo em base64. */
function encryptWithSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString("base64"))
    .join(":");
}

function decryptWithSecret(payload: string, secret: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Formato inválido para decifrar o segredo.");
  }

  const key = deriveKey(secret);
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

/**
 * Encripta um segredo (por exemplo, o refresh token do Google) com a
 * chave atual. Devolve também a versão da chave usada, a guardar em
 * `google_connections.token_key_version` — permite rodar a chave no
 * futuro (nova versão + novo APP_ENCRYPTION_KEY_V2, sem invalidar
 * ligações já guardadas com a versão anterior).
 */
export function encryptSecret(plaintext: string): {
  ciphertext: string;
  keyVersion: number;
} {
  const keyVersion = CURRENT_KEY_VERSION;
  return {
    ciphertext: encryptWithSecret(plaintext, getSecretForVersion(keyVersion)),
    keyVersion,
  };
}

export function decryptSecret(ciphertext: string, keyVersion: number): string {
  return decryptWithSecret(ciphertext, getSecretForVersion(keyVersion));
}
