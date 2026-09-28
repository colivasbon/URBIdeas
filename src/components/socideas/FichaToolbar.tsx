"use client";

import { useCallback, useState } from "react";

/**
 * Barra operativa de la ficha municipal, bajo la cabecera y separada por un
 * filete (no comparte fila con la navegación de hojas), con el recuento de tablas
 * disponibles y el botón principal de descarga del libro XLSX. El menú interno
 * llega por `children` (ActualizacionMenu); sin él, la banda muestra solo
 * resumen + XLSX. No genera archivos: el XLSX lo sirve el API route.
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
  ].join("; ");

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/socideas/exportar/${encodeURIComponent(codigoINE)}`);
      if (!res.ok) {
        let msg = "No se ha podido generar el Excel. Inténtelo de nuevo en unos segundos.";
        try {
          const body = await res.json();
          if (body?.error && typeof body.error === "string") msg = body.error;
          if (body?.ref && typeof body.ref === "string") msg += ` Referencia del error: ${body.ref}`;
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
      setError("No se ha podido conectar con el servidor. Compruebe su conexión e inténtelo de nuevo.");
    } finally {
      setDownloading(false);
    }
  }, [codigoINE, downloading]);

  return (
    <div className="mt-8 min-w-0 border-t border-[var(--border-subtle)] pt-5" aria-label="Acciones de la ficha municipal">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0" role="status" title={detalle}>
          <p className="text-sm text-[var(--text-primary)]">
            <span className="font-semibold tabular-nums">{total}</span> tabla{total === 1 ? "" : "s"} disponible
            {total === 1 ? "" : "s"} en el libro XLSX
          </p>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Demografía: <span className="tabular-nums">{demoCount}</span> tabla{demoCount === 1 ? "" : "s"}
            {demoPeriodo ? <span className="tabular-nums"> ({demoPeriodo})</span> : ""}; Economía:{" "}
            <span className="tabular-nums">{ecoCount}</span> tabla{ecoCount === 1 ? "" : "s"}
            {ecoPeriodo ? <span className="tabular-nums"> ({ecoPeriodo})</span> : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {children}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            aria-busy={downloading || undefined}
            title={
              downloading
                ? "Generando Excel…"
                : `Descargar libro XLSX combinado de este municipio. ${detalle}.`
            }
            className="btn btn-secondary shrink-0"
          >
            {downloading ? (
              <span aria-hidden="true" className="spinner h-4 w-4" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            {downloading ? "Generando Excel…" : "Descargar libro XLSX"}
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="mt-3 w-full socideas-error-text break-words text-sm">
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
              Copiar referencia
            </button>
          )}
        </div>
      )}
    </div>
  );
}
