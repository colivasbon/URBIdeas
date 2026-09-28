"use client";

import { useMemo, useState } from "react";
import {
  nombreBloque,
  nombreCSV,
  tablaACSV,
  traceabilityRows,
  type ExportTable,
} from "@/lib/socideas-export";

/**
 * Página de descargas por bloque: tablas reales ya presentes en la ficha.
 * CSV por tabla + informe HTML imprimible. Sin XLSX en esta pasada (ver auditoría:
 * `xlsx@0.18.5` no escribe estilos fiables; no se finge Excel). Idempotente,
 * sin escrituras, sin secretos.
 */
export default function DescargasBloque({
  municipio,
  codigoINE,
  bloque,
  tablas,
  excluidas,
}: {
  municipio: string;
  codigoINE: string;
  bloque: "Demografia" | "Economia";
  tablas: ExportTable[];
  excluidas: { titulo: string; motivo: string }[];
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [xlsxDownloading, setXlsxDownloading] = useState(false);
  const [xlsxError, setXlsxError] = useState<string | null>(null);
  const fecha = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const periodoGlobal = useMemo(() => {
    const ps = tablas.map((t) => t.periodo).filter(Boolean);
    return ps.length > 0 ? [...new Set(ps)].join(", ") : "—";
  }, [tablas]);
  const fuentes = useMemo(() => [...new Set(tablas.map((t) => t.fuente))], [tablas]);

  const descargar = (nombre: string, contenido: string, tipo: string) => {
    const blob = new Blob([contenido], { type: `${tipo};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const csvTabla = (t: ExportTable) => {
    descargar(nombreCSV(municipio, codigoINE, bloque, t.id, t.periodo.replace(/[^0-9-–]/g, "") || "periodo"), tablaACSV(t), "text/csv");
    setAviso(`Descargado ${t.titulo} con fuente y periodo.`);
    setTimeout(() => setAviso(null), 3000);
  };

  const descargarTodo = () => {
    if (tablas.length === 0) return;
    for (const t of tablas) {
      descargar(nombreCSV(municipio, codigoINE, bloque, t.id, t.periodo.replace(/[^0-9-–]/g, "") || "periodo"), tablaACSV(t), "text/csv");
    }
    setAviso(`Descargadas ${tablas.length} tablas del bloque. Cada CSV incluye fuente y periodo.`);
    setTimeout(() => setAviso(null), 4000);
  };

  const imprimir = () => window.print();

  const handleXlsxDownload = async () => {
    if (xlsxDownloading) return;
    setXlsxDownloading(true);
    setXlsxError(null);
    try {
      const res = await fetch(`/api/socideas/exportar/${encodeURIComponent(codigoINE)}`);
      if (!res.ok) {
        let msg = "No se ha podido generar el Excel.";
        try {
          const body = await res.json();
          if (body?.error && typeof body.error === "string") msg = body.error;
          if (body?.ref && typeof body.ref === "string") msg += ` — Ref: ${body.ref}`;
        } catch { /* no-op */ }
        setXlsxError(msg);
        return;
      }
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
      setXlsxError("No se ha podido conectar con el servidor. Compruebe su conexión e inténtelo de nuevo.");
    } finally {
      setXlsxDownloading(false);
    }
  };

  return (
    <div>
      {/* Resumen de disponibilidad */}
      <div role="status" aria-label="Resumen de disponibilidad">
        <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-success-fg)]" />
            <span className="tabular-nums">{tablas.length}</span> tabla{tablas.length === 1 ? "" : "s"} disponible{tablas.length === 1 ? "" : "s"}
          </span>
          <span>
            Periodo: <span className="tabular-nums text-[var(--text-primary)]">{periodoGlobal}</span>
          </span>
          {fuentes.length > 0 && (
            <span>
              Fuentes: <span className="text-[var(--text-primary)]">{fuentes.join(", ")}</span>
            </span>
          )}
        </p>
        {excluidas.length > 0 && (
          <p className="mt-2 max-w-[70ch] text-[13px] text-[var(--text-muted)]">
            {excluidas.length} bloque{excluidas.length === 1 ? "" : "s"} no incluido{excluidas.length === 1 ? "" : "s"} por falta de cobertura
            (documentado en trazabilidad, sin rellenar con valores).
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleXlsxDownload}
            disabled={xlsxDownloading}
            title={xlsxDownloading ? "Generando Excel…" : "Libro XLSX combinado del municipio (resumen con trazabilidad, demografía y economía)"}
            aria-busy={xlsxDownloading || undefined}
            className="btn btn-primary"
          >
            {xlsxDownloading && <span aria-hidden="true" className="spinner h-4 w-4" />}
            {xlsxDownloading ? "Generando Excel…" : "Descargar libro XLSX combinado"}
          </button>
          <button
            type="button"
            onClick={descargarTodo}
            disabled={tablas.length === 0}
            className="btn btn-secondary"
          >
            Descargar todas las tablas (CSV)
          </button>
          <button
            type="button"
            onClick={imprimir}
            disabled={tablas.length === 0}
            className="btn btn-ghost"
          >
            Descargar informe imprimible
          </button>
        </div>
        {aviso && <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">{aviso}</p>}
        {xlsxError && <p role="alert" className="mt-3 text-sm socideas-error-text">{xlsxError}</p>}
        <p className="mt-3 max-w-[70ch] text-xs text-[var(--text-muted)]">
          Los CSV se descargan como <span className="break-all">{nombreBloque(municipio, codigoINE, bloque)}_*.csv</span>; cada
          uno incluye fuente y periodo. El informe imprimible usa la vista de impresión del navegador.
        </p>
      </div>

      {/* Índice de tablas */}
      <div className="mt-10">
        {tablas.map((t) => (
          <article key={t.id} className={`border-t border-[var(--border-subtle)] py-8${t.columnas.length <= 2 ? " socideas-narrow-card" : ""}`} aria-label={`Tabla ${t.titulo}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="type-h4 text-[var(--text-primary)]">{t.titulo}</h2>
                <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--text-muted)]">
                  <span>
                    <span className="tabular-nums">{t.filas.length}</span> fila{t.filas.length === 1 ? "" : "s"}
                  </span>
                  <span>
                    Fuente: <span className="text-[var(--text-secondary)]">{t.fuente}</span>
                  </span>
                  <span>
                    Periodo: <span className="tabular-nums text-[var(--text-secondary)]">{t.periodo}</span>
                  </span>
                  <span>{t.cobertura}</span>
                  <span>{t.estado}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`#tabla-${t.id}`} className="btn btn-ghost btn-sm">
                  Ver tabla
                </a>
                <button type="button" onClick={() => csvTabla(t)} className="btn btn-secondary btn-sm">
                  Descargar CSV
                </button>
              </div>
            </div>
            <div className="socideas-table-shell__scroll mt-3" style={t.filas.length > 11 ? { maxHeight: "24rem", overflowY: "auto" } : undefined} id={`tabla-${t.id}`} tabIndex={-1} role="region" aria-label={`Tabla ${t.titulo}`}>
              <table className={`socideas-table${t.columnas[0] === "Año" && t.columnas.length <= 3 ? " socideas-table--compact-two" : ""}`}>
                <thead>
                  <tr>{t.columnas.map((c, ci) => (<th key={c} scope="col" className={c === "Año" ? "socideas-table__year" : ci === 0 ? "socideas-table__text" : "socideas-table__numeric"}>{c}</th>))}</tr>
                </thead>
                <tbody>
                  {t.filas.map((f, i) => (
                    <tr key={i}>
                      {f.map((c, j) => (
                        <td key={j} className={t.columnas[j] === "Año" ? "socideas-table__year" : j === 0 ? "socideas-table__text" : "socideas-table__numeric"}>{c.text}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
        {tablas.length === 0 && (
          <div className="rounded-[6px] border border-dashed border-[var(--border-default)] px-5 py-4" data-state="pending" role="status">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="type-h4 text-[var(--text-primary)]">Sin tablas exportables en este bloque</p>
              <span className="socideas-badge" data-tone="draft">
                <span aria-hidden="true" className="socideas-badge__dot" />
                Sin datos
              </span>
            </div>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
              Este municipio aún no tiene indicadores con valor real en este bloque. Nada se rellena con ceros; consulte
              el panel de cobertura de la ficha para ver qué fuente está pendiente.
            </p>
          </div>
        )}
      </div>

      {/* Informe imprimible (pantalla + print) */}
      <div className="print-report mt-12 border-t border-[var(--border-strong)] pt-10" aria-label="Informe imprimible">
        <style>{`@media print {
          body * { visibility: hidden; }
          .print-report, .print-report * { visibility: visible; }
          .print-report { position: absolute; inset: 0; padding: 24px; }
          .print-report table { width: 100%; border-collapse: collapse; }
          .print-report th { background: #3E665C !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-report th, .print-report td { border: 1px solid #B0BDB0; padding: 6px 8px; font-size: 11px; }
        }`}</style>
        <div>
          <div className="border-b border-[var(--border-subtle)] pb-5">
            <p className="text-xs font-medium text-[var(--text-muted)]">IDEAS Sostenibilidad, SOCideas. Vista previa del informe imprimible</p>
            <h2 className="type-h3 mt-1 text-[var(--text-primary)]">Tablas de {bloque === "Demografia" ? "demografía" : "economía"}: {municipio} ({codigoINE})</h2>
            <p className="mt-1 max-w-[70ch] text-[13px] text-[var(--text-muted)]">Generado el {fecha}. Tablas generadas a partir de los indicadores disponibles en la ficha municipal, con fuente y periodo de referencia.</p>
          </div>
          <div className="pt-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">00_Resumen_y_trazabilidad</h3>
            <ul className="mt-2 max-w-[70ch] space-y-1 text-xs text-[var(--text-secondary)]">
              {traceabilityRows({ municipio, codigoINE, bloque: bloque === "Demografia" ? "Demografía" : "Economía", fechaGeneracion: fecha, tablas, excluidas }).map((r, i) => (
                <li key={i}>{r.length > 1 ? `${r[0]}: ${r.slice(1).join(", ")}` : r[0]}</li>
              ))}
            </ul>
            {tablas.map((t) => (
              <div key={t.id} className="mt-5">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t.titulo}</h4>
                <p className="text-xs text-[var(--text-muted)]">Fuente: {t.fuente}. Periodo: {t.periodo}. {t.estado}.</p>
                <div className="overflow-x-auto">
                <table className="ideas-table mt-2">
                  <thead><tr>{t.columnas.map((c) => (<th key={c}>{c}</th>))}</tr></thead>
                  <tbody>
                    {t.filas.map((f, i) => (
                      <tr key={i}>{f.map((c, j) => (<td key={j}>{c.text}</td>))}</tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
