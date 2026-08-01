/** Tipos aceites no MVP (secção 10.3) — SVG é sempre rejeitado (secção 15). */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** ~40 MP: generoso para fotos reais, bloqueia decompression bombs (secção 15). */
export const MAX_INPUT_PIXELS = 40_000_000;

export const PHOTO_PREVIEWS_BUCKET = "photo-previews";
