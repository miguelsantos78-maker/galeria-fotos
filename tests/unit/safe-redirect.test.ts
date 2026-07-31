import { describe, expect, it } from "vitest";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

describe("sanitizeRedirectPath", () => {
  it("aceita um caminho relativo interno", () => {
    expect(sanitizeRedirectPath("/admin/albums")).toBe("/admin/albums");
  });

  it("usa o valor por omissão quando não há caminho", () => {
    expect(sanitizeRedirectPath(null)).toBe("/admin");
    expect(sanitizeRedirectPath(undefined)).toBe("/admin");
    expect(sanitizeRedirectPath("")).toBe("/admin");
  });

  it("rejeita URLs absolutas para outros domínios", () => {
    expect(sanitizeRedirectPath("https://evil.com")).toBe("/admin");
  });

  it("rejeita URLs relativas ao protocolo (open redirect)", () => {
    expect(sanitizeRedirectPath("//evil.com")).toBe("/admin");
  });

  it("respeita um valor por omissão personalizado", () => {
    expect(sanitizeRedirectPath(null, "/a/teste")).toBe("/a/teste");
  });
});
