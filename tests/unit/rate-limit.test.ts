import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import {
  checkRateLimit,
  getClientIp,
  resetRateLimitCacheForTests,
} from "@/lib/security/rate-limit";
import { validServerEnv } from "./fakes/env";

const originalEnv = { ...process.env };

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    resetRateLimitCacheForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
    resetRateLimitCacheForTests();
  });

  it("permite sempre quando o Upstash não está configurado (variáveis em falta)", async () => {
    process.env = { ...originalEnv, ...validServerEnv };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const first = await checkRateLimit("album-resolve", "1.2.3.4");
    const second = await checkRateLimit("album-resolve", "1.2.3.4");

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("usa o primeiro IP de x-forwarded-for", () => {
    const request = new Request("http://localhost/api/albums/resolve", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("recorre a x-real-ip quando x-forwarded-for está ausente", () => {
    const request = new Request("http://localhost/api/albums/resolve", {
      headers: { "x-real-ip": "198.51.100.9" },
    });
    expect(getClientIp(request)).toBe("198.51.100.9");
  });

  it("devolve 'unknown' sem nenhum cabeçalho de proxy", () => {
    const request = new Request("http://localhost/api/albums/resolve");
    expect(getClientIp(request)).toBe("unknown");
  });
});
