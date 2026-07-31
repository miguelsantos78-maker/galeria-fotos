import { describe, expect, it } from "vitest";
import {
  createShareLinkSchema,
  resolveAlbumSchema,
} from "@/lib/validation/share-link";

describe("createShareLinkSchema", () => {
  it("assume permissão 'view' por omissão", () => {
    const result = createShareLinkSchema.parse({});
    expect(result.permissions).toEqual(["view"]);
  });

  it("aceita um PIN de 4 a 8 dígitos", () => {
    expect(createShareLinkSchema.parse({ pin: "1234" }).pin).toBe("1234");
    expect(createShareLinkSchema.parse({ pin: "12345678" }).pin).toBe(
      "12345678",
    );
  });

  it("rejeita PIN com letras ou fora do intervalo de dígitos", () => {
    expect(() => createShareLinkSchema.parse({ pin: "abcd" })).toThrow();
    expect(() => createShareLinkSchema.parse({ pin: "123" })).toThrow();
    expect(() => createShareLinkSchema.parse({ pin: "123456789" })).toThrow();
  });

  it("rejeita lista de permissões vazia", () => {
    expect(() => createShareLinkSchema.parse({ permissions: [] })).toThrow();
  });

  it("rejeita uma permissão desconhecida", () => {
    expect(() =>
      createShareLinkSchema.parse({ permissions: ["admin"] }),
    ).toThrow();
  });
});

describe("resolveAlbumSchema", () => {
  it("exige um token não vazio", () => {
    expect(() => resolveAlbumSchema.parse({ token: "" })).toThrow();
    expect(resolveAlbumSchema.parse({ token: "abc" }).token).toBe("abc");
  });

  it("o PIN é opcional", () => {
    const result = resolveAlbumSchema.parse({ token: "abc" });
    expect(result.pin).toBeUndefined();
  });
});
