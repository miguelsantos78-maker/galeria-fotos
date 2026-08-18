// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_OPTIMIZE_MAX_BYTES,
  CLIENT_OPTIMIZE_MAX_EDGE,
  computeTargetDimensions,
  optimizeImageFile,
} from "@/lib/media/client-image-optimizer";

describe("computeTargetDimensions", () => {
  it("devolve null quando a imagem já está dentro do limite", () => {
    expect(computeTargetDimensions(1200, 800)).toBeNull();
    expect(computeTargetDimensions(CLIENT_OPTIMIZE_MAX_EDGE, 100)).toBeNull();
  });

  it("reduz uma imagem larga preservando a proporção", () => {
    const result = computeTargetDimensions(4800, 3200);
    expect(result).toEqual({ width: 2400, height: 1600 });
  });

  it("reduz uma imagem alta (retrato) preservando a proporção", () => {
    const result = computeTargetDimensions(3200, 4800);
    expect(result).toEqual({ width: 1600, height: 2400 });
  });

  it("respeita um maxEdge diferente do valor por omissão", () => {
    const result = computeTargetDimensions(2000, 1000, 1000);
    expect(result).toEqual({ width: 1000, height: 500 });
  });

  it("nunca devolve uma dimensão a zero para imagens extremamente esticadas", () => {
    const result = computeTargetDimensions(100_000, 1);
    expect(result?.width).toBe(CLIENT_OPTIMIZE_MAX_EDGE);
    expect(result?.height).toBeGreaterThanOrEqual(1);
  });
});

/**
 * O jsdom não traz codificadores de imagem, por isso o `toBlob` aqui é
 * um **modelo** deles, não os próprios. Reproduz a propriedade de que a
 * correção depende: o PNG é sem perdas e o seu tamanho **não responde**
 * ao `quality`, enquanto o JPEG responde.
 *
 * Os bytes por pixel foram calibrados com o `sharp` a 2400x1800. O
 * conteúdo sintético dá extremos — ruído puro (incompressível) põe o
 * JPEG a 1,4 B/px, ruído desfocado (liso de mais) põe-no a 0,05 B/px —
 * e uma fotografia real fica no meio. Os valores abaixo assumem a
 * ponta pessimista desse meio, para o modelo não facilitar a vida ao
 * código que está a ser testado.
 */
const PNG_BYTES_PER_PIXEL = 2;
const LOSSY_BYTES_PER_PIXEL_AT_FULL_QUALITY = { jpeg: 0.35, webp: 0.25 };

function stubBrowserImageApis(bitmapWidth: number, bitmapHeight: number) {
  vi.stubGlobal("createImageBitmap", () =>
    Promise.resolve({
      width: bitmapWidth,
      height: bitmapHeight,
      close: () => {},
    }),
  );

  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") throw new Error(`inesperado: ${tag}`);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (
        callback: (blob: Blob | null) => void,
        type: string,
        quality: number,
      ) => {
        const pixels = canvas.width * canvas.height;
        const size =
          type === "image/png"
            ? pixels * PNG_BYTES_PER_PIXEL
            : pixels *
              quality *
              (type === "image/webp"
                ? LOSSY_BYTES_PER_PIXEL_AT_FULL_QUALITY.webp
                : LOSSY_BYTES_PER_PIXEL_AT_FULL_QUALITY.jpeg);
        callback(new Blob([new Uint8Array(Math.round(size))], { type }));
      },
    };
    return canvas as unknown as HTMLElement;
  }) as typeof document.createElement);
}

function makeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("optimizeImageFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("não toca num ficheiro que já cabe no orçamento e nas dimensões", async () => {
    stubBrowserImageApis(2000, 1500);
    const file = makeFile("foto.jpg", "image/jpeg", 2_500_000);

    expect(await optimizeImageFile(file)).toBe(file);
  });

  it("reduz um PNG grande que já está dentro dos 2400px", async () => {
    // O caso que escapava: o critério de paragem era em pixels e o
    // limite do servidor é em bytes, por isso este ficheiro era
    // devolvido intacto e recusado a seguir com "demasiado grande".
    stubBrowserImageApis(1600, 1200);
    const file = makeFile("captura.png", "image/png", 5_800_000);

    const result = await optimizeImageFile(file);

    expect(result).not.toBe(file);
    expect(result.size).toBeLessThanOrEqual(CLIENT_OPTIMIZE_MAX_BYTES);
  });

  it("recodifica em JPEG quando o formato original não consegue lá chegar", async () => {
    // Redimensionar um PNG para 2400px não basta: é sem perdas e o
    // `quality` do `toBlob` é ignorado para `image/png`.
    stubBrowserImageApis(4000, 3000);
    const file = makeFile("edicao.png", "image/png", 20_000_000);

    const result = await optimizeImageFile(file);

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("edicao.jpg");
    expect(result.size).toBeLessThanOrEqual(CLIENT_OPTIMIZE_MAX_BYTES);
  });

  it("mantém o caminho comum: foto de telemóvel redimensionada no formato original", async () => {
    stubBrowserImageApis(4032, 3024);
    const file = makeFile("IMG_1234.jpg", "image/jpeg", 4_500_000);

    const result = await optimizeImageFile(file);

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_1234.jpg");
    expect(result.size).toBeLessThanOrEqual(CLIENT_OPTIMIZE_MAX_BYTES);
  });

  it("devolve o original quando o browser não suporta createImageBitmap", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const file = makeFile("foto.jpg", "image/jpeg", 9_000_000);

    expect(await optimizeImageFile(file)).toBe(file);
  });
});
