export default async function AlbumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-foreground text-2xl font-semibold">
        Álbum &ldquo;{slug}&rdquo;
      </h1>
      <p className="text-foreground/70 max-w-md">
        A galeria pública ainda não está disponível. Esta página será
        implementada numa fase seguinte do projeto.
      </p>
    </main>
  );
}
