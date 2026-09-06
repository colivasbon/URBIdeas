"use client";

/**
 * Barra operativa de la ficha municipal: vive EN LA MISMA FILA que las categorías
 * (Demografía · Economía · Secciones censales) en desktop y debajo de ellas en
 * mobile, siempre con `flex-wrap` (nunca `nowrap`): sin overflow horizontal.
 * El menú interno llega por `children` (ActualizacionMenu); sin él, la barra
 * muestra solo resumen + XLSX. No genera archivos: el XLSX lo sirve el API route.
 */
export default function FichaToolbar({
  codigoINE,
  demoCount,
  ecoCount,
  demoPeriodo,
  ecoPeriodo,
  children,
}: {
  codigoINE: string;
  demoCount: number;
  ecoCount: number;
  demoPeriodo?: string | null;
  ecoPeriodo?: string | null;
  children?: React.ReactNode;
}) {
  const total = demoCount + ecoCount;
  const detalle = [
    `Demografía: ${demoCount} tabla${demoCount === 1 ? "" : "s"}${demoPeriodo ? ` (${demoPeriodo})` : ""}`,
    `Economía: ${ecoCount} tabla${ecoCount === 1 ? "" : "s"}${ecoPeriodo ? ` (${ecoPeriodo})` : ""}`,
  ].join(" · ");
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2"
      aria-label="Acciones de la ficha municipal"
    >
      <span
        role="status"
        title={detalle}
        className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-[var(--color-input-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)]"
      >
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]" />
        <span className="truncate">
          {total} tabla{total === 1 ? "" : "s"} disponible{total === 1 ? "" : "s"} · Demo {demoCount} · Eco {ecoCount}
        </span>
      </span>
      <a
        href={`/api/socideas/exportar/${codigoINE}`}
        download
        title={`Descargar libro XLSX combinado de este municipio. ${detalle}.`}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--color-primary-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Descargar XLSX
      </a>
      {children}
    </div>
  );
}
