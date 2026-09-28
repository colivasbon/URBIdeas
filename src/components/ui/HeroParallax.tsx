"use client"

import TerritorialGrid from "./TerritorialGrid"

/**
 * Cabecera con retícula cartográfica ESTÁTICA. Conserva el nombre por
 * compatibilidad; ya no hay parallax ni listeners de scroll.
 */
export default function HeroParallax({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <TerritorialGrid />
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}
