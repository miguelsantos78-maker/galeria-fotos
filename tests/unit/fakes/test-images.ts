import sharp from "sharp";

/** Gera imagens sintéticas reais (via sharp) para os testes de processamento. */
export function createTestJpeg(width = 120, height = 80): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 50, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();
}

export function createTestPng(width = 60, height = 60): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 20, g: 120, b: 200, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

export function createTestWebp(width = 60, height = 60): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 200, b: 10 },
    },
  })
    .webp()
    .toBuffer();
}
