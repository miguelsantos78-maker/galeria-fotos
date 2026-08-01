import "server-only";
import { randomUUID } from "node:crypto";
import { google, Auth } from "googleapis";
import { getServerEnv } from "@/lib/env";

/** Âmbito mínimo — apenas ficheiros criados por esta aplicação (secção 6.2). */
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export function createOAuthClient(): Auth.OAuth2Client {
  const env = getServerEnv();
  return new google.auth.OAuth2({
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
  });
}

export interface AuthorizationRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

/**
 * Gera o URL de consentimento do Google com `state` anti-CSRF e PKCE
 * (secção 6.2). `state` e `codeVerifier` devem ser guardados (cookies
 * HttpOnly de curta duração) para validar/completar o callback.
 */
export async function buildAuthorizationRequest(options?: {
  forceConsent?: boolean;
}): Promise<AuthorizationRequest> {
  const client = createOAuthClient();
  const state = randomUUID();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();

  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: DRIVE_SCOPES,
    state,
    include_granted_scopes: false,
    code_challenge: codeChallenge,
    code_challenge_method: Auth.CodeChallengeMethod.S256,
    ...(options?.forceConsent ? { prompt: "consent" } : {}),
  });

  return { url, state, codeVerifier };
}

export interface ExchangedTokens {
  refreshToken: string;
  accessToken: string;
}

export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<ExchangedTokens> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken({ code, codeVerifier });

  if (!tokens.refresh_token) {
    throw new Error(
      "O Google não devolveu um refresh token. Reconecte com prompt=consent.",
    );
  }
  if (!tokens.access_token) {
    throw new Error("O Google não devolveu um access token.");
  }

  return { refreshToken: tokens.refresh_token, accessToken: tokens.access_token };
}

/** Cliente OAuth2 já autenticado com o refresh token guardado (desencriptado). */
export function createAuthenticatedClient(refreshToken: string): Auth.OAuth2Client {
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Revoga o refresh token junto do Google (para além de marcar a ligação
 * como revogada na base de dados). Ignora erros — se o token já não for
 * válido no Google, o resultado prático é o mesmo.
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const client = createAuthenticatedClient(refreshToken);
  try {
    await client.revokeCredentials();
  } catch {
    // Já pode estar revogado do lado do Google; nada a fazer.
  }
}
