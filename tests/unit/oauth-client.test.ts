import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { buildAuthorizationRequest } from "@/lib/google-drive/oauth-client";
import { validServerEnv } from "./fakes/env";

const originalEnv = { ...process.env };

describe("buildAuthorizationRequest", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    process.env = { ...originalEnv, ...validServerEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  it("gera um state anti-CSRF e um code_verifier PKCE diferentes a cada pedido", async () => {
    const a = await buildAuthorizationRequest();
    const b = await buildAuthorizationRequest();

    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("pede apenas o âmbito drive.file, acesso offline e code_challenge S256", async () => {
    const { url, state } = await buildAuthorizationRequest();
    const parsed = new URL(url);

    expect(parsed.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/drive.file",
    );
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe(state);
    expect(parsed.searchParams.has("code_challenge")).toBe(true);
  });

  it("só pede prompt=consent quando forceConsent é indicado", async () => {
    const withoutConsent = await buildAuthorizationRequest();
    const withConsent = await buildAuthorizationRequest({ forceConsent: true });

    expect(new URL(withoutConsent.url).searchParams.has("prompt")).toBe(false);
    expect(new URL(withConsent.url).searchParams.get("prompt")).toBe("consent");
  });
});
