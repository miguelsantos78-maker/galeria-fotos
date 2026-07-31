import { requireAdmin } from "@/lib/auth/dal";
import { AlbumDetail } from "@/components/admin/album-detail";

export default async function AdminAlbumDetailPage({
  params,
}: {
  params: Promise<{ albumId: string }>;
}) {
  await requireAdmin();
  const { albumId } = await params;

  return <AlbumDetail albumId={albumId} />;
}
