import { describe, expect, it } from "vitest";
import {
  CLIENT_OPTIMIZE_MAX_EDGE,
  computeTargetDimensions,
} from "@/lib/media/client-image-optimizer";

describe("computeTargetDimensions", () => {
  it("devolve null quando a imagem já está dentro do limite", () => {
    expect(computeTargetDimensions(1200, 800)).toBeNull();
    expect(computeTargetDimensions(CLIENT_OPTIMIZE_MAX_EDGE, 100)).toBeNull();
  });

  it("reduz uma imagem larga preservando a proporção", () => {
    const result = computeTargetDimensions(4800, 3200);
    expect(result).toEqual({ width: 2400, height: 1600 });
  });

  it("reduz uma imagem alta (retrato) preservando a proporção", () => {
    const result = computeTargetDimensions(3200, 4800);
    expect(result).toEqual({ width: 1600, height: 2400 });
  });

  it("respeita um maxEdge diferente do valor por omissão", () => {
    const result = computeTargetDimensions(2000, 1000, 1000);
    expect(result).toEqual({ width: 1000, height: 500 });
  });

  it("nunca devolve uma dimensão a zero para imagens extremamente esticadas", () => {
    const result = computeTargetDimensions(100_000, 1);
    expect(result?.width).toBe(CLIENT_OPTIMIZE_MAX_EDGE);
    expect(result?.height).toBeGreaterThanOrEqual(1);
  });
});
