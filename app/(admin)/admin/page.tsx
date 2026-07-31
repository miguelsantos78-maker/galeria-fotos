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
      <p className="text-foreground/60 max-w-md text-sm">
        A gestão de álbuns ainda não está disponível. Esta página será
        implementada numa fase seguinte do projeto.
      </p>
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
