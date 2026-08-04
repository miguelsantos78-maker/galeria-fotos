import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "@/lib/security/csp";

describe("buildSecurityHeaders", () => {
  it("restringe a política ao próprio site e ao host do Supabase configurado", () => {
    const { headers } = buildSecurityHeaders("https://my-project.supabase.co");
    const csp = headers["Content-Security-Policy"];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(
      "img-src 'self' data: blob: https://my-project.supabase.co",
    );
    expect(csp).toContain(
      "connect-src 'self' https://my-project.supabase.co wss://my-project.supabase.co",
    );
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("nunca inclui um host diferente do Supabase configurado", () => {
    const { headers } = buildSecurityHeaders("https://my-project.supabase.co");
    const csp = headers["Content-Security-Policy"];

    expect(csp).not.toContain("evil.example");
    expect(csp).not.toMatch(/img-src[^;]*https:\s/);
  });

  it("inclui os cabeçalhos de segurança adicionais", () => {
    const { headers } = buildSecurityHeaders("https://my-project.supabase.co");

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
  });
});
