"use client";

import { useEffect, useState } from "react";

/** Só aparece depois de o utilizador ter descido o equivalente a
 * cerca de dois ecrãs — antes disso o topo ainda está à mão e o botão
 * seria só ruído. */
const SHOW_AFTER_PX = 1200;

/**
 * Num álbum com centenas ou milhares de fotografias, a grelha tem
 * dezenas de milhares de píxeis de altura — voltar ao cabeçalho à mão
 * é impraticável, sobretudo no telemóvel. Fica acima do botão de envio
 * (que é fixo no fundo, ver `components/upload/upload-queue.tsx`) para
 * não se sobreporem.
 */
export function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsVisible(window.scrollY > SHOW_AFTER_PX);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={() =>
        window.scrollTo({
          top: 0,
          // Respeita "prefers-reduced-motion" (secção 17): sem
          // animação de scroll para quem pediu menos movimento.
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      }
      aria-label="Voltar ao topo"
      className="border-border bg-surface/90 text-foreground hover:bg-surface fixed right-4 bottom-28 z-30 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur transition active:scale-95 motion-reduce:active:scale-100 sm:bottom-32"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-5 w-5"
      >
        <path
          fillRule="evenodd"
          d="M10 17a1 1 0 0 1-1-1V6.41L5.7 9.71a1 1 0 1 1-1.4-1.42l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 1 1-1.4 1.42L11 6.41V16a1 1 0 0 1-1 1Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}
