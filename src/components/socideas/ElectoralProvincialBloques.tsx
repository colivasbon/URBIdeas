// Bloques electorales de CIRCUNSCRIPCIÓN para la ficha web (SA1 · v2.3).
//
// Presentacional, servidor, sin datos propios. Reglas de oro, idénticas a las
// del libro XLSX:
//   - Un resultado de circunscripción NUNCA se presenta como dato del
//     municipio: cada bloque muestra la nota de cobertura textual y el
//     subtítulo dice «circunscripción de {provincia}».
//   - Congreso y Senado son cámaras DISTINTAS: tablas separadas, nunca
//     mezcladas ni sumadas entre sí ni con las Cortes autonómicas.
//   - Participación y votos son cifras PROVINCIALES, no nacionales.
//   - Ausencia de dato = ND, nunca 0.
//
// Sin dependencias nuevas, sin CSS nuevo, sin "use client".

import type {
  ElectoralProvincialBundle,
} from '@/lib/socideas-electoral-provincial-store'
import type {
  AutonomicasCircunscripcionPayload,
  SenadoCircunscripcionPayload,
} from '@/lib/socideas-electoral-provincial'
import type { CongresoProvinciaPayload } from '@/lib/socideas-book-blocks'
import { normalizarSiglasElectoral } from '@/lib/socideas-electoral-provincial'
import { FreshnessLine } from './SheetShell'

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? 'ND' : n.toLocaleString('es-ES')
}

