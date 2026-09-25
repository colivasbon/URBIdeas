"use client";

import TerritorialBackground from "./TerritorialBackground";

interface Props {
  children: React.ReactNode;
  /**
   * Capa decorativa territorial. Uso por página:
   * - `/`: `<TerritorialBackground variant="transition" />`
   * - `/socideas`: `<TerritorialBackground variant="grid" />` (estática)
   * - `/urbideas`: `<TerritorialBackground variant="contours" />`
   */
  decor?: React.ReactNode;
  className?: string;
}

/**
 * Hero editorial con fondo territorial ESTÁTICO (sin parallax ni listeners).
 * La decoración es puramente compositiva: retícula y curvas de nivel de marca.
 */
export default function EditorialParallaxHero({ children, decor, className = "" }: Props) {
  return (
    <div className={`editorial-hero ${className}`}>
      <div className="editorial-hero__decor" aria-hidden="true">
        {decor ?? <TerritorialBackground variant="grid" />}
      </div>
      <div className="editorial-hero__content">{children}</div>
    </div>
  );
}
