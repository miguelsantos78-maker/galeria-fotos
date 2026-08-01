import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/dal";
import { initiateGoogleDriveConnection } from "@/server/use-cases/google-drive-connection";
import {
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from "@/lib/google-drive/oauth-cookies";

/**
 * Inicia a ligação ao Google Drive (secção 6.2). Página de navegação
 * direta (não JSON), por isso usa `requireAdmin()` — que redireciona
 * para o login se não houver sessão — chamado fora de qualquer
 * try/catch, tal como o próprio `redirect()` final.
 */
export async function GET(request: Request) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const forceConsent = searchParams.get("reconnect") === "true";

  const { url, state, codeVerifier } = await initiateGoogleDriveConnection({
    forceConsent,
  });

  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  };

  cookieStore.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  cookieStore.set(OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions);

  redirect(url);
}
