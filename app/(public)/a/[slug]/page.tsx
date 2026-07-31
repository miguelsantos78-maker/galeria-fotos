import { AlbumResolver } from "@/components/gallery/album-resolver";

/**
 * O segmento "slug" transporta o token opaco do link de partilha, não
 * `albums.slug` (que é só um identificador interno) — ver
 * docs/decisions/0003-fase-2-albuns-partilha.md.
 */
export default async function AlbumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: token } = await params;

  return <AlbumResolver token={token} />;
}
