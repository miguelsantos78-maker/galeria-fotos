import { describe, expect, it } from "vitest";
import { createAlbumSchema, updateAlbumSchema } from "@/lib/validation/album";

describe("createAlbumSchema", () => {
  it("aceita o mínimo válido e aplica omissões sensatas", () => {
    const result = createAlbumSchema.parse({ title: "Álbum de teste" });

    expect(result.title).toBe("Álbum de teste");
    expect(result.visibility).toBe("unlisted");
    expect(result.uploadEnabled).toBe(true);
    expect(result.moderationEnabled).toBe(false);
    expect(result.downloadEnabled).toBe(true);
  });

  it("rejeita título vazio", () => {
    expect(() => createAlbumSchema.parse({ title: "" })).toThrow();
  });

  it("rejeita título só com espaços", () => {
    expect(() => createAlbumSchema.parse({ title: "   " })).toThrow();
  });

  it("rejeita visibilidade inválida", () => {
    expect(() =>
      createAlbumSchema.parse({ title: "x", visibility: "invalida" }),
    ).toThrow();
  });
});

describe("updateAlbumSchema", () => {
  it("aceita um patch parcial vazio", () => {
    expect(updateAlbumSchema.parse({})).toEqual({});
  });

  it("aceita description como null (para limpar o campo)", () => {
    const result = updateAlbumSchema.parse({ description: null });
    expect(result.description).toBeNull();
  });

  it("aceita transição de estado válida", () => {
    const result = updateAlbumSchema.parse({ status: "published" });
    expect(result.status).toBe("published");
  });

  it("rejeita estado inválido", () => {
    expect(() => updateAlbumSchema.parse({ status: "invalido" })).toThrow();
  });
});
