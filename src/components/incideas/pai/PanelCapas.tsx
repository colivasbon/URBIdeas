"use client";

import { CAPAS_OFICIALES, FONDOS, SECCIONES_CAPAS } from "./mapa/capas";

export interface EstadoCapa {
  activa: boolean;
  opacidad: number;
}

interface Props {
  fondo: string;
  capas: Record<string, EstadoCapa>;
  onFondo: (id: string) => void;
  onToggle: (id: string) => void;
  onOpacidad: (id: string, v: number) => void;
  onLimpiar: () => void;
}

export default function PanelCapas({ fondo, capas, onFondo, onToggle, onOpacidad, onLimpiar }: Props) {
  const activas = Object.values(capas).filter((c) => c.activa).length;
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-[var(--text-primary)]">Mapa base</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {FONDOS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={fondo === f.id}
              onClick={() => onFondo(f.id)}
              className={`rounded-[6px] border p-3 text-left transition-colors ${
                fondo === f.id ? "border-[var(--moss-ink)] bg-[var(--surface-note)]" : "border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="block text-sm font-semibold text-[var(--text-primary)]">{f.nombre}</span>
              <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{f.descripcion}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Capas oficiales{activas ? ` (${activas} activas)` : ""}</h3>
        {activas > 0 && (
          <button type="button" className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline" onClick={onLimpiar}>
            Quitar todas
          </button>
        )}
      </div>

      {SECCIONES_CAPAS.map((seccion) => (
        <fieldset key={seccion} className="-mt-3">
          <legend className="type-label mb-2 text-[var(--text-muted)]">{seccion}</legend>
          <ul className="space-y-1">
            {CAPAS_OFICIALES.filter((c) => c.seccion === seccion).map((c) => {
              const e = capas[c.id];
              return (
                <li key={c.id} className="rounded-[6px] border border-[var(--border-subtle)] px-3 py-2">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--moss-ink)]" checked={e.activa} onChange={() => onToggle(c.id)} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--text-primary)]">{c.nombre}</span>
                      <span className="block text-xs text-[var(--text-secondary)]">{c.descripcion}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{c.fuente}</span>
                    </span>
                  </label>
                  {e.activa && (
                    <div className="mt-2 pl-6">
                      <label htmlFor={`op-${c.id}`} className="field-label">Opacidad {Math.round(e.opacidad * 100)} %</label>
                      <input
                        id={`op-${c.id}`}
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={e.opacidad}
                        onChange={(ev) => onOpacidad(c.id, Number(ev.target.value))}
                        className="w-full accent-[var(--moss-ink)]"
                      />
                      {c.leyenda && (
                        <details className="mt-1 text-xs text-[var(--text-secondary)]">
                          <summary className="cursor-pointer">Leyenda</summary>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.leyenda} alt={`Leyenda de ${c.nombre}`} loading="lazy" className="mt-1 max-w-full rounded-[6px] bg-white p-2" />
                        </details>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
