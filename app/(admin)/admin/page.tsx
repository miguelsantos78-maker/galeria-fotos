import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { createUploadJobsRepository } from "@/server/repositories/upload-jobs-repository";
import { getDashboardStats } from "@/server/use-cases/dashboard";
import { PHOTO_STATUS_LABELS } from "@/lib/media/photo-status-labels";

export default async function AdminDashboardPage() {
  const profile = await requireAdmin();

  const supabase = createSupabaseAdminClient();
  const stats = await getDashboardStats(profile.id, {
    albums: createAlbumsRepository(supabase),
    photos: createPhotosRepository(supabase),
    uploadJobs: createUploadJobsRepository(supabase),
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">
            Administração
          </h1>
          <p className="text-foreground/70 text-sm">
            Sessão iniciada como{" "}
            <strong>{profile.display_name ?? profile.email}</strong>.
          </p>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="border-border text-foreground hover:bg-surface-muted rounded-full border px-4 py-2 text-sm font-medium transition-colors"
          >
            Sair
          </button>
        </form>
      </header>

      <div className="flex flex-wrap gap-3">
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

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-card border-border bg-surface border p-4">
          <p className="text-foreground/60 text-sm">Álbuns</p>
          <p className="text-foreground text-2xl font-semibold">
            {stats.albumsCount}
          </p>
        </div>
        <div className="rounded-card border-border bg-surface border p-4">
          <p className="text-foreground/60 text-sm">Fotografias</p>
          <p className="text-foreground text-2xl font-semibold">
            {stats.photosCount}
          </p>
        </div>
        <div className="rounded-card border-border bg-surface border p-4">
          <p className="text-foreground/60 text-sm">Envios com erro</p>
          <p
            className={
              stats.failedUploadsCount > 0
                ? "text-danger text-2xl font-semibold"
                : "text-foreground text-2xl font-semibold"
            }
          >
            {stats.failedUploadsCount}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-foreground text-lg font-medium">
          Fotografias recentes
        </h2>

        {stats.recentUploads.length === 0 ? (
          <p className="text-foreground/60 text-sm">
            Ainda não há fotografias enviadas.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {stats.recentUploads.map((upload) => (
              <li
                key={upload.photoId}
                className="rounded-card border-border flex items-center justify-between gap-3 border px-4 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate">
                    {upload.filename}
                  </p>
                  <p className="text-foreground/60">
                    {upload.albumTitle} ·{" "}
                    {new Date(upload.uploadedAt).toLocaleString("pt-PT")}
                  </p>
                </div>
                <span className="bg-surface-muted text-foreground/70 shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                  {PHOTO_STATUS_LABELS[upload.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
