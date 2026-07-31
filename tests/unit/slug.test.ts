import { describe, expect, it } from "vitest";
import { randomSlugSuffix, slugify } from "@/lib/validation/slug";

describe("slugify", () => {
  it("remove diacríticos e converte para minúsculas", () => {
    expect(slugify("Casamento da Ana e João")).toBe("casamento-da-ana-e-joao");
  });

  it("substitui caracteres não alfanuméricos por hífens", () => {
    expect(slugify("Festa 25º Aniversário!!")).toBe("festa-25-aniversario");
  });

  it("remove hífens no início/fim", () => {
    expect(slugify("  --Álbum--  ")).toBe("album");
  });

  it("usa 'album' como fallback para título vazio", () => {
    expect(slugify("")).toBe("album");
    expect(slugify("!!!")).toBe("album");
  });
});

describe("randomSlugSuffix", () => {
  it("gera sufixos curtos alfanuméricos", () => {
    const suffix = randomSlugSuffix();
    expect(suffix).toMatch(/^[a-z0-9]+$/);
    expect(suffix.length).toBeGreaterThan(0);
  });
});
