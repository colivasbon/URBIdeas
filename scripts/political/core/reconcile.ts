// Conciliación municipal: suma de secciones frente a los totales municipales
// oficiales (Interior: ficheros 05/06 del MISMO paquete). Nunca se reescriben
// secciones para cuadrar; la diferencia se documenta y se clasifica.
//
// Estados (orden de decisión):
//   not_checked                        sin referencia.
//   exact_match                        todas las diferencias = 0.
//   candidacy_mapping_error            una candidatura está en un lado y no en el otro.
//   incomplete_coverage                faltan mesas respecto al nº oficial de mesas.
//   confirmed_CERA_difference          secciones + mesas CERA DEL MUNICIPIO = referencia
//                                      (requiere mesas CERA atribuidas al municipio en el fichero).
//   expected_special_tables_difference igual, con otras mesas especiales del municipio.
//   source_scope_difference            la referencia declara un ámbito distinto (lo indica el llamador).
//   unresolved                         cualquier otra diferencia.

import type { MunicipalTotals, ReconciliationReport, ReconciliationStatus } from '../../../src/lib/socideas-secciones-political'

const SCALAR_FIELDS = ['census', 'voters', 'validVotes', 'blankVotes', 'nullVotes', 'candidacyVotes'] as const

export function diffTotals(a: MunicipalTotals, b: MunicipalTotals): Record<string, number> {
  const d: Record<string, number> = {}
  for (const f of SCALAR_FIELDS) {
    const va = a[f]
    const vb = b[f]
    if (va === null || vb === null) continue
    if (va !== vb) d[f] = va - vb
  }
  const ids = new Set([...Object.keys(a.votes), ...Object.keys(b.votes)])
  for (const id of [...ids].sort()) {
    const va = a.votes[id]
    const vb = b.votes[id]
    if (va === undefined || vb === undefined) continue
    if (va !== vb) d[`votes.${id}`] = va - vb
  }
  return d
}

export function addTotals(a: MunicipalTotals, b: MunicipalTotals): MunicipalTotals {
  const add = (x: number | null, y: number | null) => (x === null || y === null ? null : x + y)
  const votes: Record<string, number> = { ...a.votes }
  for (const [k, v] of Object.entries(b.votes)) votes[k] = (votes[k] ?? 0) + v
  return {
    census: add(a.census, b.census),
    voters: add(a.voters, b.voters),
    validVotes: add(a.validVotes, b.validVotes),
    blankVotes: add(a.blankVotes, b.blankVotes),
    nullVotes: add(a.nullVotes, b.nullVotes),
    candidacyVotes: add(a.candidacyVotes, b.candidacyVotes),
    votes,
  }
}

export interface ReconcileArgs {
  sectionTotals: MunicipalTotals
  reference: MunicipalTotals | null
  referenceLabel: string | null
  /** Nº de mesas territoriales agregadas. */
  resultPollingStations: number
  /** Nº oficial de mesas del municipio en la referencia, si lo publica. */
  referencePollingStations?: number | null
  /** Mesas especiales atribuidas por la fuente A ESTE municipio (evidencia). */
  municipalSpecial?: { kind: 'CERA' | 'special_table'; pollingStations: number; totals: MunicipalTotals } | null
  /** Mesas especiales que la fuente publica en un ámbito superior (p. ej. CERA provincial). */
  supraMunicipalSpecial?: { kind: 'CERA' | 'special_table'; pollingStations: number } | null
  /** La referencia declara otro ámbito (el llamador lo sabe; p. ej. incluye CERA). */
  referenceScopeDiffers?: string | null
}

