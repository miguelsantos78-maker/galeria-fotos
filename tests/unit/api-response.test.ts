import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonError } from "@/lib/api/response";

describe("jsonError — log de erros inesperados", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function loggedPayload(): Record<string, unknown> {
    const raw = consoleErrorSpy.mock.calls[0]?.[0] as string;
    return JSON.parse(raw);
  }

  it("regista a mensagem de uma Error normal", async () => {
    await jsonError(new Error("falhou"), "req-1");
    expect(loggedPayload().error).toBe("falhou");
  });

  it("nunca regista '[object Object]': extrai a mensagem de um objeto simples com 'message'", async () => {
    // A forma exata que uma falha de rede do PostgREST devolve (ver
    // lib/db/postgrest-error.ts) — sem a extração, isto caía no
    // `String(objeto)` genérico e o log ficava opaco.
    await jsonError({ message: "FetchError: fetch failed", code: "" }, "req-2");
    expect(loggedPayload().error).toBe("FetchError: fetch failed");
    expect(loggedPayload().error).not.toContain("[object Object]");
  });

  it("cai num valor de recurso para um erro sem 'message' nenhuma", async () => {
    await jsonError({ code: "23505" }, "req-3");
    expect(loggedPayload().error).toBe("[object Object]");
  });

  it("nunca devolve o erro interno ao cliente — só a mensagem genérica", async () => {
    const response = await jsonError(new Error("detalhe interno"), "req-4");
    const body = await response.json();
    expect(body.error.message).toBe("Ocorreu um erro inesperado.");
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
