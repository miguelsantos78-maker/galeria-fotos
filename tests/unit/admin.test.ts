import { describe, expect, it } from "vitest";
import { isAdmin } from "@/lib/auth/admin";

describe("isAdmin", () => {
  it("é admin quando o papel do perfil é 'admin'", () => {
    expect(
      isAdmin({ email: "a@example.com", role: "admin", adminEmails: [] }),
    ).toBe(true);
  });

  it("não é admin quando o papel é 'editor' e o email não está na lista", () => {
    expect(
      isAdmin({
        email: "editor@example.com",
        role: "editor",
        adminEmails: ["outro@example.com"],
      }),
    ).toBe(false);
  });

  it("é admin quando o email está na lista de bootstrap, mesmo sem papel admin", () => {
    expect(
      isAdmin({
        email: "bootstrap@example.com",
        role: "editor",
        adminEmails: ["bootstrap@example.com"],
      }),
    ).toBe(true);
  });

  it("a comparação de email ignora maiúsculas/minúsculas e espaços", () => {
    expect(
      isAdmin({
        email: "  Bootstrap@Example.com  ",
        role: "editor",
        adminEmails: ["bootstrap@example.com"],
      }),
    ).toBe(true);
  });

  it("não é admin sem email e sem papel admin", () => {
    expect(isAdmin({ email: null, role: "editor", adminEmails: [] })).toBe(
      false,
    );
  });

  it("não é admin quando não há perfil (role undefined)", () => {
    expect(
      isAdmin({ email: "guest@example.com", role: null, adminEmails: [] }),
    ).toBe(false);
  });
});
