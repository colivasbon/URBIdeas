// Agregación mesa → sección y cálculo de indicadores (núcleo común, puro).
//
// Clave: provincia(2) + municipio(3) + distrito(2) + sección(3) = CUSEC.
// Se SUMAN recuentos; los porcentajes se calculan DESPUÉS sobre las sumas con
// los denominadores del contrato (src/lib/socideas-secciones-political.ts).
// Nunca se promedian porcentajes. Un 0 es un dato y se conserva. Un recuento
// ausente (null) en cualquier mesa deja el total de la sección en null: ND
// nunca es 0. No se rellenan candidaturas ausentes de una mesa con ceros: sólo
// se suman los valores que publica la fuente (Interior publica los ceros).

import type { PollingStationRow } from '../adapter'
import {
  pct,
  type ElectionSectionResult,
  type MunicipalTotals,
} from '../../../src/lib/socideas-secciones-political'

export function sectionKeyOf(row: Pick<PollingStationRow, 'municipalityCode' | 'districtCode' | 'sectionCode'>): string {
  return `${row.municipalityCode}${row.districtCode}${row.sectionCode}`
}

/** Suma que propaga null (ND nunca es 0). */
function addNullable(acc: number | null | undefined, v: number | null): number | null {
  if (acc === null || v === null) return null
  return (acc ?? 0) + v
}

export function round4(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10000) / 10000
}

export interface Ranking {
  winnerId: string | null
  runnerUpId: string | null
  winnerPct: number | null
  runnerUpPct: number | null
  marginPoints: number | null
  top2ConcentrationPct: number | null
  tie: boolean
  notes: string[]
}

/** Ganador, segundo, margen y concentración sobre votos válidos.
 *  Orden: votos desc, id asc (determinista).
 *  Empate en primera posición (≥ 2 candidaturas con el máximo > 0): tie=true,
 *  winnerId y runnerUpId null (no hay ganador único), porcentajes calculados. */
export function rankCandidacies(votes: Record<string, number>, validVotes: number | null): Ranking {
  const entries = Object.entries(votes).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const notes: string[] = []
  const first = entries[0]
  if (!first || first[1] <= 0 || validVotes === null || validVotes === 0) {
    return {
      winnerId: null,
      runnerUpId: null,
      winnerPct: null,
      runnerUpPct: null,
      marginPoints: null,
      top2ConcentrationPct: null,
      tie: false,
      notes: first && first[1] <= 0 ? ['Sin votos a candidaturas: no hay ganador.'] : [],
    }
  }
  const second = entries[1] ?? null
  const winnerPct = pct(first[1], validVotes)
  const runnerUpPct = second ? pct(second[1], validVotes) : null
  const tie = second !== null && second[1] === first[1]
  if (tie) {
    const tied = entries.filter(([, v]) => v === first[1]).map(([k]) => k)
    notes.push(`Empate a ${first[1]} votos entre ${tied.join(', ')}.`)
  }
  if (!second) notes.push('Una sola candidatura: margen y concentración no aplicables.')
  return {
    winnerId: tie ? null : first[0],
    runnerUpId: tie ? null : second ? second[0] : null,
    winnerPct: round4(winnerPct),
    runnerUpPct: round4(runnerUpPct),
    marginPoints: second && winnerPct !== null && runnerUpPct !== null ? round4(winnerPct - runnerUpPct) : null,
    top2ConcentrationPct: second && winnerPct !== null && runnerUpPct !== null ? round4(winnerPct + runnerUpPct) : null,
    tie,
    notes,
  }
}

interface Acc {
  provinceCode: string
  municipalityCode: string
  districtCode: string
  sectionCode: string
  tables: string[]
  census: number | null | undefined
  voters: number | null | undefined
  abstentions: number | null | undefined
  validVotes: number | null | undefined
  blankVotes: number | null | undefined
  nullVotes: number | null | undefined
  candidacyVotes: number | null | undefined
  votes: Record<string, number>
  notes: string[]
}

/** Indicadores derivados de una suma de recuentos. */
export function deriveIndicators(t: {
  census: number | null
  voters: number | null
  abstentions: number | null
  validVotes: number | null
  blankVotes: number | null
  nullVotes: number | null
  votes: Record<string, number>
}): Pick<
  ElectionSectionResult,
  | 'participationPct'
  | 'abstentionPct'
  | 'blankPct'
  | 'nullPct'
  | 'winnerId'
  | 'runnerUpId'
  | 'winnerPct'
  | 'runnerUpPct'
  | 'marginPoints'
  | 'top2ConcentrationPct'
  | 'tie'
> & { notes: string[] } {
  const r = rankCandidacies(t.votes, t.validVotes)
  return {
    participationPct: round4(pct(t.voters, t.census)),
    abstentionPct: round4(pct(t.abstentions, t.census)),
    blankPct: round4(pct(t.blankVotes, t.validVotes)),
    nullPct: round4(pct(t.nullVotes, t.voters)),
    winnerId: r.winnerId,
    runnerUpId: r.runnerUpId,
    winnerPct: r.winnerPct,
    runnerUpPct: r.runnerUpPct,
    marginPoints: r.marginPoints,
    top2ConcentrationPct: r.top2ConcentrationPct,
    tie: r.tie,
    notes: r.notes,
  }
}

