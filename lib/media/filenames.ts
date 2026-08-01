import { randomUUID } from "node:crypto";
import type { AllowedImageMimeType } from "./constants";

const EXTENSION_BY_MIME: Record<AllowedImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Nome seguro para o original no Drive (secção 12): não depende do nome
 * enviado pelo cliente, que fica só como metadado
 * (`photos.original_filename`). A extensão vem do MIME real (detetado
 * pela assinatura binária), nunca do nome do ficheiro do cliente.
 */
export function buildSafeFilename(mimeType: AllowedImageMimeType): string {
  return `${randomUUID()}.${EXTENSION_BY_MIME[mimeType]}`;
}

function isControlCharCode(code: number): boolean {
  return code <= 31 || code === 127;
}

/**
 * O nome original é só metadado (`photos.original_filename`), nunca
 * usado como caminho de ficheiro — mas ainda assim é texto vindo do
 * cliente, por isso remove caracteres de controlo e limita o tamanho
 * antes de gravar.
 */
export function sanitizeOriginalFilename(name: string): string {
  let cleaned = "";
  for (const char of name) {
    if (!isControlCharCode(char.codePointAt(0) ?? 0)) {
      cleaned += char;
    }
  }
  cleaned = cleaned.trim();
  return (cleaned || "sem-nome").slice(0, 255);
}
