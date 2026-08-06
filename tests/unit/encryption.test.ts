import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { validServerEnv } from "./fakes/env";

const originalEnv = { ...process.env };

describe("encryptSecret / decryptSecret", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    process.env = { ...originalEnv, ...validServerEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  it("recupera o texto original depois de encriptar", () => {
    const { ciphertext, keyVersion } = encryptSecret("refresh-token-secreto");

    expect(decryptSecret(ciphertext, keyVersion)).toBe("refresh-token-secreto");
  });

  it("nunca inclui o texto original no ciphertext", () => {
    const { ciphertext } = encryptSecret("refresh-token-secreto");
    expect(ciphertext).not.toContain("refresh-token-secreto");
  });

  it("gera ciphertexts diferentes para o mesmo texto (IV aleatório)", () => {
    const a = encryptSecret("mesmo-segredo");
    const b = encryptSecret("mesmo-segredo");
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("lança erro para uma versão de chave desconhecida", () => {
    const { ciphertext } = encryptSecret("segredo");
    expect(() => decryptSecret(ciphertext, 99)).toThrowError();
  });

  it("lança erro se o ciphertext foi adulterado", () => {
    const { ciphertext, keyVersion } = encryptSecret("segredo");
    const [iv, tag] = ciphertext.split(":");
    const tampered = [iv, tag, "adulterado"].join(":");
    expect(() => decryptSecret(tampered, keyVersion)).toThrow();
  });
});
