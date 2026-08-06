import "server-only";
import { fileTypeFromBuffer } from "file-type";
import { AppError } from "@/lib/api/response";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  type AllowedImageMimeType,
} from "./constants";

/**
 * Nunca confia no nome, extensão ou MIME enviados pelo cliente (secção
 * 3) — deteta o tipo real pela assinatura binária. SVG nunca é
 * detetado como um dos tipos aceites (é XML, não tem assinatura
 * binária de imagem), por isso é rejeitado sem tratamento especial.
 */
export async function detectImageMimeType(
  buffer: Buffer,
): Promise<AllowedImageMimeType> {
  const detected = await fileTypeFromBuffer(buffer);

  if (!detected || !isAllowedImageMimeType(detected.mime)) {
    throw new AppError(
      "UPLOAD_UNSUPPORTED_TYPE",
      "Formato de imagem não suportado. Envie ficheiros JPEG, PNG ou WebP.",
      415,
    );
  }

  return detected.mime;
}

function isAllowedImageMimeType(mime: string): mime is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}
