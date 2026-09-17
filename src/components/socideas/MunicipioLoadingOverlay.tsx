"use client";

import { useEffect, useState } from "react";

interface Props {
  nombre: string;
  provincia?: string | null;
  comunidad?: string | null;
}

const PASOS = [
  "Localizando el municipio en el catálogo territorial",
  "Cargando demografía y economía con trazabilidad",
  "Comprobando cobertura y periodo de cada indicador",
];

export default function MunicipioLoadingOverlay({ nombre, provincia, comunidad }: Props) {
  const [lento, setLento] = useState(false);
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    const tLento = window.setTimeout(() => setLento(true), 3500);
    const tPasos = window.setInterval(() => setPaso((p) => (p + 1) % PASOS.length), 2200);
    return () => {
      window.clearTimeout(tLento);
      window.clearInterval(tPasos);
    };
  }, []);

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-dark-bg)]/60 p-4 backdrop-blur-[3px]"
      role="status"
      aria-label={`Abriendo ficha municipal de ${nombre}`}
    >
      <span className="sr-only">Cargando los datos municipales.</span>
      <div className="glass-card w-full max-w-md rounded-[6px] border border-[var(--color-border-subtle)] p-6">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="editorial-eyebrow">SOCideas · Ficha municipal</span>
        </div>
        <div className="mt-3 flex items-start gap-4">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)]"
          >
            <svg className="h-5 w-5 animate-spin text-conifera" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Abriendo ficha municipal</p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Preparando los datos de <span className="font-medium text-[var(--color-text-primary)]">{nombre}</span>
              {provincia ? ` · ${provincia}` : ""}
              {comunidad ? ` · ${comunidad}` : ""}
            </p>
            <p aria-hidden="true" className="tnum mt-3 text-xs font-medium text-[var(--color-text-muted)]">
              {PASOS[paso]}…
            </p>
            {lento && (
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Los datos municipales se están preparando. La primera carga puede tardar unos segundos.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
