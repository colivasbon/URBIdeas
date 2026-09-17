"use client";

/**
 * Aviso de datos temporales/provisionales. Solo se renderiza cuando el municipio
 * tiene un temporal válido (fuente, período y fecha de extracción). Nunca
 * sustituye al consolidado: ambos se muestran lado a lado y etiquetados.
 * Sin placeholder ni hueco cuando no hay datos.
 */
import { useState } from "react";
import DataStatusBadge from "./DataStatusBadge";
import type { TemporaryMunicipalData } from "@/lib/socideas-temporary-data";

export interface ConsolidadoComparable {
  label: string;
  source: string;
  period: string;
  value: string;
}

function fmtPrimitive(value: unknown): string {
  if (value === null || value === undefined) return "ND";
  if (typeof value === "number") return value.toLocaleString("es-ES");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

export default function TemporaryDataNotice({
  data,
  consolidated,
}: {
  data: TemporaryMunicipalData;
  consolidated?: ConsolidadoComparable | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const entries = Object.entries(data.values).filter(([, v]) => v !== undefined);

  return (
    <section
      aria-label="Actualización temporal"
      className="mb-6 rounded-[6px] border border-[color-mix(in_srgb,var(--color-secondary)_45%,transparent)] bg-[var(--color-input-bg)] p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <DataStatusBadge estado="provisional" />
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">{data.label}</span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Actualización temporal disponible · Fuente: {data.source} · {data.period}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="mt-2 text-xs font-semibold text-[var(--color-secondary)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
      >
        {abierto ? "Ocultar actualización temporal" : "Ver actualización temporal"}
      </button>
      {abierto && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[18rem] text-xs">
            <caption className="sr-only">
              Comparativa entre dato consolidado y dato provisional de {data.period}
            </caption>
            <thead>
              <tr className="text-left text-[var(--color-text-muted)]">
                <th scope="col" className="py-1 pr-3 font-semibold">Indicador</th>
                <th scope="col" className="py-1 pr-3 text-right font-semibold">Dato provisional</th>
                {consolidated && <th scope="col" className="py-1 text-right font-semibold">Dato consolidado</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, value]) => (
                <tr key={key} className="border-t border-[var(--color-border-subtle)]">
                  <td className="py-1 pr-3">{key}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{fmtPrimitive(value)}</td>
                  {consolidated && (
                    <td className="py-1 text-right tabular-nums">{consolidated.value}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
            Provisional: {data.source} · {data.period}
            {consolidated ? ` · Consolidado: ${consolidated.source} · ${consolidated.period}` : " · Sin dato consolidado comparable"}
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            El dato provisional no sustituye al consolidado y no se suma con él.
          </p>
        </div>
      )}
    </section>
  );
}
