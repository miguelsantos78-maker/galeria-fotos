import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { completeGoogleDriveConnection } from "@/server/use-cases/google-drive-connection";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from "@/lib/google-drive/oauth-cookies";
import { logger } from "@/lib/observability/logger";

const INTEGRATIONS_PATH = "/admin/settings/integrations";

export async function GET(request: Request) {
  const profile = await requireAdmin();

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(OAUTH_VERIFIER_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);
  cookieStore.delete(OAUTH_VERIFIER_COOKIE);

  const isValidRequest =
    !errorParam && code && state && expectedState && codeVerifier && state === expectedState;

  if (!isValidRequest) {
    return NextResponse.redirect(
      `${origin}${INTEGRATIONS_PATH}?error=google_drive_connect_failed`,
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    await completeGoogleDriveConnection(
      { code, codeVerifier },
      { ownerId: profile.id },
      {
        connections: createGoogleConnectionsRepository(supabase),
        auditLog: createAuditLogRepository(supabase),
      },
    );
  } catch (error) {
    logger.error({
      operation: "googleDrive.callback.completeConnection",
      userId: profile.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(
      `${origin}${INTEGRATIONS_PATH}?error=google_drive_connect_failed`,
    );
  }

  return NextResponse.redirect(`${origin}${INTEGRATIONS_PATH}?connected=true`);
}
