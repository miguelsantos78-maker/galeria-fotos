import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPublicEnv, getServerEnv, resetEnvCacheForTests } from "@/lib/env";

const validEnv = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/google-drive/callback",
  APP_ENCRYPTION_KEY: "a".repeat(32),
  APP_TOKEN_PEPPER: "b".repeat(16),
};

const originalEnv = { ...process.env };

describe("env validation", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  it("valida com sucesso quando todas as variáveis obrigatórias existem", () => {
    Object.assign(process.env, validEnv);

    const env = getServerEnv();

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(
      validEnv.NEXT_PUBLIC_SUPABASE_URL,
    );
    expect(env.MAX_UPLOAD_BYTES).toBe(4_000_000);
    expect(env.MAX_FILES_PER_UPLOAD).toBe(50);
  });

  it("lança erro claro quando falta uma variável obrigatória", () => {
    Object.assign(process.env, validEnv);
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;

    expect(() => getServerEnv()).toThrowError(/GOOGLE_OAUTH_CLIENT_ID/);
  });

  it("rejeita chave de encriptação demasiado curta", () => {
    Object.assign(process.env, validEnv, { APP_ENCRYPTION_KEY: "curta" });

    expect(() => getServerEnv()).toThrowError(/APP_ENCRYPTION_KEY/);
  });

  it("respeita valores numéricos personalizados", () => {
    Object.assign(process.env, validEnv, {
      MAX_UPLOAD_BYTES: "1000",
      PREVIEW_MAX_EDGE: "800",
    });

    const env = getServerEnv();

    expect(env.MAX_UPLOAD_BYTES).toBe(1000);
    expect(env.PREVIEW_MAX_EDGE).toBe(800);
  });

  it("getPublicEnv só valida as variáveis públicas", () => {
    Object.assign(process.env, {
      NEXT_PUBLIC_APP_URL: validEnv.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: validEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });

    const env = getPublicEnv();

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(
      validEnv.NEXT_PUBLIC_SUPABASE_URL,
    );
  });
});
