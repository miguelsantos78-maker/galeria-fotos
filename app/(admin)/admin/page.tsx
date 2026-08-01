import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";

export default async function AdminDashboardPage() {
  const profile = await requireAdmin();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-foreground text-2xl font-semibold">Administração</h1>
      <p className="text-foreground/70">
        Sessão iniciada como{" "}
        <strong>{profile.display_name ?? profile.email}</strong>.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/admin/albums"
          className="bg-brand-600 hover:bg-brand-700 rounded-full px-5 py-2 text-sm font-medium text-white transition-colors"
        >
          Gerir álbuns
        </Link>
        <Link
          href="/admin/settings/integrations"
          className="border-border text-foreground hover:bg-surface-muted rounded-full border px-5 py-2 text-sm font-medium transition-colors"
        >
          Integração Google Drive
        </Link>
      </div>
      <form action="/api/auth/signout" method="post">
        <button
          type="submit"
          className="border-border text-foreground hover:bg-surface-muted rounded-full border px-5 py-2 text-sm font-medium transition-colors"
        >
          Sair
        </button>
      </form>
    </main>
  );
}
