import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { encode as encodeBlurhash } from "blurhash";
import { AppError } from "@/lib/api/response";
import { MAX_INPUT_PIXELS } from "./constants";

const BLURHASH_EDGE = 32;
const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 3;
const PREVIEW_QUALITY = 82;
const THUMBNAIL_QUALITY = 75;

export interface ProcessedImage {
  sha256: string;
  width: number;
  height: number;
  blurhash: string;
  previewBuffer: Buffer;
  thumbnailBuffer: Buffer;
}

function readMetadata(original: Buffer) {
  return sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
    .metadata()
    .catch(() => {
      throw new AppError(
        "UPLOAD_IMAGE_CORRUPTED",
        "A imagem está corrompida ou não pôde ser lida.",
        422,
      );
    });
}

function renderDerivatives(
  original: Buffer,
  edges: { previewMaxEdge: number; thumbnailMaxEdge: number },
) {
  const rotated = () =>
    sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();

  return Promise.all([
    rotated()
      .resize({
        width: edges.previewMaxEdge,
        height: edges.previewMaxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer(),
    rotated()
      .resize({
        width: edges.thumbnailMaxEdge,
        height: edges.thumbnailMaxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toBuffer(),
    rotated()
      .resize(BLURHASH_EDGE, BLURHASH_EDGE, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]).catch(() => {
    throw new AppError(
      "UPLOAD_IMAGE_CORRUPTED",
      "Não foi possível processar a imagem.",
      422,
    );
  });
}

/**
 * Pipeline de processamento (secção 13): valida dimensões, aplica
 * rotação EXIF, gera preview e thumbnail em WebP, calcula sha256 do
 * original (deteção de duplicados) e blurhash. `sharp` não propaga EXIF
 * (incluindo GPS) para a saída a menos que `withMetadata()` seja
 * chamado explicitamente — não é, por isso os derivados saem sempre
 * limpos.
 */
export async function processImage(
  original: Buffer,
  edges: { previewMaxEdge: number; thumbnailMaxEdge: number },
): Promise<ProcessedImage> {
  const sha256 = createHash("sha256").update(original).digest("hex");
  const metadata = await readMetadata(original);

  if (!metadata.width || !metadata.height) {
    throw new AppError(
      "UPLOAD_IMAGE_CORRUPTED",
      "A imagem está corrompida ou não pôde ser lida.",
      422,
    );
  }
  if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw new AppError(
      "UPLOAD_IMAGE_TOO_LARGE",
      "As dimensões da imagem excedem o limite permitido.",
      422,
    );
  }

  // A orientação EXIF pode trocar largura/altura depois da rotação
  // automática (orientações 5–8 = rodadas 90°/270°).
  const orientation = metadata.orientation ?? 1;
  const isSwapped = orientation >= 5 && orientation <= 8;
  const width = isSwapped ? metadata.height : metadata.width;
  const height = isSwapped ? metadata.width : metadata.height;

  const [previewBuffer, thumbnailBuffer, blurhashSource] =
    await renderDerivatives(original, edges);

  const blurhash = encodeBlurhash(
    new Uint8ClampedArray(
      blurhashSource.data.buffer,
      blurhashSource.data.byteOffset,
      blurhashSource.data.length,
    ),
    blurhashSource.info.width,
    blurhashSource.info.height,
    BLURHASH_COMPONENTS_X,
    BLURHASH_COMPONENTS_Y,
  );

  return { sha256, width, height, blurhash, previewBuffer, thumbnailBuffer };
}
