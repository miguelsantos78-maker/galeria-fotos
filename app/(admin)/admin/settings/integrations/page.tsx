import { requireAdmin } from "@/lib/auth/dal";
import { GoogleDriveIntegration } from "@/components/admin/google-drive-integration";

export default async function AdminIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const notice =
    params.connected === "true"
      ? "connected"
      : params.error
        ? "error"
        : undefined;

  return <GoogleDriveIntegration notice={notice} />;
}
