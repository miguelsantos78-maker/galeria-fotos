"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { PublicPhoto } from "@/server/use-cases/photos";
import { PhotoTile } from "./photo-tile";

/** `gap-0.5` (0.125rem) na grelha CSS — usado para estimar a altura de
 * cada linha antes da primeira medição real (ver `measureElement`). */
const GRID_GAP_PX = 2;
/** `aspect-square` em `photo-tile.tsx`: altura = largura. */
const HEIGHT_OVER_WIDTH = 1;

/** Espelha os pontos de quebra do Tailwind usados na grelha
 * (`grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6`) — para
 * agrupar as fotografias em linhas com o mesmo número de colunas que a
 * grelha CSS desenharia. */
function getColumnCount(width: number): number {
  if (width >= 1024) return 6;
  if (width >= 768) return 5;
  if (width >= 640) return 4;
  return 3;
}

function useColumnCount(): number {
  const [columns, setColumns] = useState(() =>
    typeof window === "undefined" ? 3 : getColumnCount(window.innerWidth),
  );

  useEffect(() => {
    function handleResize() {
      setColumns(getColumnCount(window.innerWidth));
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return columns;
}

/**
 * Grelha virtualizada por linhas (secção 16 do CLAUDE.md: "virtualizar
 * a grelha quando o número de fotografias justificar") — só chegam a
 * montar-se as linhas visíveis, mais uma margem de segurança
 * (`overscan`), em vez de todas as fotografias do álbum de uma vez.
 * Reservada para álbuns grandes (ver `VIRTUALIZE_THRESHOLD` em
 * `photo-grid.tsx`); álbuns normais continuam a usar a grelha simples,
 * mais fácil de percorrer e testar.
 *
 * Virtualiza por linha, não por fotografia individual, para poder
 * continuar a usar a mesma grelha CSS responsiva (`display: grid`)
 * dentro de cada linha — `useColumnCount` só existe para agrupar as
 * fotografias em linhas do tamanho certo antes de as passar ao
 * virtualizador; quem decide onde cada fotografia cai dentro da linha
 * continua a ser o CSS.
 */
export function VirtualizedPhotoGrid({
  photos,
  onOpen,
}: {
  photos: PublicPhoto[];
  onOpen: (photoId: string) => void;
}) {
  const columns = useColumnCount();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const rows = useMemo(() => {
    const chunks: PublicPhoto[][] = [];
    for (let i = 0; i < photos.length; i += columns) {
      chunks.push(photos.slice(i, i + columns));
    }
    return chunks;
  }, [photos, columns]);

  const estimatedRowHeight = useMemo(() => {
    const viewportWidth =
      typeof window === "undefined" ? 360 : window.innerWidth;
    const columnWidth = (viewportWidth - (columns - 1) * GRID_GAP_PX) / columns;
    return columnWidth * HEIGHT_OVER_WIDTH;
  }, [columns]);

  // A grelha não começa no topo da janela (cabeçalho, botão de
  // apresentação, etc. vêm antes) — o virtualizador de janela precisa
  // de saber esse deslocamento para posicionar as linhas corretamente.
  useLayoutEffect(() => {
    setScrollMargin(containerRef.current?.offsetTop ?? 0);
  }, [columns]);

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => estimatedRowHeight,
    overscan: 3,
    scrollMargin,
  });

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (!row) return null;

        return (
          <div
            key={virtualRow.key}
            ref={rowVirtualizer.measureElement}
            data-index={virtualRow.index}
            className="absolute top-0 left-0 grid w-full grid-cols-3 gap-0.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
            style={{
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
          >
            {row.map((photo) => (
              <PhotoTile key={photo.id} photo={photo} onOpen={onOpen} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
