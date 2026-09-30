"use client";

// Selector de convocatoria electoral de la pestaña Política.
//
// La lista viene del CATÁLOGO (R2), no de una constante del código: ninguna
// convocatoria está fijada en la interfaz. TIPO DE ELECCIÓN y CONVOCATORIA son
// dos selectores encadenados, y la lista de candidaturas es la del municipio y
// la convocatoria, tal como la publica la fuente.

import { ELECTION_TYPE_LABEL, type ElectionType } from "@/lib/socideas-secciones-political";
import type { Candidacy } from "@/lib/socideas-secciones-political";

export interface ConvocatoriaCatalogo {
  electionId: string;
  electionType: ElectionType;
  electionDate: string;
  label: string;
  territoryCode: string | null;
  municipalities: number;
  publishableMunicipalities: number;
  sections: number;
  pollingStations: number;
}

export interface EstadoPolitico {
  status: string;
  electionId: string;
  electionType: ElectionType;
  electionDate: string;
  mesas_agregadas: number;
  candidatura: Candidacy | null;
  ganadoras: Record<string, unknown>;
}

const SELECT =
  "min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]";
const ETIQUETA = "type-label mb-1.5 block text-[var(--text-secondary)]";
const AYUDA = "mt-1 text-xs leading-relaxed text-[var(--text-muted)]";

/** Texto legible de cada estado. Nunca se colapsan en «sin indicadores». */
export const ETIQUETA_ESTADO: Record<string, string> = {
  available: "Disponible",
  partial_coverage: "Cobertura parcial",
  source_not_ingested: "Convocatoria no ingerida",
  no_polling_station_breakdown: "La fuente no desglosa por mesa",
  geometry_unresolved: "Geometría sin correspondencia",
  reconciliation_unresolved: "Conciliación sin resolver",
  object_missing: "Objeto no disponible en R2",
  validation_error: "Error de validación en la fuente",
};

const EXPLICACION_ESTADO: Record<string, string> = {
  available: "Todas las secciones con resultado tienen polígono en la geometría de referencia.",
  partial_coverage:
    "El municipio tiene resultados, pero no todas las secciones de resultado se cruzan con la geometría del año de la elección.",
  source_not_ingested:
    "La convocatoria todavía no se ha cargado en SOCideas. No es una afirmación sobre la fuente oficial.",
  no_polling_station_breakdown:
    "La fuente publica totales municipales, no resultados por mesa. Sin desglose por mesa no hay sección, y no se reparte nada.",
  geometry_unresolved:
    "Hay resultados por sección, pero la correspondencia con el seccionado del INE no es unívoca. No se reasignan resultados ni se reparten por superficie o población.",
  reconciliation_unresolved:
    "La suma de las mesas no cuadra con los totales municipales oficiales de la misma fuente. Se publica el aviso; no se corrigen las secciones.",
  object_missing: "La convocatoria existe en el catálogo pero el objeto de este municipio no está en R2.",
  validation_error: "La validación de la fuente ha fallado; revise el aviso antes de usar el dato.",
};

export default function SeccionesPoliticaSelector({
  electionId,
  onConvocatoria,
  catalog,
  estado,
  disableCandidaturas = false,
}: {
  electionId: string;
  onConvocatoria: (electionId: string) => void;
  catalog: ReadonlyArray<ConvocatoriaCatalogo>;
  estado: EstadoPolitico | null;
  disableCandidaturas?: boolean;
}) {
  const lista = [...catalog].sort((a, b) => (a.electionDate < b.electionDate ? 1 : a.electionDate > b.electionDate ? -1 : 0));
  const porTipo = new Map<ElectionType, ConvocatoriaCatalogo[]>();
  for (const e of lista) {
    const l = porTipo.get(e.electionType) ?? [];
    l.push(e);
    porTipo.set(e.electionType, l);
  }
  const actual = lista.find((e) => e.electionId === electionId) ?? lista[0] ?? null;
  const tipoActual = (actual?.electionType ?? 'municipal') as ElectionType;
  const delTipo = porTipo.get(tipoActual) ?? [];

  const cambiarTipo = (tipo: ElectionType) => {
    const primera = (porTipo.get(tipo) ?? [])[0];
    if (primera) onConvocatoria(primera.electionId);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="atlas-pol-tipo" className={ETIQUETA}>
          Tipo de elección
        </label>
        <select
          id="atlas-pol-tipo"
          className={SELECT}
          value={tipoActual}
          disabled={disableCandidaturas || porTipo.size === 0}
          onChange={(e) => cambiarTipo(e.target.value as ElectionType)}
        >
          {[...porTipo.keys()].map((t) => (
            <option key={t} value={t}>
              {ELECTION_TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
        {porTipo.size === 0 ? (
          <p className={AYUDA}>No hay convocatorias de este tipo cargadas en SOCideas.</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="atlas-pol-conv" className={ETIQUETA}>
          Convocatoria
        </label>
        <select
          id="atlas-pol-conv"
          className={SELECT}
          value={actual?.electionId ?? ''}
          disabled={disableCandidaturas || delTipo.length === 0}
          onChange={(e) => onConvocatoria(e.target.value)}
        >
          {delTipo.map((e) => (
            <option key={e.electionId} value={e.electionId}>
              {ELECTION_TYPE_LABEL[e.electionType] ?? e.electionType} {e.electionDate} · {e.municipalities.toLocaleString('es-ES')} municipios
            </option>
          ))}
        </select>
        {actual ? (
          <p className={AYUDA}>
            {actual.sections.toLocaleString('es-ES')} secciones ·{' '}
            {actual.pollingStations.toLocaleString('es-ES')} mesas ·{' '}
            {actual.publishableMunicipalities.toLocaleString('es-ES')} de{' '}
            {actual.municipalities.toLocaleString('es-ES')} municipios con objeto publicable
            {actual.territoryCode ? ` · ámbito ${actual.territoryCode}` : ''}
          </p>
        ) : null}
      </div>

      {estado ? (
        <div className="rounded-[6px] bg-[var(--bg-surface-sunken)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Estado: {ETIQUETA_ESTADO[estado.status] ?? estado.status}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            {EXPLICACION_ESTADO[estado.status] ?? 'Estado declarado por la carga.'}
          </p>
          {estado.mesas_agregadas > 0 ? (
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              {estado.mesas_agregadas.toLocaleString('es-ES')} mesas agregadas a sección en este municipio.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
