import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processImage } from "@/lib/media/process-image";
import { createTestJpeg } from "./fakes/test-images";

const EDGES = { previewMaxEdge: 100, thumbnailMaxEdge: 40 };

describe("processImage", () => {
  it("devolve dimensões, sha256 e blurhash para uma imagem válida", async () => {
    const buffer = await createTestJpeg(200, 150);
    const result = await processImage(buffer, EDGES);

    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.blurhash.length).toBeGreaterThan(0);
    expect(result.previewBuffer.length).toBeGreaterThan(0);
    expect(result.thumbnailBuffer.length).toBeGreaterThan(0);
  });

  it("o sha256 é determinístico para o mesmo original", async () => {
    const buffer = await createTestJpeg();
    const a = await processImage(buffer, EDGES);
    const b = await processImage(buffer, EDGES);
    expect(a.sha256).toBe(b.sha256);
  });

  it("os derivados são WebP dentro do lado máximo pedido", async () => {
    const buffer = await createTestJpeg(500, 300);
    const result = await processImage(buffer, EDGES);

    const previewMeta = await sharp(result.previewBuffer).metadata();
    const thumbnailMeta = await sharp(result.thumbnailBuffer).metadata();

    expect(previewMeta.format).toBe("webp");
    expect(
      Math.max(previewMeta.width ?? 0, previewMeta.height ?? 0),
    ).toBeLessThanOrEqual(EDGES.previewMaxEdge);
    expect(thumbnailMeta.format).toBe("webp");
    expect(
      Math.max(thumbnailMeta.width ?? 0, thumbnailMeta.height ?? 0),
    ).toBeLessThanOrEqual(EDGES.thumbnailMaxEdge);
  });

  it("não amplia imagens menores que o lado máximo pedido", async () => {
    const buffer = await createTestJpeg(20, 15);
    const result = await processImage(buffer, EDGES);

    const previewMeta = await sharp(result.previewBuffer).metadata();
    expect(previewMeta.width).toBe(20);
    expect(previewMeta.height).toBe(15);
  });

  it("rejeita um ficheiro corrompido", async () => {
    const corrupted = Buffer.from("não é uma imagem válida", "utf8");
    await expect(processImage(corrupted, EDGES)).rejects.toMatchObject({
      code: "UPLOAD_IMAGE_CORRUPTED",
    });
  });
});
