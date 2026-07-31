import { requireAdmin } from "@/lib/auth/dal";
import { AlbumsList } from "@/components/admin/albums-list";

export default async function AdminAlbumsPage() {
  await requireAdmin();

  return <AlbumsList />;
}
