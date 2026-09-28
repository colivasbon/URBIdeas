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
      className="fixed inset-0 z-50 flex items-center justify-center loading-overlay p-4"
      role="status"
      aria-label={`Abriendo ficha municipal de ${nombre}`}
    >
      <span className="sr-only">Cargando los datos municipales.</span>
      <div className="w-full max-w-md rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-3)]">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="spinner mt-0.5 h-5 w-5 shrink-0 text-[var(--moss-ink)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Abriendo ficha municipal</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Preparando los datos de <span className="font-medium text-[var(--text-primary)]">{nombre}</span>
              {provincia ? `, ${provincia}` : ""}
              {comunidad ? `, ${comunidad}` : ""}
            </p>
            <p aria-hidden="true" className="tnum mt-3 text-xs font-medium text-[var(--text-muted)]">
              {PASOS[paso]}…
            </p>
            {lento && (
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                Los datos municipales se están preparando. La primera carga puede tardar unos segundos.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
