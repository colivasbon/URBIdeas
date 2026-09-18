"use client";

import { useLinkStatus } from "next/link";

/**
 * Indicador de navegación de una pestaña de hoja. Debe renderizarse DENTRO de
 * un <Link> (requisito de useLinkStatus). Muestra un spinner discreto solo si
 * la navegación tarda: permanece invisible (delay por CSS) para no parpadear en
 * transiciones instantáneas.
 */
export default function TabPendingIndicator() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`tab-spinner${pending ? " is-pending" : ""}`} />;
}
