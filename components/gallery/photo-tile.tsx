import type { PublicPhoto } from "@/server/use-cases/photos";

/** Uma miniatura da grelha — partilhada entre a grelha simples e a
 * grelha virtualizada (`virtualized-photo-grid.tsx`), para não
 * duplicar o mesmo botão em dois sítios. */
export function PhotoTile({
  photo,
  onOpen,
}: {
  photo: PublicPhoto;
  onOpen: (photoId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(photo.id)}
      className="bg-surface-muted focus-visible:ring-brand-600 relative block aspect-square w-full overflow-hidden focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset"
    >
      {photo.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinado de um domínio de Storage dinâmico (por instalação); ver docs/decisions/0005.
        <img
          src={photo.thumbnailUrl}
          alt="Fotografia do álbum"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </button>
  );
}
