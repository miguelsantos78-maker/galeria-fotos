import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/admin/google-sign-in-button";
import { getCurrentProfile } from "@/lib/auth/dal";
import { getServerEnv } from "@/lib/env";
import { isAdmin } from "@/lib/auth/admin";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = sanitizeRedirectPath(next);

  const profile = await getCurrentProfile();
  if (profile) {
    const env = getServerEnv();
    if (
      isAdmin({
        email: profile.email,
        role: profile.role,
        adminEmails: env.ADMIN_EMAILS,
      })
    ) {
      redirect(safeNext);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <div>
        <h1 className="text-foreground text-2xl font-semibold">
          Entrar na administração
        </h1>
        <p className="text-foreground/70 mt-2 max-w-sm text-sm">
          Acesso restrito a administradores do LiveGallery.
        </p>
      </div>
      <GoogleSignInButton next={safeNext} />
      {error && (
        <p role="alert" className="text-danger text-sm">
          Não foi possível concluir o início de sessão. Tente novamente.
        </p>
      )}
    </main>
  );
}