export function reconcileMunicipality(args: ReconcileArgs): ReconciliationReport {
  const notes: string[] = []
  const specialTables: ReconciliationReport['specialTables'] = args.municipalSpecial
    ? { kind: args.municipalSpecial.kind, scope: 'municipality', pollingStations: args.municipalSpecial.pollingStations, totals: args.municipalSpecial.totals }
    : args.supraMunicipalSpecial
      ? { kind: args.supraMunicipalSpecial.kind, scope: 'province', pollingStations: args.supraMunicipalSpecial.pollingStations, totals: null }
      : { kind: 'CERA', scope: 'none', pollingStations: 0, totals: null }
  if (args.supraMunicipalSpecial && args.supraMunicipalSpecial.pollingStations > 0) {
    notes.push(
      `${args.supraMunicipalSpecial.pollingStations} mesas ${args.supraMunicipalSpecial.kind} publicadas por la fuente a nivel provincial/distrito electoral (municipio 999): fuera de la capa seccional y de este municipio.`,
    )
  }
  if (!args.reference) {
    return {
      status: 'not_checked',
      reference: null,
      sectionTotals: args.sectionTotals,
      referenceTotals: null,
      differences: {},
      notes: [...notes, 'Sin totales municipales de referencia.'],
      specialTables,
    }
  }
  const differences = diffTotals(args.sectionTotals, args.reference)
  // Una referencia que no publica desglose por candidatura NO es un error de
  // mapeo: es una fuente con menos detalle. Comparar el conjunto de ids en ese
  // caso daría `candidacy_mapping_error` en todos los municipios y descartaría
  // una fuente perfectamente válida. El requisito sigue siendo el mismo: los
  // agregados que la referencia SÍ publica (censo, votantes, válidos, blancos,
  // nulos y votos a candidaturas) tienen que cuadrar exactamente.
  const referenceSinDetalle = Object.keys(args.reference.votes).length === 0
  const onlySections = referenceSinDetalle ? [] : Object.keys(args.sectionTotals.votes).filter((k) => !(k in args.reference!.votes))
  const onlyReference = referenceSinDetalle ? [] : Object.keys(args.reference.votes).filter((k) => !(k in args.sectionTotals.votes))
  let status: ReconciliationStatus
  if (Object.keys(differences).length === 0 && onlySections.length === 0 && onlyReference.length === 0) {
    if (referenceSinDetalle) {
      status = 'source_scope_difference'
      notes.push('La fuente publica totales municipales sin desglose por candidatura: se contrastan censo, votantes, válidos, blancos, nulos y votos a candidaturas, que cuadran exactamente.')
    } else {
      status = 'exact_match'
      notes.push('Suma de secciones = totales municipales oficiales en censo, votantes, válidos, blancos, nulos y cada candidatura.')
    }
  } else if (onlySections.length || onlyReference.length) {
    status = 'candidacy_mapping_error'
    if (onlySections.length) notes.push(`Candidaturas sólo en secciones: ${onlySections.join(', ')}.`)
    if (onlyReference.length) notes.push(`Candidaturas sólo en la referencia: ${onlyReference.join(', ')}.`)
  } else if (
    args.referencePollingStations !== null &&
    args.referencePollingStations !== undefined &&
    args.resultPollingStations < args.referencePollingStations
  ) {
    status = 'incomplete_coverage'
    notes.push(`Mesas agregadas ${args.resultPollingStations} < mesas oficiales ${args.referencePollingStations}.`)
  } else if (
    args.municipalSpecial &&
    args.municipalSpecial.pollingStations > 0 &&
    Object.keys(diffTotals(addTotals(args.sectionTotals, args.municipalSpecial.totals), args.reference)).length === 0
  ) {
    status = args.municipalSpecial.kind === 'CERA' ? 'confirmed_CERA_difference' : 'expected_special_tables_difference'
    notes.push(`La diferencia coincide exactamente con ${args.municipalSpecial.pollingStations} mesas ${args.municipalSpecial.kind} del municipio presentes en el fichero.`)
  } else if (args.referenceScopeDiffers) {
    status = 'source_scope_difference'
    notes.push(args.referenceScopeDiffers)
  } else {
    status = 'unresolved'
    notes.push(
      'Diferencia no explicada por la fuente entre las mesas (ficheros 09/10) y los totales municipales (05/06). No se corrigen secciones.',
    )
    if (isCensusOnlyDifference(differences)) {
      notes.push(
        `Sólo difiere el censo (${differences.census > 0 ? '+' : ''}${differences.census}); votantes, válidos, blancos, nulos y cada candidatura son idénticos.`,
      )
    }
  }
  if (
    args.referencePollingStations !== null &&
    args.referencePollingStations !== undefined &&
    args.resultPollingStations !== args.referencePollingStations &&
    status !== 'incomplete_coverage'
  ) {
    notes.push(`Mesas agregadas ${args.resultPollingStations}; mesas oficiales ${args.referencePollingStations}.`)
  }
  return {
    status,
    reference: args.referenceLabel,
    sectionTotals: args.sectionTotals,
    referenceTotals: args.reference,
    differences,
    notes,
    specialTables,
  }
}

/** Estados de conciliación que bloquean la publicación del municipio. */
export const BLOCKING_RECONCILIATION: ReadonlySet<ReconciliationStatus> = new Set([
  'unresolved',
  'candidacy_mapping_error',
  'incomplete_coverage',
])

/** true si la única diferencia es el censo (los votos cuadran exactamente). */
export function isCensusOnlyDifference(differences: Record<string, number>): boolean {
  const k = Object.keys(differences)
  return k.length === 1 && k[0] === 'census'
}
