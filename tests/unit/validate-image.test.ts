import { describe, expect, it } from "vitest";
import { detectImageMimeType } from "@/lib/media/validate-image";
import {
  createTestJpeg,
  createTestPng,
  createTestWebp,
} from "./fakes/test-images";

describe("detectImageMimeType", () => {
  it("deteta JPEG pela assinatura binária", async () => {
    const buffer = await createTestJpeg();
    expect(await detectImageMimeType(buffer)).toBe("image/jpeg");
  });

  it("deteta PNG pela assinatura binária", async () => {
    const buffer = await createTestPng();
    expect(await detectImageMimeType(buffer)).toBe("image/png");
  });

  it("deteta WebP pela assinatura binária", async () => {
    const buffer = await createTestWebp();
    expect(await detectImageMimeType(buffer)).toBe("image/webp");
  });

  it("rejeita um ficheiro com extensão .jpg mas conteúdo de texto", async () => {
    const fakeImage = Buffer.from("isto não é uma imagem", "utf8");
    await expect(detectImageMimeType(fakeImage)).rejects.toMatchObject({
      code: "UPLOAD_UNSUPPORTED_TYPE",
    });
  });

  it("rejeita SVG (nunca aceite, mesmo com o MIME correto)", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      "utf8",
    );
    await expect(detectImageMimeType(svg)).rejects.toMatchObject({
      code: "UPLOAD_UNSUPPORTED_TYPE",
    });
  });
});
