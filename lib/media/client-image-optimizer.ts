/**
 * Redimensiona fotografias muito grandes no próprio browser antes do
 * envio (secção 10.3: "o browser valida quantidade, tamanho e tipo
 * suportado antes do envio"). Fotos de câmara de telemóvel excedem
 * facilmente o limite de 4 MB por pedido das Serverless Functions da
 * Vercel (docs/decisions/0009) — sem isto, essas fotos eram sempre
 * rejeitadas com "Ficheiro demasiado grande", sem alternativa para o
 * convidado.
 *
 * Nunca é a única validação: o servidor continua a validar tipo,
 * tamanho e assinatura binária de tudo o que recebe
 * (`server/use-cases/uploads.ts`), como já acontecia antes. Esta é só
 * uma otimização para o caso comum de sucesso.
 *
 * Falha sempre "aberta" para o ficheiro original: qualquer erro ou
 * falta de suporte do browser (`createImageBitmap`/`canvas`) devolve o
 * ficheiro tal como foi selecionado, deixando a validação de tamanho
 * habitual do lado do chamador decidir.
 */

/** Lado máximo depois de otimizado — acima do preview (1600px, secção
 * 13) para preservar mais detalhe no original guardado no Drive. */
export const CLIENT_OPTIMIZE_MAX_EDGE = 2400;

/** Só vale a pena otimizar ficheiros já razoavelmente grandes — evita
 * reencodificar (e potencialmente piorar) uma foto já pequena. */
export const CLIENT_OPTIMIZE_TRIGGER_BYTES = 2_000_000;

export const CLIENT_OPTIMIZE_JPEG_QUALITY = 0.85;

/**
 * Orçamento de bytes do resultado. Abaixo do limite de 4 MB por pedido
 * das Serverless Functions da Vercel, para deixar folga ao envelope
 * `multipart/form-data` (nome do ficheiro, fronteiras, cabeçalhos).
 *
 * Existe porque o limite do servidor é em **bytes** e o critério de
 * paragem deste módulo era em **pixels**: uma imagem já dentro dos
 * 2400px era devolvida intacta, por maior que fosse. Medido com
 * conteúdo muito detalhado: um PNG de 1600x1200 dá 5,8 MB e um JPEG de
 * 2000x1500 a qualidade 100 dá 4,2 MB — ambos passavam por aqui sem
 * uma única alteração e eram recusados a seguir com "Ficheiro
 * demasiado grande", que é exatamente o que este módulo existe para
 * evitar. No PNG nem redimensionar chegava: é sem perdas, e o
 * `quality` do `canvas.toBlob` é ignorado para `image/png`.
 */
export const CLIENT_OPTIMIZE_MAX_BYTES = 3_600_000;

/**
 * Tentativas sucessivas, da que mexe menos para a que mexe mais, para
 * um ficheiro que continua acima do orçamento. Só se chega aqui quando
 * a alternativa é o convidado não conseguir enviar a fotografia de
 * todo — e uma fotografia recomprimida é melhor do que nenhuma.
 */
const FALLBACK_ATTEMPTS: ReadonlyArray<{ maxEdge: number; quality: number }> = [
  { maxEdge: CLIENT_OPTIMIZE_MAX_EDGE, quality: 0.85 },
  { maxEdge: CLIENT_OPTIMIZE_MAX_EDGE, quality: 0.7 },
  { maxEdge: 2000, quality: 0.7 },
  { maxEdge: 1600, quality: 0.7 },
];

/**
 * Calcula as dimensões-alvo preservando a proporção, ou `null` se a
 * imagem já está dentro do limite (nada a fazer). Função pura,
 * separada da parte que depende do browser, para poder ser testada
 * sem `canvas`/`createImageBitmap`.
 */
export function computeTargetDimensions(
  width: number,
  height: number,
  maxEdge: number = CLIENT_OPTIMIZE_MAX_EDGE,
): { width: number; height: number } | null {
  const largestEdge = Math.max(width, height);
  if (largestEdge <= maxEdge) return null;

  const scale = maxEdge / largestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Desenha `bitmap` às dimensões dadas e codifica, ou `null` se o
 * browser não der um contexto 2D ou falhar a codificação. */
async function render(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: string,
  quality: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
}

/** Troca a extensão do nome quando o formato muda, para o
 * `original_filename` guardado não descrever outra coisa. */
function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${extension}`;
}

/**
 * Devolve uma versão de `file` que caiba no orçamento de bytes, ou o
 * próprio `file` inalterado quando não vale a pena mexer (já pequeno,
 * browser sem suporte, ou nenhuma tentativa ficou melhor do que o
 * original).
 */
export async function optimizeImageFile(file: File): Promise<File> {
  if (file.size <= CLIENT_OPTIMIZE_TRIGGER_BYTES) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | undefined;
  try {
    // "from-image" respeita a orientação EXIF ao desenhar no canvas —
    // sem isto, fotos em retrato de algumas câmaras ficariam de lado
    // depois de otimizadas (a rotação por EXIF só existe nos
    // metadados, o canvas desenha pixels em bruto).
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const target = computeTargetDimensions(bitmap.width, bitmap.height);

    // O caminho comum, inalterado: já dentro dos 2400px e dentro do
    // orçamento não se toca em nada.
    if (!target && file.size <= CLIENT_OPTIMIZE_MAX_BYTES) return file;

    if (target) {
      const blob = await render(
        bitmap,
        target.width,
        target.height,
        file.type,
        CLIENT_OPTIMIZE_JPEG_QUALITY,
      );
      if (
        blob &&
        blob.size < file.size &&
        blob.size <= CLIENT_OPTIMIZE_MAX_BYTES
      ) {
        return new File([blob], file.name, {
          type: file.type,
          lastModified: file.lastModified,
        });
      }
    }

    // Ainda acima do orçamento. Recodificar em JPEG, com qualidade e
    // dimensões cada vez menores até caber: é a única forma de acertar
    // num alvo em bytes, porque o PNG e o WebP sem perdas ignoram o
    // `quality` do `toBlob`. Perde a transparência, se existir — mas o
    // que está em causa é a fotografia ser enviada ou não ser.
    for (const attempt of FALLBACK_ATTEMPTS) {
      const size = computeTargetDimensions(
        bitmap.width,
        bitmap.height,
        attempt.maxEdge,
      ) ?? { width: bitmap.width, height: bitmap.height };

      const blob = await render(
        bitmap,
        size.width,
        size.height,
        "image/jpeg",
        attempt.quality,
      );
      if (!blob) break;
      if (blob.size < file.size && blob.size <= CLIENT_OPTIMIZE_MAX_BYTES) {
        return new File([blob], withExtension(file.name, "jpg"), {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
    }

    // Nada coube. Devolver o original e deixar a validação de tamanho
    // do chamador dar a mensagem — falhar "aberto", como sempre.
    return file;
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
