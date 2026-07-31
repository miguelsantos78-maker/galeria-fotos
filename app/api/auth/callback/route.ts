import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

/**
 * Destino do redirecionamento OAuth do Supabase Auth (login Google do
 * administrador — secção 6.1). Troca o código de autorização por uma
 * sessão e reencaminha para a área administrativa.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/admin/login?error=auth_callback_failed`,
  );
}
