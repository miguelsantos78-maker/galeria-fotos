import { redirect } from "next/navigation";

/**
 * O envio de fotografias passou a fazer-se diretamente na página do
 * álbum (secção 10 — "aplicação simples de utilizar"), sem uma página
 * dedicada. Este redirecionamento existe só para não partir
 * marcadores/links antigos para este ecrã.
 */
export default async function AlbumUploadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: token } = await params;
  redirect(`/a/${token}`);
}
