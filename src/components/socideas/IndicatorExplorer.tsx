"use client";

import { useMemo, useState } from "react";
import StatCard from "./StatCard";
import EvolutionChart, { type SerieEvo } from "./EvolutionChart";
import DataTableShell from "./DataTableShell";
import DataTableMeta from "./DataTableMeta";
import DataTableToolbar from "./DataTableToolbar";
import TableWorkspace from "./TableWorkspace";
import {
  SCOPE_COLOR,
  validateExplorerQuery,
  type ExplorerState,
  type SocideasIndicatorCapability,
  type SocideasPoint,
  type SocideasUnit,
} from "@/lib/socideas-indicator-capabilities";

/**
 * Explorador unificado de indicadores (Demografía y Economía, reutilizable por
 * secciones censales). Los controles solo aparecen cuando la dimensión existe
 * con valores reales: sin selectores vacíos, sin checkboxes inertes, sin N/A.
 * Todo opera localmente sobre datos ya cargados (useMemo, cero fetch).
 */
export default function IndicatorExplorer({
  codigoINE,
  municipioNombre,
  capabilities,
  series,
  searchParams,
}: {
  codigoINE: string;
  municipioNombre: string;
  capabilities: SocideasIndicatorCapability[];
  series: Record<string, Record<string, SocideasPoint[]>>;
  searchParams?: Record<string, string>;
}) {
  const initial = useMemo<ExplorerState | null>(() => {
    if (capabilities.length === 0) return null;
    let q: Record<string, string> = {};
    if (searchParams) {
      q = searchParams;
    } else if (typeof window !== "undefined") {
      q = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    }
    return validateExplorerQuery(q, capabilities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<ExplorerState | null>(initial);
  const [hint, setHint] = useState<string | null>(null);

  const derived = useMemo(() => {
    if (!state) return null;
    const cap = capabilities.find((c) => c.id === state.indId) ?? capabilities[0];
    const capSeries = series[cap.id] ?? {};
    const inWindow = (p: SocideasPoint): boolean =>
      (state.desde === null || p.anio >= state.desde) && (state.hasta === null || p.anio <= state.hasta);
    const scopePoints: Record<string, SocideasPoint[]> = {};
    for (const s of cap.scopes) {
      scopePoints[s.id] = (capSeries[s.id] ?? []).filter(inWindow);
    }
    const activeScopes = cap.scopes.filter((s) => state.scopes.includes(s.id) && scopePoints[s.id].length > 0);
    const principal = activeScopes[0] ?? cap.scopes.find((s) => scopePoints[s.id].length > 0) ?? cap.scopes[0];
    const principalPts = scopePoints[principal?.id ?? ''] ?? [];
    const kpiPoint =
      cap.kind === 'series'
        ? principalPts.length > 0 ? principalPts[principalPts.length - 1] : null
        : principalPts.find((p) => p.anio === state.anio) ?? null;
    const years = [...new Set(activeScopes.flatMap((s) => scopePoints[s.id].map((p) => p.anio)))].sort((a, b) => a - b);
    const chartSeries: SerieEvo[] = activeScopes
      .filter((s) => scopePoints[s.id].length > 0)
      .map((s) => ({
        clave: s.id,
        etiqueta: s.id === 'municipio' ? `${municipioNombre} · ${s.label}` : s.label,
        color: SCOPE_COLOR[s.id] ?? 'var(--color-secondary)',
        puntos: scopePoints[s.id],
      }));
    const totalPoints = chartSeries.reduce((a, s) => a + s.puntos.length, 0);
    return { cap, scopePoints, activeScopes, principal, kpiPoint, years, chartSeries, totalPoints };
  }, [state, capabilities, series, municipioNombre]);

  if (!state || !derived) return null;
  const { cap, scopePoints, activeScopes, kpiPoint, years, chartSeries, totalPoints } = derived;
  const allPeriods = [...new Set(cap.scopes.flatMap((s) => s.periods))].sort((a, b) => a - b);
  const showChart = cap.supportsChart && totalPoints >= 2;
  const periodoLabel =
    cap.kind === 'series'
      ? years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : 'sin datos en el rango'
      : state.anio !== null ? String(state.anio) : '—';

  const patch = (p: Partial<ExplorerState>) => {
    setHint(null);
    setState((s) => (s ? { ...s, ...p } : s));
  };

  const changeIndicator = (id: string) => {
    const next = capabilities.find((c) => c.id === id) ?? capabilities[0];
    setHint(null);
    if (next.kind === 'series') {
      setState({ indId: next.id, desde: null, hasta: null, anio: null, scopes: [next.defaultScope] });
    } else {
      const ps = next.scopes[0]?.periods ?? [];
      setState({ indId: next.id, desde: null, hasta: null, anio: ps.length > 0 ? ps[ps.length - 1] : null, scopes: [next.defaultScope] });
    }
  };

  const toggleScope = (id: string, checked: boolean) => {
    setHint(null);
    setState((s) => {
      if (!s) return s;
      if (!checked && s.scopes.length <= 1) {
        setHint('Al menos una serie debe permanecer activa.');
        return s;
      }
      const next = checked ? [...s.scopes, id] : s.scopes.filter((x) => x !== id);
      if (next.length === 0) {
        setHint('Al menos una serie debe permanecer activa.');
        return s;
      }
      return { ...s, scopes: next };
    });
  };

  const reset = () => {
    setHint(null);
    if (cap.kind === 'series') {
      setState({ indId: cap.id, desde: null, hasta: null, anio: null, scopes: [cap.defaultScope] });
    } else {
      const ps = cap.scopes[0]?.periods ?? [];
      setState({ indId: cap.id, desde: null, hasta: null, anio: ps.length > 0 ? ps[ps.length - 1] : null, scopes: [cap.defaultScope] });
    }
  };

  const tableId = `exp-tabla-${codigoINE}-${cap.id}`;
  const muniPeriods = cap.scopes.find((s) => s.id === cap.defaultScope)?.periods ?? [];

  return (
    <section aria-label="Explorar datos" className="ideas-section">
      <h2 className="ideas-h2">Explorar datos</h2>
      <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">
        Seleccione un indicador real: la tabla, el resumen y el gráfico se actualizan con los
        mismos filtros. Solo aparecen controles con valores publicados.
      </p>

      <div className="premium-card mt-4 grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {capabilities.length > 1 && (
          <div>
            <label htmlFor={`exp-ind-${codigoINE}`} className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Indicador</label>
            <select
              id={`exp-ind-${codigoINE}`}
              value={cap.id}
              onChange={(e) => changeIndicator(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
            >
              {capabilities.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        )}
        {cap.kind === 'series' ? (
          <>
            <div>
              <label htmlFor={`exp-desde-${codigoINE}`} className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Desde</label>
              <select
                id={`exp-desde-${codigoINE}`}
                value={state.desde ?? ''}
                onChange={(e) => patch({ desde: e.target.value ? parseInt(e.target.value, 10) : null })}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
              >
                <option value="">Inicio</option>
                {allPeriods.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor={`exp-hasta-${codigoINE}`} className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Hasta</label>
              <select
                id={`exp-hasta-${codigoINE}`}
                value={state.hasta ?? ''}
                onChange={(e) => patch({ hasta: e.target.value ? parseInt(e.target.value, 10) : null })}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
              >
                <option value="">Fin</option>
                {allPeriods.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
          </>
        ) : muniPeriods.length > 1 ? (
          <div>
            <label htmlFor={`exp-anio-${codigoINE}`} className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Año</label>
            <select
              id={`exp-anio-${codigoINE}`}
              value={state.anio ?? ''}
              onChange={(e) => patch({ anio: e.target.value ? parseInt(e.target.value, 10) : null })}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
            >
              {muniPeriods.map((a) => (<option key={a} value={a}>{a}</option>))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)] self-end pb-2" role="status">
            Dato de corte{state.anio !== null ? `: ${state.anio}` : ''} (sin serie publicada: no hay gráfico).
          </p>
        )}
        {cap.scopes.length > 1 && (
          <fieldset>
            <legend className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Series visibles</legend>
            <div className="flex flex-col gap-1.5">
              {cap.scopes.map((s) => {
                const n = scopePoints[s.id].length;
                const checked = state.scopes.includes(s.id);
                return (
                  <label key={s.id} className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={n === 0}
                      onChange={(e) => toggleScope(s.id, e.target.checked)}
                      className="h-4 w-4 accent-[var(--color-secondary)]"
                    />
                    {s.label}
                    <span className="text-xs text-[var(--color-text-muted)]">
                      ({s.periods.length > 0 ? `${s.periods[0]}–${s.periods[s.periods.length - 1]}` : 'sin datos'}{n === 0 ? ': sin datos en el rango' : ''})
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
      {hint && (
        <p role="status" className="mt-2 text-xs text-[var(--color-text-secondary)]">{hint}</p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          etiqueta={cap.label}
          valor={kpiPoint ? fmtCap(kpiPoint.valor, cap.unit) : 'ND'}
          detalle={`${cap.source} · ${kpiPoint ? kpiPoint.anio : periodoLabel}`}
        />
      </div>

      <div className="mt-4">
        <TableWorkspace
          layout="half"
          table={
            <DataTableShell
              title={`Tabla: ${cap.label}`}
              meta={{ fuente: cap.source, periodo: periodoLabel, cobertura: activeScopes.map((s) => s.label).join(' · ') || 'Sin series activas', estado: 'consolidado' }}
              toolbar={<DataTableToolbar tableId={tableId} sourceUrl={cap.sourceUrl} />}
              maxHeight={years.length > 11 ? '24rem' : undefined}
              footnote={
                years.length === 0
                  ? 'No hay datos publicados para esta combinación de filtros.'
                  : cap.comparisonNote
              }
            >
              <table id={tableId} className="socideas-table">
                <thead>
                  <tr>
                    <th scope="col" className="socideas-table__year">Año</th>
                    {activeScopes.map((s) => (
                      <th key={s.id} scope="col" className="socideas-table__numeric">{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {years.map((a) => (
                    <tr key={a}>
                      <td className="socideas-table__year">{a}</td>
                      {activeScopes.map((s) => {
                        const pt = scopePoints[s.id].find((p) => p.anio === a);
                        return (
                          <td key={s.id} className="socideas-table__numeric">
                            {pt ? fmtCap(pt.valor, cap.unit) : 'ND'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          }
          visual={
            showChart ? (
              <div>
                <h3 className="socideas-table-shell__title">Evolución: {cap.label}</h3>
                <div className="mt-2">
                  <DataTableMeta meta={{ fuente: cap.source, periodo: periodoLabel, unidad: unitLabel(cap.unit) }} />
                </div>
                <div className="mt-3">
                  <EvolutionChart series={chartSeries} id={`exp-${codigoINE}-${cap.id}`} />
                </div>
              </div>
            ) : undefined
          }
          visualLabel={`Gráfico de evolución de ${cap.label}`}
        />
        {!showChart && years.length > 0 && (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]" role="status">
            Sin gráfico: se necesitan al menos dos puntos comparables.
          </p>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
        >
          Restablecer filtros
        </button>
      </div>
    </section>
  );
}

function fmtCap(n: number, unit: SocideasUnit): string {
  if (unit === 'euros') return `${n.toLocaleString('es-ES')} €`;
  if (unit === 'porcentaje' || unit === 'ratio' || unit === 'indice') {
    return `${n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unit === 'porcentaje' ? ' %' : ''}`;
  }
  return n.toLocaleString('es-ES');
}

function unitLabel(unit: SocideasUnit): string {
  switch (unit) {
    case 'euros': return 'euros';
    case 'personas': return 'personas';
    case 'empresas': return 'empresas';
    case 'hectareas': return 'hectáreas';
    case 'porcentaje': return 'porcentaje';
    case 'ratio': return 'ratio';
    case 'indice': return 'índice';
  }
}
