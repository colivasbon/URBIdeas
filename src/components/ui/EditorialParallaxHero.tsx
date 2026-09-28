"use client";

import TerritorialBackground from "./TerritorialBackground";

interface Props {
  children: React.ReactNode;
  /** Capa decorativa territorial estática (por defecto, retícula). */
  decor?: React.ReactNode;
  className?: string;
}

/**
 * Cabecera con fondo territorial ESTÁTICO (sin parallax ni listeners).
 * Conserva el nombre por compatibilidad. Para páginas interiores use
 * PageShell; para portadas, MapSheet.
 */
export default function EditorialParallaxHero({ children, decor, className = "" }: Props) {
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        {decor ?? <TerritorialBackground variant="grid" />}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
