"use client";

import { useCallback, useState } from "react";

/**
 * Barra operativa de la ficha municipal: vive EN LA MISMA FILA que las categorías
 * (Demografía · Economía · Secciones censales) en desktop y debajo de ellas en
 * mobile, siempre con `flex-wrap` (nunca `nowrap`): sin overflow horizontal.
 * El menú interno llega por `children` (ActualizacionMenu); sin él, la barra
 * muestra solo resumen + XLSX. No genera archivos: el XLSX lo sirve el API route.
 *
 * Descarga via fetch + blob para manejar errores HTTP y mostrar feedback.
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
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detalle = [
    `Demografía: ${demoCount} tabla${demoCount === 1 ? "" : "s"}${demoPeriodo ? ` (${demoPeriodo})` : ""}`,
    `Economía: ${ecoCount} tabla${ecoCount === 1 ? "" : "s"}${ecoPeriodo ? ` (${ecoPeriodo})` : ""}`,
  ].join(" · ");

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/socideas/exportar/${encodeURIComponent(codigoINE)}`);
      if (!res.ok) {
        let msg = "No se ha podido generar el Excel.";
        try {
          const body = await res.json();
          if (body?.error && typeof body.error === "string") msg = body.error;
          if (body?.ref && typeof body.ref === "string") msg += ` — Ref: ${body.ref}`;
        } catch {
          /* respuesta no-JSON: usar mensaje genérico */
        }
        setError(msg);
        return;
      }
      // Descargar el binario como blob.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `SOCideas_${codigoINE}_libro.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setDownloading(false);
    }
  }, [codigoINE, downloading]);

  return (
    <div
      className="min-w-0"
      aria-label="Acciones de la ficha municipal"
    >
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <span
          role="status"
          title={detalle}
          className="inline-flex max-w-full items-center gap-1.5 truncate rounded-[6px] bg-[var(--color-input-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)]"
        >
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]" />
          <span className="truncate">
            {total} tabla{total === 1 ? "" : "s"} disponible{total === 1 ? "" : "s"} · Demo {demoCount} · Eco {ecoCount}
          </span>
        </span>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          title={downloading ? "Generando Excel…" : `Descargar libro XLSX combinado de este municipio. ${detalle}.`}
          className="inline-flex shrink-0 items-center gap-2 rounded-[6px] bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--color-primary-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {downloading ? "Generando Excel…" : "Descargar XLSX"}
        </button>
        {children}
      </div>
      {error && (
        <div role="alert" className="mt-2 w-full text-xs socideas-error-text break-words">
          <span>{error}</span>
          {error.includes("XLSX-") && (
            <button
              type="button"
              onClick={() => {
                const ref = error.match(/XLSX-[A-Z0-9]+/)?.[0];
                if (ref) navigator.clipboard.writeText(ref);
              }}
              className="ml-2 socideas-error-btn"
            >
              Copiar ref
            </button>
          )}
        </div>
      )}
    </div>
  );
}
