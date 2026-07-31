import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "@/lib/security/pin";

describe("hashPin / verifyPin", () => {
  it("verifica corretamente o PIN certo", () => {
    const hash = hashPin("1234");
    expect(verifyPin("1234", hash)).toBe(true);
  });

  it("rejeita um PIN errado", () => {
    const hash = hashPin("1234");
    expect(verifyPin("0000", hash)).toBe(false);
  });

  it("nunca guarda o PIN em texto simples no hash", () => {
    const hash = hashPin("1234");
    expect(hash).not.toContain("1234");
  });

  it("usa salt aleatório: dois hashes do mesmo PIN são diferentes", () => {
    expect(hashPin("1234")).not.toBe(hashPin("1234"));
  });

  it("não lança exceção com um valor mal formado", () => {
    expect(verifyPin("1234", "formato-invalido")).toBe(false);
  });
});
