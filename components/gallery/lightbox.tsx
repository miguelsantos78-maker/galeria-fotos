"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { PublicPhoto } from "@/server/use-cases/photos";

const AUTO_ADVANCE_INTERVAL_MS = 5000;
const SWIPE_THRESHOLD_PX = 50;

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/** Deslocamentos à volta da fotografia atual que chegam a ser desenhados
 * (secção 10.2: "imagem ajustada ao ecrã") — a anterior e a seguinte
 * espreitam parcialmente dos lados, o resto da lista nem chega a
 * montar (pode ter dezenas de fotografias). */
const VISIBLE_OFFSETS = [-1, 0, 1] as const;

/**
 * Lightbox de ecrã inteiro (secção 10.2), com o "modo apresentação"
 * (secção 10.1/22) como uma variante do mesmo componente: avança
 * automaticamente enquanto `isPresenting` está ativo, respeitando
 * `prefers-reduced-motion` (secção 17). "Eliminar" só aparece para o
 * dono do álbum (`isOwner`, resolvido no servidor em
 * `resolveAlbumSession` — nunca confiado apenas no cliente: o endpoint
 * `DELETE /api/photos/[photoId]` volta a validar a sessão de
 * administrador e a posse do álbum).
 *
 * Em vez de um fundo preto sólido a cobrir a página, o diálogo abre
 * sobre a própria galeria com um véu semitransparente desfocado
 * (`backdrop-filter: blur`, a mesma técnica do cabeçalho com
 * fotografia de capa — ADR 0023) — a fotografia atual aparece num
 * cartão arredondado, com a anterior/seguinte a espreitar dos lados
 * (ADR 0024), em vez de ocupar o ecrã inteiro.
 */
export function Lightbox({
  photos,
  initialIndex,
  downloadEnabled,
  isOwner,
  startInPresentationMode = false,
  onClose,
  onIndexChange,
  onDeleted,
}: {
  photos: PublicPhoto[];
  initialIndex: number;
  downloadEnabled: boolean;
  isOwner: boolean;
  startInPresentationMode?: boolean;
  onClose: () => void;
  onIndexChange?: (photoId: string) => void;
  onDeleted: (photoId: string) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [isPresenting, setIsPresenting] = useState(startInPresentationMode);
  const deleteMutation = useMutation({
    mutationFn: (photoId: string) =>
      apiFetch(`/api/photos/${photoId}`, { method: "DELETE" }),
    onSuccess: (_data, photoId) => onDeleted(photoId),
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const photo = photos[index];

  const goPrev = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  const goNext = useCallback(() => {
    setIndex((current) => Math.min(photos.length - 1, current + 1));
  }, [photos.length]);

  useEffect(() => {
    onIndexChange?.(photo?.id ?? "");
    // Só quando o índice (ou a lista) muda — não a cada nova referência do callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photo?.id]);

  // Foco inicial + restaurar foco ao fechar, bloquear scroll de fundo (secção 10.2/17).
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, []);

  // Teclado: setas, Escape, e o foco preso dentro do modal com Tab.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        goPrev();
        return;
      }
      if (event.key === "ArrowRight") {
        goNext();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goPrev, goNext, onClose]);

  // Modo apresentação: avança automaticamente, exceto com movimento reduzido pedido.
  useEffect(() => {
    if (!isPresenting) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const interval = setInterval(() => {
      setIndex((current) =>
        current < photos.length - 1 ? current + 1 : 0,
      );
    }, AUTO_ADVANCE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isPresenting, photos.length]);

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const deltaX = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    if (deltaX > 0) goPrev();
    else goNext();
  }

  if (!photo) return null;

  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Visualização de fotografia"
      className="fixed inset-0 z-50 flex flex-col bg-black/35 backdrop-blur-2xl"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="safe-top flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setIsPresenting((current) => !current)}
          className="rounded-full border border-white/30 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
        >
          {isPresenting ? "Pausar apresentação" : "Apresentação"}
        </button>

        <p className="text-sm text-white/70" aria-live="polite">
          {index + 1} / {photos.length}
        </p>

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-full border border-white/30 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
        >
          Fechar
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {VISIBLE_OFFSETS.map((offset) => {
          const slideIndex = index + offset;
          const slidePhoto = photos[slideIndex];
          if (!slidePhoto) return null;
          const isCurrent = offset === 0;

          return (
            <div
              key={slidePhoto.id}
              aria-hidden={!isCurrent}
              className={`rounded-card absolute top-1/2 left-1/2 h-[68%] w-[78%] max-w-xl overflow-hidden bg-black/30 shadow-2xl transition-[transform,opacity] duration-300 sm:w-[62%] ${isCurrent ? "" : "pointer-events-none"}`}
              style={{
                transform: `translate(-50%, -50%) translateX(${offset * 88}%) scale(${isCurrent ? 1 : 0.85})`,
                opacity: isCurrent ? 1 : 0.45,
                zIndex: isCurrent ? 2 : 1,
              }}
            >
              {slidePhoto.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL assinado de um domínio de Storage dinâmico (por instalação); ver docs/decisions/0005.
                <img
                  src={slidePhoto.previewUrl}
                  alt={isCurrent ? "Fotografia do álbum" : ""}
                  className="h-full w-full object-contain"
                />
              ) : (
                isCurrent && (
                  <p className="flex h-full items-center justify-center text-sm text-white/60">
                    A carregar…
                  </p>
                )
              )}
            </div>
          );
        })}

        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Fotografia anterior"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/30 bg-black/20 p-3 text-lg text-white transition-colors hover:bg-white/10 sm:left-4"
          >
            ‹
          </button>
        )}

        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Próxima fotografia"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/30 bg-black/20 p-3 text-lg text-white transition-colors hover:bg-white/10 sm:right-4"
          >
            ›
          </button>
        )}
      </div>

      <div className="safe-bottom flex flex-col items-center gap-2 px-4 py-4">
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-white/70">
          <span>
            Enviada em {new Date(photo.uploadedAt).toLocaleDateString("pt-PT")}
          </span>

          {downloadEnabled && (
            <a
              href={`/api/media/${photo.id}/original`}
              download
              className="rounded-full border border-white/30 px-4 py-1.5 font-medium text-white transition-colors hover:bg-white/10"
            >
              Transferir
            </a>
          )}

          {isOwner && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Eliminar esta fotografia? Esta ação não pode ser desfeita.",
                  )
                ) {
                  deleteMutation.mutate(photo.id);
                }
              }}
              disabled={deleteMutation.isPending}
              className="border-danger/60 text-danger rounded-full border px-4 py-1.5 font-medium transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteMutation.isPending ? "A eliminar…" : "Eliminar"}
            </button>
          )}
        </div>

        {deleteMutation.isError && (
          <p role="alert" className="text-danger text-xs">
            Não foi possível eliminar a fotografia. Tente novamente.
          </p>
        )}
      </div>
    </div>
  );
}
