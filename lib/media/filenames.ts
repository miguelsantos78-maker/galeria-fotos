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

function asciiFallbackFilename(name: string): string {
  let ascii = "";
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    ascii += code >= 32 && code <= 126 && char !== '"' ? char : "_";
  }
  return ascii || "ficheiro";
}

/**
 * Cabeçalho `Content-Disposition` seguro para nomes com acentos/UTF-8
 * (RFC 6266 + RFC 5987): `filename` só ASCII como recurso para clientes
 * antigos, `filename*` com o nome real para os restantes. O nome já
 * passou por `sanitizeOriginalFilename` antes de chegar aqui, por isso
 * não contém quebras de linha nem outros caracteres de controlo.
 */
export function buildContentDispositionHeader(filename: string): string {
  const asciiName = asciiFallbackFilename(filename);
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}
