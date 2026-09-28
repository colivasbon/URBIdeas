"use client";

import { useLinkStatus } from "next/link";

/**
 * Indicador de navegación de una pestaña de hoja. Debe renderizarse DENTRO de
 * un <Link> posicionado (requisito de useLinkStatus). Spinner discreto en la
 * esquina de la pestaña, sin desplazar el texto; solo aparece si la navegación
 * tarda (retardo de opacidad) para no parpadear en transiciones instantáneas.
 */
export default function TabPendingIndicator() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`spinner pointer-events-none absolute right-0.5 top-1.5 h-2.5 w-2.5 border-[1.5px] text-[var(--text-muted)] transition-opacity ${
        pending ? "opacity-100 delay-200" : "opacity-0"
      }`}
    />
  );
}
