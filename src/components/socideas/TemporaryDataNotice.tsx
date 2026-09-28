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
      className="border-t border-[var(--border-subtle)] py-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <DataStatusBadge estado="provisional" />
        <span className="text-sm font-medium text-[var(--text-primary)]">{data.label}</span>
        <span className="text-[13px] text-[var(--text-muted)]">
          Actualización temporal disponible. Fuente: {data.source}, {data.period}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-[var(--text-link)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] sm:min-h-0"
      >
        {abierto ? "Ocultar actualización temporal" : "Ver actualización temporal"}
      </button>
      {abierto && (
        <div className="mt-3 overflow-x-auto">
          <table className="socideas-table min-w-[18rem]">
            <caption className="sr-only">
              Comparativa entre dato consolidado y dato provisional de {data.period}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="socideas-table__text">Indicador</th>
                <th scope="col" className="socideas-table__numeric">Dato provisional</th>
                {consolidated && <th scope="col" className="socideas-table__numeric">Dato consolidado</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, value]) => (
                <tr key={key}>
                  <td className="socideas-table__text">{key}</td>
                  <td className="socideas-table__numeric">{fmtPrimitive(value)}</td>
                  {consolidated && (
                    <td className="socideas-table__numeric">{consolidated.value}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Provisional: {data.source}, {data.period}.
            {consolidated ? ` Consolidado: ${consolidated.source}, ${consolidated.period}.` : " Sin dato consolidado comparable."}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            El dato provisional no sustituye al consolidado y no se suma con él.
          </p>
        </div>
      )}
    </section>
  );
}