/** Agrega mesas (YA normalizadas y SIN mesas especiales) en secciones. */
export function aggregateSections(rows: PollingStationRow[], geometryKeys?: Set<string> | null): ElectionSectionResult[] {
  const by = new Map<string, Acc>()
  for (const r of rows) {
    if (r.special) throw new Error(`aggregateSections: mesa especial ${r.special} no admitida en la capa seccional`)
    const key = sectionKeyOf(r)
    let a = by.get(key)
    if (!a) {
      a = {
        provinceCode: r.provinceCode,
        municipalityCode: r.municipalityCode,
        districtCode: r.districtCode,
        sectionCode: r.sectionCode,
        tables: [],
        census: undefined,
        voters: undefined,
        abstentions: undefined,
        validVotes: undefined,
        blankVotes: undefined,
        nullVotes: undefined,
        candidacyVotes: undefined,
        votes: {},
        notes: [],
      }
      by.set(key, a)
    }
    a.tables.push(r.table)
    a.census = addNullable(a.census, r.census)
    a.voters = addNullable(a.voters, r.voters)
    a.abstentions = addNullable(a.abstentions, r.abstentions)
    a.validVotes = addNullable(a.validVotes, r.validVotes)
    a.blankVotes = addNullable(a.blankVotes, r.blankVotes)
    a.nullVotes = addNullable(a.nullVotes, r.nullVotes)
    a.candidacyVotes = addNullable(a.candidacyVotes, r.candidacyVotes)
    for (const [c, v] of Object.entries(r.votes)) a.votes[c] = (a.votes[c] ?? 0) + v
  }
  const out: ElectionSectionResult[] = []
  for (const [key, a] of [...by.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const census = a.census ?? null
    const voters = a.voters ?? null
    let abstentions = a.abstentions ?? null
    if (abstentions === null && census !== null && voters !== null) abstentions = census - voters
    const t = {
      census,
      voters,
      abstentions,
      validVotes: a.validVotes ?? null,
      blankVotes: a.blankVotes ?? null,
      nullVotes: a.nullVotes ?? null,
      votes: sortRecord(a.votes),
    }
    const d = deriveIndicators(t)
    const notes = [...a.notes, ...d.notes]
    if (voters !== null && census !== null && voters > census) {
      notes.push(`Votantes (${voters}) > censo (${census}): votos de interventores/apoderados en mesa.`)
    }
    const sum = Object.values(t.votes).reduce((s, v) => s + v, 0)
    const cand = a.candidacyVotes ?? null
    if (cand !== null && sum !== cand) notes.push(`Suma por candidatura (${sum}) ≠ votos a candidaturas (${cand}) según la fuente.`)
    const complete = census !== null && voters !== null && t.validVotes !== null
    out.push({
      sectionKey: key,
      provinceCode: a.provinceCode,
      municipalityCode: a.municipalityCode,
      districtCode: a.districtCode,
      sectionCode: a.sectionCode,
      pollingStations: [...a.tables].sort(),
      census,
      voters,
      abstentions,
      validVotes: t.validVotes,
      blankVotes: t.blankVotes,
      nullVotes: t.nullVotes,
      candidacyVotes: cand,
      votes: t.votes,
      participationPct: d.participationPct,
      abstentionPct: d.abstentionPct,
      blankPct: d.blankPct,
      nullPct: d.nullPct,
      winnerId: d.winnerId,
      runnerUpId: d.runnerUpId,
      winnerPct: d.winnerPct,
      runnerUpPct: d.runnerUpPct,
      marginPoints: d.marginPoints,
      top2ConcentrationPct: d.top2ConcentrationPct,
      tie: d.tie,
      status: complete ? 'observado' : 'no_difundido',
      geometryMatch: geometryKeys ? geometryKeys.has(key) : false,
      notes,
    })
  }
  return out
}

function sortRecord(r: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of Object.keys(r).sort()) out[k] = r[k] as number
  return out
}

/** Totales municipales = suma de las secciones (recuentos, no porcentajes). */
export function sumTotals(sections: Pick<ElectionSectionResult, 'census' | 'voters' | 'validVotes' | 'blankVotes' | 'nullVotes' | 'candidacyVotes' | 'votes'>[]): MunicipalTotals {
  let census: number | null | undefined
  let voters: number | null | undefined
  let validVotes: number | null | undefined
  let blankVotes: number | null | undefined
  let nullVotes: number | null | undefined
  let candidacyVotes: number | null | undefined
  const votes: Record<string, number> = {}
  for (const s of sections) {
    census = addNullable(census, s.census)
    voters = addNullable(voters, s.voters)
    validVotes = addNullable(validVotes, s.validVotes)
    blankVotes = addNullable(blankVotes, s.blankVotes)
    nullVotes = addNullable(nullVotes, s.nullVotes)
    candidacyVotes = addNullable(candidacyVotes, s.candidacyVotes)
    for (const [c, v] of Object.entries(s.votes)) votes[c] = (votes[c] ?? 0) + v
  }
  return {
    census: census ?? null,
    voters: voters ?? null,
    validVotes: validVotes ?? null,
    blankVotes: blankVotes ?? null,
    nullVotes: nullVotes ?? null,
    candidacyVotes: candidacyVotes ?? null,
    votes: sortRecord(votes),
  }
}
