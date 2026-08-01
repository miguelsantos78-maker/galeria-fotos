import { UploadPage } from "@/components/upload/upload-page";

export default async function AlbumUploadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: token } = await params;

  return <UploadPage token={token} />;
}
