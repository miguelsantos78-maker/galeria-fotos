"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import type { PublicPhoto } from "@/server/use-cases/photos";

const AUTO_ADVANCE_INTERVAL_MS = 5000;
const SWIPE_THRESHOLD_PX = 50;
const SHARE_FEEDBACK_MS = 2000;

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/**
 * Lightbox de ecrã inteiro (secção 10.2), com o "modo apresentação"
 * (secção 10.1/22) como uma variante do mesmo componente: avança
 * automaticamente enquanto `isPresenting` está ativo, respeitando
 * `prefers-reduced-motion` (secção 17). As ações "destacar"/"eliminar"
 * ficam para a Fase 6 (moderação) — não fazem parte deste componente.
 */
export function Lightbox({
  photos,
  initialIndex,
  downloadEnabled,
  startInPresentationMode = false,
  onClose,
  onIndexChange,
}: {
  photos: PublicPhoto[];
  initialIndex: number;
  downloadEnabled: boolean;
  startInPresentationMode?: boolean;
  onClose: () => void;
  onIndexChange?: (photoId: string) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [isPresenting, setIsPresenting] = useState(startInPresentationMode);
  const [copyFeedback, setCopyFeedback] = useState(false);
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

  async function handleShare() {
    if (!photo) return;
    const url = new URL(window.location.href);
    url.searchParams.set("photo", photo.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), SHARE_FEEDBACK_MS);
    } catch {
      // Sem acesso à área de transferência (ex.: permissão negada) — sem
      // alternativa segura aqui, o utilizador pode copiar o URL da barra
      // de endereço manualmente.
    }
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
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
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

      <div className="relative flex flex-1 items-center justify-center px-4">
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Fotografia anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/30 p-3 text-lg text-white transition-colors hover:bg-white/10 sm:left-4"
          >
            ‹
          </button>
        )}

        {photo.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinado de um domínio de Storage dinâmico (por instalação); ver docs/decisions/0005.
          <img
            src={photo.previewUrl}
            alt="Fotografia do álbum"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="text-sm text-white/60">A carregar…</p>
        )}

        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Próxima fotografia"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/30 p-3 text-lg text-white transition-colors hover:bg-white/10 sm:right-4"
          >
            ›
          </button>
        )}
      </div>

      <div className="safe-bottom flex flex-wrap items-center justify-center gap-4 px-4 py-4 text-sm text-white/70">
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

        <button
          type="button"
          onClick={handleShare}
          className="rounded-full border border-white/30 px-4 py-1.5 font-medium text-white transition-colors hover:bg-white/10"
        >
          {copyFeedback ? "Link copiado" : "Partilhar"}
        </button>
      </div>
    </div>
  );
}
