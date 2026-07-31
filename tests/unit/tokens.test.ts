import { describe, expect, it } from "vitest";
import {
  generateShareToken,
  hashShareToken,
  safeCompareHex,
} from "@/lib/security/tokens";

describe("generateShareToken", () => {
  it("gera tokens com entropia suficiente e URL-safe", () => {
    const token = generateShareToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("gera tokens diferentes a cada chamada", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
  });
});

describe("hashShareToken", () => {
  it("é determinístico para o mesmo token e pepper", () => {
    const token = "abc123";
    expect(hashShareToken(token, "pepper")).toBe(
      hashShareToken(token, "pepper"),
    );
  });

  it("produz hashes diferentes para peppers diferentes", () => {
    const token = "abc123";
    expect(hashShareToken(token, "pepper-a")).not.toBe(
      hashShareToken(token, "pepper-b"),
    );
  });

  it("nunca inclui o token em texto simples no resultado", () => {
    const token = "muito-secreto";
    expect(hashShareToken(token, "pepper")).not.toContain(token);
  });
});

describe("safeCompareHex", () => {
  it("confirma hashes iguais", () => {
    expect(safeCompareHex("abcd", "abcd")).toBe(true);
  });

  it("rejeita hashes diferentes", () => {
    expect(safeCompareHex("abcd", "abce")).toBe(false);
  });

  it("rejeita hashes de tamanhos diferentes sem lançar exceção", () => {
    expect(safeCompareHex("ab", "abcdef")).toBe(false);
  });
});
