"use client";

import { useEffect, useRef, useState } from "react";
import TerritorialBackground from "./TerritorialBackground";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface Props {
  children: React.ReactNode;
  /**
   * Capa decorativa territorial. Uso por página:
   * - `/`: `<TerritorialBackground variant="transition" />`
   * - `/socideas`: `<TerritorialBackground variant="grid" />` (estática)
   * - `/urbideas`: `<TerritorialBackground variant="contours" />`
   * Por defecto, grid estático para cabeceras de alto nivel.
   */
  decor?: React.ReactNode;
  className?: string;
}

/**
 * Hero editorial con parallax sutil.
 *
 * Solo la decoración se desplaza por scroll con requestAnimationFrame y
 * únicamente `transform: translate3d`. Cada capa con `[data-depth]`
 * se mueve según su profundidad (grid 8–12px, curvas 14–20px). Sin
 * listeners si la decoración es estática (`data-parallax="off"`) o si
 * `prefers-reduced-motion: reduce`. No usar en tablas, filtros,
 * gráficos, mapas, fichas densas ni controles críticos.
 */
export default function EditorialParallaxHero({ children, decor, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const decorRef = useRef<HTMLDivElement>(null);
  const [reducedMotion] = useState<boolean>(prefersReducedMotion);

  useEffect(() => {
    const el = containerRef.current;
    const decorEl = decorRef.current;
    if (!el || !decorEl || reducedMotion) return;
    const layers = Array.from(
      decorEl.querySelectorAll<HTMLElement>("[data-depth]"),
    ).filter((l) => Number(l.dataset.depth) > 0);
    // Fondo estático (SOCideas): ningún listener de scroll.
    if (layers.length === 0) return;

    let ticking = false;

    function apply() {
      const rect = el!.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 cuando el hero entra por abajo, 1 cuando sale por arriba.
      const progress = Math.max(0, Math.min(1, 1 - rect.bottom / (vh + rect.height)));
      for (const l of layers) {
        const depth = Number(l.dataset.depth) || 0;
        l.style.transform = `translate3d(0, ${(progress * depth).toFixed(1)}px, 0)`;
      }
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reducedMotion]);

  return (
    <div ref={containerRef} className={`editorial-hero ${className}`}>
      <div ref={decorRef} className="editorial-hero__decor" aria-hidden="true">
        {decor ?? <TerritorialBackground variant="grid" />}
      </div>
      <div className="editorial-hero__content">{children}</div>
    </div>
  );
}
