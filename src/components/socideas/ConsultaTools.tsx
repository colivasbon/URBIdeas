"use client";

import { useId, useMemo, useState } from "react";
import { isPublicSourceUrl } from "@/lib/socideas-availability";

/**
 * Herramientas de consulta SOCideas: solo operan sobre datos ya cargados.
 * Sin fetches, sin R2, sin estimaciones. Cada herramienta se oculta si no hay
 * cobertura o comparabilidad (años explícitos, "No comparable" cuando toca).
 */

export function HerramientasConsulta({
  children,
  descripcion = "Filtros y comparativas sobre la información ya cargada en esta ficha, sin nuevas consultas.",
}: {
  children: React.ReactNode;
  descripcion?: string;
}) {
  return (
    <section aria-label="Herramientas de consulta" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Herramientas de consulta</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">{descripcion}</p>
      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">{children}</div>
    </section>
  );
}

export function ComparadorPeriodos({
  serie,
  unidad,
  titulo = "Comparador de periodos",
}: {
  serie: { anio: number; valor: number }[];
  unidad?: string;
  titulo?: string;
}) {
  const puntos = useMemo(
    () => [...serie].filter((p) => Number.isFinite(p.valor)).sort((a, b) => a.anio - b.anio),
    [serie],
  );
  if (puntos.length < 2) return null;
  const ultimoP = puntos[puntos.length - 1];
  const anteriorP = puntos[puntos.length - 2];
  const diff = ultimoP.valor - anteriorP.valor;
  const pct = anteriorP.valor === 0 ? null : Math.round((diff / Math.abs(anteriorP.valor)) * 1000) / 10;
  const fmtN = (n: number) => n.toLocaleString("es-ES");
  return (
    <div className="border-t border-[var(--border-strong)] pt-3">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{titulo}</p>
      <p className="mt-2 text-sm text-[var(--text-primary)]">
        <strong className="tabular-nums">
          {fmtN(ultimoP.valor)}
          {unidad ? ` ${unidad}` : ""}
        </strong>{" "}
        <span className="text-[var(--text-muted)]">({ultimoP.anio})</span>
        {" frente a "}
        <strong className="tabular-nums">
          {fmtN(anteriorP.valor)}
          {unidad ? ` ${unidad}` : ""}
        </strong>{" "}
        <span className="text-[var(--text-muted)]">({anteriorP.anio})</span>
      </p>
      <p className="mt-1.5 text-sm tabular-nums text-[var(--text-secondary)]" role="status">
        Variación: {diff > 0 ? "+" : ""}
        {fmtN(Math.round(diff * 10) / 10)}
        {unidad ? ` ${unidad}` : ""} ({pct === null ? "no comparable: base nula o cero" : `${pct > 0 ? "+" : ""}${fmtN(pct)} %`})
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Periodos exactos {anteriorP.anio} y {ultimoP.anio}, misma fuente y serie.
      </p>
    </div>
  );
}

export function Metodologia({
  nombre,
  definicion,
  fuente,
  periodo,
  cobertura,
  estado,
  limitacion,
}: {
  nombre: string;
  definicion: string;
  fuente: string;
  periodo: string;
  cobertura: string;
  estado: string;
  limitacion?: string;
}) {
  return (
    <details className="border-t border-[var(--border-strong)] pt-3">
      <summary className="cursor-pointer text-sm font-medium text-[var(--text-link)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]">
        Definición y fuente: {nombre}
      </summary>
      <dl className="mt-3 max-w-[70ch] space-y-1.5 text-sm text-[var(--text-secondary)]">
        <div className="flex gap-2"><dt className="shrink-0 font-medium text-[var(--text-primary)]">Indicador:</dt><dd>{nombre}</dd></div>
        <div className="flex gap-2"><dt className="shrink-0 font-medium text-[var(--text-primary)]">Definición:</dt><dd>{definicion}</dd></div>
        <div className="flex gap-2"><dt className="shrink-0 font-medium text-[var(--text-primary)]">Fuente:</dt><dd>{fuente}</dd></div>
        <div className="flex gap-2"><dt className="shrink-0 font-medium text-[var(--text-primary)]">Periodo:</dt><dd>{periodo}</dd></div>
        <div className="flex gap-2"><dt className="shrink-0 font-medium text-[var(--text-primary)]">Cobertura:</dt><dd>{cobertura}</dd></div>
        <div className="flex gap-2"><dt className="shrink-0 font-medium text-[var(--text-primary)]">Estado:</dt><dd>{estado}</dd></div>
        {limitacion && (
          <div className="flex gap-2"><dt className="shrink-0 font-medium text-[var(--text-primary)]">Limitación:</dt><dd>{limitacion}</dd></div>
        )}
      </dl>
    </details>
  );
}

export function FuenteOficial({ url, etiqueta = "Consultar fuente oficial", className }: { url: string | null | undefined; etiqueta?: string; className?: string }) {
  if (!isPublicSourceUrl(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={className ?? "inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] sm:min-h-0"}
    >
      {etiqueta}
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

/** Filtro local de tabla ya renderizada: busca texto, filtra por año y restablece. */
export function FiltroTabla({
  tableId,
  anios,
  placeholder = "Buscar dentro de la tabla…",
}: {
  tableId: string;
  anios?: number[];
  placeholder?: string;
}) {
  const inputId = useId();
  const [q, setQ] = useState("");
  const [anio, setAnio] = useState<number | null>(null);

  const aplicar = (texto: string, anioSel: number | null) => {
    const table = document.getElementById(tableId);
    if (!table) return;
    const needle = texto.trim().toLowerCase();
    for (const row of table.querySelectorAll("tbody tr")) {
      const cells = [...row.querySelectorAll("th, td")].map((c) => (c.textContent ?? "").toLowerCase());
      const matchTexto = needle === "" || cells.some((c) => c.includes(needle));
      const matchAnio = anioSel === null || cells.some((c) => c.trim() === String(anioSel));
      (row as HTMLTableRowElement).style.display = matchTexto && matchAnio ? "" : "none";
    }
  };

  const onQ = (v: string) => { setQ(v); aplicar(v, anio); };
  const onAnio = (v: string) => { const n = v === "" ? null : parseInt(v, 10); setAnio(n); aplicar(q, n); };
  const reset = () => { setQ(""); setAnio(null); aplicar("", null); };

  return (
    <div className="border-t border-[var(--border-strong)] pt-3">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Filtrar tabla</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-44 flex-1">
          <label htmlFor={`${inputId}-q`} className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Buscar</label>
          <input
            id={`${inputId}-q`}
            type="search"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={placeholder}
            className="input"
          />
        </div>
        {anios && anios.length > 1 && (
          <div>
            <label htmlFor={`${inputId}-anio`} className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Año</label>
            <select
              id={`${inputId}-anio`}
              value={anio ?? ""}
              onChange={(e) => onAnio(e.target.value)}
              className="input w-auto"
            >
              <option value="">Todos</option>
              {anios.map((a) => (<option key={a} value={a}>{a}</option>))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={reset}
          className="btn btn-ghost btn-sm"
        >
          Restablecer filtros
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">Filtros locales sobre datos ya cargados. No generan nuevas consultas.</p>
    </div>
  );
}
