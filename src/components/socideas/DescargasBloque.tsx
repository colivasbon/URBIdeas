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
    return ps.length > 0 ? [...new Set(ps)].join(" · ") : "—";
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
      setXlsxError("No se ha podido generar el Excel. Inténtalo de nuevo más tarde.");
    } finally {
      setXlsxDownloading(false);
    }
  };

  return (
    <div>
      {/* Resumen de disponibilidad */}
      <div className="premium-card p-5 sm:p-6" role="status" aria-label="Resumen de disponibilidad">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-input-bg)] px-3 py-1 font-semibold text-[var(--color-text-secondary)]">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
            {tablas.length} tabla{tablas.length === 1 ? "" : "s"} disponible{tablas.length === 1 ? "" : "s"} · Periodo: {periodoGlobal}
          </span>
          {fuentes.map((f) => (
            <span key={f} className="inline-flex items-center rounded-full border border-[var(--color-border-subtle)] px-3 py-1 text-[var(--color-text-muted)]">{f}</span>
          ))}
        </div>
        {excluidas.length > 0 && (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            {excluidas.length} bloque{excluidas.length === 1 ? "" : "s"} no incluido{excluidas.length === 1 ? "" : "s"} por falta de cobertura
            (documentado en trazabilidad, sin rellenar con valores).
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleXlsxDownload}
            disabled={xlsxDownloading}
            title={xlsxDownloading ? "Generando Excel…" : "Libro XLSX combinado del municipio (resumen con trazabilidad, demografía y economía)"}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {xlsxDownloading ? "Generando Excel…" : "Descargar libro XLSX combinado"}
          </button>
          <button
            type="button"
            onClick={descargarTodo}
            disabled={tablas.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
          >
            Descargar todas las tablas (CSV)
          </button>
          <button
            type="button"
            onClick={imprimir}
            disabled={tablas.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
          >
            Descargar informe imprimible
          </button>
        </div>
        {aviso && <p role="status" className="mt-3 text-sm text-[var(--color-text-secondary)]">{aviso}</p>}
        {xlsxError && <p role="alert" className="mt-3 text-sm text-red-600">{xlsxError}</p>}
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Archivo base: {nombreBloque(municipio, codigoINE, bloque)}_*.csv · Excel estilizado (.xlsx corporativo) no disponible en
          esta versión — documentado en la auditoría; CSV + informe imprimible con identidad corporativa.
        </p>
      </div>

      {/* Índice de tablas */}
      <div className="mt-6 grid grid-cols-1 gap-4">
        {tablas.map((t) => (
          <article key={t.id} className={`premium-card p-5${t.columnas.length <= 2 ? " socideas-narrow-card" : ""}`} aria-label={`Tabla ${t.titulo}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[var(--color-text-primary)]">{t.titulo}</h2>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {t.filas.length} fila{t.filas.length === 1 ? "" : "s"} · Fuente: {t.fuente} · Periodo: {t.periodo} · {t.cobertura} · {t.estado}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`#tabla-${t.id}`}
                  className="socideas-btn"
                >
                  Ver tabla
                </a>
                <button
                  type="button"
                  onClick={() => csvTabla(t)}
                  className="socideas-btn socideas-btn--primary"
                >
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
          <div className="ideas-status" data-state="pending" role="status">
            <div className="ideas-status__head">
              <p className="ideas-status__title">Sin tablas exportables en este bloque</p>
              <span className="ideas-status__badge">Sin datos</span>
            </div>
            <div className="ideas-status__body"><p>Este municipio aún no tiene indicadores con valor real en este bloque. Nada se rellena con ceros.</p></div>
          </div>
        )}
      </div>

      {/* Informe imprimible (pantalla + print) */}
      <div className="print-report mt-8" aria-label="Informe imprimible">
        <style>{`@media print {
          body * { visibility: hidden; }
          .print-report, .print-report * { visibility: visible; }
          .print-report { position: absolute; inset: 0; padding: 24px; }
          .print-report table { width: 100%; border-collapse: collapse; }
          .print-report th { background: #1e4d3f !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-report th, .print-report td { border: 1px solid #cbd5d1; padding: 6px 8px; font-size: 11px; }
          .print-report tbody tr:nth-child(even) { background: #eef4f1 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }`}</style>
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border-subtle)]">
          <div className="bg-[#1e4d3f] px-6 py-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Ideas Sostenibilidad · SOCideas</p>
            <h2 className="mt-1 text-xl font-bold">Tablas de {bloque === "Demografia" ? "Demografía" : "Economía"} — {municipio} ({codigoINE})</h2>
            <p className="mt-1 text-xs text-white/80">Generado el {fecha} · Tablas generadas a partir de los indicadores disponibles en la ficha municipal, con fuente y periodo de referencia.</p>
          </div>
          <div className="bg-[var(--color-card-bg)] px-6 py-5">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">00_Resumen_y_trazabilidad</h3>
            <ul className="mt-2 space-y-1 text-xs text-[var(--color-text-secondary)]">
              {traceabilityRows({ municipio, codigoINE, bloque: bloque === "Demografia" ? "Demografía" : "Economía", fechaGeneracion: fecha, tablas, excluidas }).map((r, i) => (
                <li key={i}>{r.join(" · ")}</li>
              ))}
            </ul>
            {tablas.map((t) => (
              <div key={t.id} className="mt-5">
                <h4 className="text-sm font-bold text-[var(--color-text-primary)]">{t.titulo}</h4>
                <p className="text-[11px] text-[var(--color-text-muted)]">Fuente: {t.fuente} · Periodo: {t.periodo} · {t.estado}</p>
                <table className="ideas-table mt-2">
                  <thead><tr>{t.columnas.map((c) => (<th key={c}>{c}</th>))}</tr></thead>
                  <tbody>
                    {t.filas.map((f, i) => (
                      <tr key={i}>{f.map((c, j) => (<td key={j}>{c.text}</td>))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