function pct(num: number | null | undefined, den: number | null | undefined): string {
  if (num === null || num === undefined || den === null || den === undefined || den === 0) return 'ND'
  return `${((num / den) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
}

/** Nota de cobertura SIEMPRE visible, en bloque destacado. */
function NotaCobertura({ nota }: { nota: string }) {
  return (
    <div
      role="note"
      className="mt-3 rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs leading-relaxed text-[var(--color-text-secondary)]"
    >
      <strong className="text-[var(--color-text-primary)]">Cobertura: </strong>
      {nota}
    </div>
  )
}

function FuenteLine({ fuente, url }: { fuente: string; url?: string }) {
  return (
    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
      Fuente:{' '}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
        >
          {fuente}
        </a>
      ) : (
        fuente
      )}
    </p>
  )
}

function CifrasProvinciales({
  rows,
}: {
  rows: { label: string; valor: string }[]
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Participación y agregados de la circunscripción</caption>
        <thead>
          <tr className="text-left text-xs text-[var(--color-text-muted)]">
            <th scope="col" className="py-2 pr-4 font-medium">Concepto</th>
            <th scope="col" className="py-2 font-medium">Valor (circunscripción)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-[var(--color-border-subtle)]">
              <th scope="row" className="py-2 pr-4 font-normal text-left">{r.label}</th>
              <td className="py-2 tabular-nums">{r.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BLOQUE A — Autonómicas CLM
// ---------------------------------------------------------------------------
export function AutonomicasBloque({
  data,
  municipio,
  nota,
}: {
  data: AutonomicasCircunscripcionPayload
  municipio: string
  nota: string
}) {
  const candidaturas = [...data.candidaturas]
    .sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1))
    .slice(0, 12)
  return (
    <section aria-labelledby="bloque-autonomicas" className="mb-10">
      <h2 id="bloque-autonomicas" className="ideas-h2">
        Elecciones autonómicas {data.anio} · {data.camara}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Circunscripción de {data.circunscripcion} · {data.fecha} · ámbito provincial, no municipal
      </p>
      <NotaCobertura nota={nota} />
      <CifrasProvinciales
        rows={[
          { label: 'Censo electoral (circunscripción)', valor: fmt(data.censo) },
          { label: 'Votantes (circunscripción)', valor: fmt(data.votantes) },
          { label: 'Participación (votantes / censo, provincial)', valor: pct(data.votantes, data.censo) },
          { label: 'Votos válidos', valor: fmt(data.validos) },
          { label: 'Votos en blanco', valor: fmt(data.blancos) },
          { label: 'Votos nulos', valor: fmt(data.nulos) },
          { label: `Escaños de ${data.circunscripcion} en las Cortes (total)`, valor: fmt(data.escanosTotal) },
        ]}
      />
      {candidaturas.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Votos y escaños por candidatura en la circunscripción de {data.circunscripcion} ({data.anio})
            </caption>
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th scope="col" className="py-2 pr-4 font-medium">Candidatura</th>
                <th scope="col" className="py-2 pr-4 font-medium">Siglas normalizadas</th>
                <th scope="col" className="py-2 pr-4 font-medium">Votos</th>
                <th scope="col" className="py-2 pr-4 font-medium">% válidos</th>
                <th scope="col" className="py-2 font-medium">Escaños en las Cortes</th>
              </tr>
            </thead>
            <tbody>
              {candidaturas.map((c) => (
                <tr key={`${c.nombre}__${c.siglas}`} className="border-t border-[var(--color-border-subtle)]">
                  <td className="py-2 pr-4">{c.nombre}</td>
                  <td className="py-2 pr-4">{normalizarSiglasElectoral(c.siglas || c.nombre) || '—'}</td>
                  <td className="py-2 pr-4 tabular-nums">{fmt(c.votos)}</td>
                  <td className="py-2 pr-4 tabular-nums">{pct(c.votos, data.validos)}</td>
                  <td className="py-2 tabular-nums">{fmt(c.escanos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.candidaturas.length > candidaturas.length && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Se muestran {candidaturas.length} de {data.candidaturas.length} candidaturas; el listado
              completo está en el libro XLSX descargable.
            </p>
          )}
        </div>
      )}
      <FuenteLine fuente={data.fuenteLabel} url={data.fuenteUrl} />
      <FreshnessLine
        periodo={`${data.anio} (${data.fecha})`}
        fuente={data.fuenteLabel}
        nota="Cifras de la circunscripción, no del municipio."
      />
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Los escaños corresponden a la circunscripción de {data.circunscripcion} y nunca se suman con
        los del Congreso ni con los del Senado. {municipio} no dispone de desglose autonómico municipal.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// BLOQUE B — Congreso (cámara propia, tabla propia)
// ---------------------------------------------------------------------------
export function CongresoBloque({
  data,
  municipio,
  nota,
}: {
  data: CongresoProvinciaPayload
  municipio: string
  nota: string
}) {
  const candidaturas = [...data.candidaturas]
    .sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1))
    .slice(0, 10)
  return (
    <section aria-labelledby="bloque-congreso" className="mb-10">
      <h2 id="bloque-congreso" className="ideas-h2">
        Elecciones generales · Congreso {data.anio}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Circunscripción de {data.provincia} · {data.fecha} · ámbito provincial, no municipal
      </p>
      <NotaCobertura nota={nota} />
      <CifrasProvinciales
        rows={[
          { label: 'Censo electoral (circunscripción)', valor: fmt(data.censo) },
          { label: 'Votantes (circunscripción)', valor: fmt(data.votantes) },
          { label: 'Participación (votantes / censo, provincial)', valor: pct(data.votantes, data.censo) },
          { label: 'Votos válidos', valor: fmt(data.validos) },
          { label: 'Votos en blanco', valor: fmt(data.blancos) },
          { label: 'Votos nulos', valor: fmt(data.nulos) },
        ]}
      />
      {candidaturas.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Votos y diputados por candidatura en la circunscripción de {data.provincia} ({data.anio})
            </caption>
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th scope="col" className="py-2 pr-4 font-medium">Candidatura</th>
                <th scope="col" className="py-2 pr-4 font-medium">Siglas normalizadas</th>
                <th scope="col" className="py-2 pr-4 font-medium">Votos</th>
                <th scope="col" className="py-2 pr-4 font-medium">% válidos</th>
                <th scope="col" className="py-2 font-medium">Diputados</th>
              </tr>
            </thead>
            <tbody>
              {candidaturas.map((c) => (
                <tr key={`${c.nombre}__${c.siglas}`} className="border-t border-[var(--color-border-subtle)]">
                  <td className="py-2 pr-4">{c.nombre}</td>
                  <td className="py-2 pr-4">{normalizarSiglasElectoral(c.siglas || c.nombre) || '—'}</td>
                  <td className="py-2 pr-4 tabular-nums">{fmt(c.votos)}</td>
                  <td className="py-2 pr-4 tabular-nums">{pct(c.votos, data.validos)}</td>
                  <td className="py-2 tabular-nums">{fmt(c.escanos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <FuenteLine fuente={data.fuenteLabel} />
      <FreshnessLine
        periodo={`${data.anio} (${data.fecha})`}
        fuente={data.fuenteLabel}
        nota="Participación y votos son cifras de la circunscripción, no totales nacionales."
      />
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Cámara separada del Senado: los votos y escaños de una y otra nunca se suman entre sí.
        {municipio} no dispone de desglose a nivel municipal para esta elección.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// BLOQUE C — Senado (cámara propia, voto a candidatos, tabla separada)
// ---------------------------------------------------------------------------
export function SenadoBloque({
  data,
  municipio,
  nota,
}: {
  data: SenadoCircunscripcionPayload
  municipio: string
  nota: string
}) {
  const candidatos = [...data.candidatos]
    .sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1))
    .slice(0, 30)
  const elegidos = data.candidatos.filter((c) => c.elegido).length
  return (
    <section aria-labelledby="bloque-senado" className="mb-10">
      <h2 id="bloque-senado" className="ideas-h2">
        Elecciones generales · Senado {data.anio}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Circunscripción de {data.circunscripcion} · {data.fecha} · voto a candidatos · ámbito
        provincial, no municipal
      </p>
      <NotaCobertura nota={nota} />
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        <strong>Sistema de voto:</strong> cada elector marca hasta{' '}
        <strong>3 candidatos</strong> de la lista de su circunscripción y resultan elegidos los más
        votados. No es una lista cerrada: se vota a personas, no a candidaturas.
      </p>
      <CifrasProvinciales
        rows={[
          { label: 'Censo electoral (circunscripción)', valor: fmt(data.censo) },
          { label: 'Votos a candidaturas', valor: fmt(data.votosACandidaturas) },
          { label: 'Votos en blanco', valor: fmt(data.blancos) },
          { label: 'Votos nulos', valor: fmt(data.nulos) },
          { label: 'Senadores elegidos en la circunscripción', valor: fmt(elegidos) },
        ]}
      />
      {candidatos.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Candidatos al Senado por la circunscripción de {data.circunscripcion} ({data.anio}),
              con votos y condición de elegido
            </caption>
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th scope="col" className="py-2 pr-4 font-medium">Candidato</th>
                <th scope="col" className="py-2 pr-4 font-medium">Candidatura (siglas normalizadas)</th>
                <th scope="col" className="py-2 pr-4 font-medium">Votos</th>
                <th scope="col" className="py-2 font-medium">Elegido</th>
              </tr>
            </thead>
            <tbody>
              {candidatos.map((c, i) => (
                <tr
                  key={`${c.nombre}_${c.apellido1}_${c.partidoSiglas}_${i}`}
                  className="border-t border-[var(--color-border-subtle)]"
                >
                  <td className="py-2 pr-4">
                    {[c.nombre, c.apellido1, c.apellido2].filter(Boolean).join(' ')}
                  </td>
                  <td className="py-2 pr-4">
                    {c.partidoNombre
                      ? `${c.partidoNombre} (${normalizarSiglasElectoral(c.partidoSiglas)})`
                      : normalizarSiglasElectoral(c.partidoSiglas) || '—'}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{fmt(c.votos)}</td>
                  <td className="py-2">{c.elegido ? 'SÍ' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.candidatos.length > candidatos.length && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Se muestran {candidatos.length} de {data.candidatos.length} candidatos; el listado
              completo está en el libro XLSX descargable.
            </p>
          )}
        </div>
      )}
      <FuenteLine fuente={data.fuenteLabel} url={data.fuenteUrl} />
      <FreshnessLine
        periodo={`${data.anio} (${data.fecha})`}
        fuente={data.fuenteLabel}
        nota="Tabla separada del Congreso: cámaras distintas, nunca se suman."
      />
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Los votos y senadores corresponden a la circunscripción de {data.circunscripcion}.
        {municipio} no dispone de desglose a nivel municipal para esta elección.
      </p>
    </section>
  )
}

/**
 * Envoltorio: pinta los bloques provinciales que existan en el bundle.
 * Devuelve null si no hay ningún bloque (la ficha muestra entonces el estado
 * pendiente correspondiente).
 */
export function ElectoralProvincialBloques({
  bundle,
  municipio,
}: {
  bundle: ElectoralProvincialBundle | null
  municipio: string
}) {
  if (!bundle) return null
  const nota = bundle.notaCobertura
  const hayAlgo = bundle.autonomicas || bundle.congreso || bundle.senado
  if (!hayAlgo) return null
  return (
    <div>
      <p className="mb-4 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
        Resultados de la circunscripción de {bundle.circunscripcion} · no son datos de {municipio}
      </p>
      {bundle.autonomicas && (
        <AutonomicasBloque data={bundle.autonomicas} municipio={municipio} nota={nota} />
      )}
      {bundle.congreso && (
        <CongresoBloque data={bundle.congreso} municipio={municipio} nota={nota} />
      )}
      {bundle.senado && (
        <SenadoBloque data={bundle.senado} municipio={municipio} nota={nota} />
      )}
    </div>
  )
}
