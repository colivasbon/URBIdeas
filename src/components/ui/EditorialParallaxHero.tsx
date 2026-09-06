"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface Props {
  children: React.ReactNode;
  /** Verde mineral (urb), lima contenida (soc) o mineral corporativo (ideas). */
  accent?: "urb" | "soc" | "ideas";
  className?: string;
}

/**
 * Hero editorial con parallax sutil.
 *
 * Solo decoración (SVG inline aria-hidden) desplazada por scroll con
 * requestAnimationFrame y únicamente `transform`. Sin JS si
 * `prefers-reduced-motion: reduce`. No usar en tablas, filtros,
 * gráficos, mapas ni fichas densas.
 */
export default function EditorialParallaxHero({ children, accent = "ideas", className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const decorRef = useRef<HTMLDivElement>(null);
  const [reducedMotion] = useState<boolean>(prefersReducedMotion);

  useEffect(() => {
    const el = containerRef.current;
    const decor = decorRef.current;
    if (!el || !decor || reducedMotion) return;

    let ticking = false;

    function apply() {
      const rect = el!.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 cuando el hero entra por abajo, 1 cuando sale por arriba.
      const progress = Math.max(0, Math.min(1, 1 - rect.bottom / (vh + rect.height)));
      decor!.style.transform = `translate3d(0, ${(progress * 60).toFixed(1)}px, 0)`;
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

  const stroke = accent === "soc" ? "#6F9A2E" : "#3E665C";

  return (
    <div ref={containerRef} className={`editorial-hero ${className}`}>
      <div ref={decorRef} className="editorial-hero__decor" aria-hidden="true">
        <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" focusable="false">
          <defs>
            <pattern id={`ed-grid-${accent}`} width="96" height="96" patternUnits="userSpaceOnUse">
              <path
                d="M 96 0 H 0 V 96"
                fill="none"
                stroke={stroke}
                strokeWidth="1"
                opacity="0.28"
              />
              <circle cx="0" cy="0" r="1" fill={stroke} opacity="0.35" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#ed-grid-${accent})`} opacity="0.5" />
          <g fill="none" stroke={stroke} strokeWidth="1.2" opacity="0.35">
            <path d="M-40,220 C240,160 420,280 760,200 S1200,240 1560,180" />
            <path d="M-40,260 C240,200 420,320 760,240 S1200,280 1560,220" opacity="0.6" />
            <path d="M-40,300 C240,240 420,360 760,280 S1200,320 1560,260" opacity="0.35" />
          </g>
        </svg>
      </div>
      <div className="editorial-hero__content">{children}</div>
    </div>
  );
}
