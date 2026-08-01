import { describe, expect, it } from "vitest";
import {
  buildSafeFilename,
  sanitizeOriginalFilename,
} from "@/lib/media/filenames";

describe("buildSafeFilename", () => {
  it("usa a extensão correta para cada tipo aceite", () => {
    expect(buildSafeFilename("image/jpeg")).toMatch(/\.jpg$/);
    expect(buildSafeFilename("image/png")).toMatch(/\.png$/);
    expect(buildSafeFilename("image/webp")).toMatch(/\.webp$/);
  });

  it("gera nomes diferentes a cada chamada", () => {
    const a = buildSafeFilename("image/jpeg");
    const b = buildSafeFilename("image/jpeg");
    expect(a).not.toBe(b);
  });

  it("nunca depende do nome original do ficheiro", () => {
    const name = buildSafeFilename("image/png");
    expect(name).not.toContain(" ");
  });
});

describe("sanitizeOriginalFilename", () => {
  it("remove caracteres de controlo", () => {
    const withControlChars = `foto${String.fromCharCode(0)}${String.fromCharCode(7)}.jpg`;
    expect(sanitizeOriginalFilename(withControlChars)).toBe("foto.jpg");
  });

  it("limita o tamanho a 255 caracteres", () => {
    const longName = "a".repeat(400) + ".jpg";
    expect(sanitizeOriginalFilename(longName).length).toBe(255);
  });

  it("usa um nome neutro quando o resultado fica vazio", () => {
    const onlyControlChars = String.fromCharCode(1) + String.fromCharCode(2);
    expect(sanitizeOriginalFilename(onlyControlChars)).toBe("sem-nome");
  });

  it("preserva nomes normais sem alterações", () => {
    expect(sanitizeOriginalFilename("foto-da-festa.jpg")).toBe(
      "foto-da-festa.jpg",
    );
  });
});
