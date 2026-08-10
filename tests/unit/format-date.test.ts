import { describe, expect, it } from "vitest";
import { formatEventDate } from "@/lib/format-date";

describe("formatEventDate", () => {
  it("escreve a data por extenso em português", () => {
    expect(formatEventDate("2026-08-17T12:00:00.000Z")).toBe(
      "17 de agosto de 2026",
    );
  });

  it("aceita qualquer ISO datetime válido, não só meio-dia UTC", () => {
    expect(formatEventDate("2027-01-01T00:00:00.000Z")).toContain("2027");
  });
});
