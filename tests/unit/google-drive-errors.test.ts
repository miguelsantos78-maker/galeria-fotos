import { describe, expect, it } from "vitest";
import { isInvalidGrantError } from "@/lib/google-drive/errors";

describe("isInvalidGrantError", () => {
  it("reconhece o erro pela mensagem", () => {
    expect(isInvalidGrantError(new Error("invalid_grant"))).toBe(true);
  });

  it("reconhece a mensagem completa do google-auth-library", () => {
    expect(
      isInvalidGrantError(
        new Error("invalid_grant: Token has been expired or revoked."),
      ),
    ).toBe(true);
  });

  it("reconhece o erro pelo corpo da resposta", () => {
    expect(
      isInvalidGrantError({
        message: "Bad Request",
        response: { data: { error: "invalid_grant" } },
      }),
    ).toBe(true);
  });

  it("reconhece o erro pelo corpo já desserializado do gaxios", () => {
    expect(isInvalidGrantError({ data: { error: "invalid_grant" } })).toBe(
      true,
    );
  });

  it("não confunde com outras falhas do Drive", () => {
    expect(isInvalidGrantError(new Error("backendError"))).toBe(false);
    expect(
      isInvalidGrantError({
        response: { data: { error: "rateLimitExceeded" } },
      }),
    ).toBe(false);
  });

  it("tolera valores que não são objetos", () => {
    expect(isInvalidGrantError(null)).toBe(false);
    expect(isInvalidGrantError("invalid_grant")).toBe(false);
    expect(isInvalidGrantError(undefined)).toBe(false);
  });
});
