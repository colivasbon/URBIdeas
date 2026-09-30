// Validación de filas de mesa YA normalizadas (núcleo común, puro).
//
// Errores (bloquean el municipio afectado; nunca se corrigen):
//   - códigos fuera de formato 2/5/2/3 o municipio que no empieza por la provincia;
//   - mesa duplicada (municipio + distrito + sección + mesa);
//   - votantes ≠ válidos + nulos; válidos ≠ candidaturas + blancos;
//   - suma por candidatura ≠ votos a candidaturas de la mesa;
//   - recuentos negativos o no enteros;
//   - municipio inexistente en la referencia de la propia fuente.
// Avisos: votantes > censo (interventores), candidatura presente en unas mesas
// del municipio y ausente en otras.

import type { PollingStationRow, RowValidationReport } from '../adapter'

export interface MunicipalityIssues {
  errors: string[]
  warnings: string[]
}

export interface DetailedValidation extends RowValidationReport {
  byMunicipality: Map<string, MunicipalityIssues>
}

const COUNT_FIELDS = ['census', 'voters', 'abstentions', 'validVotes', 'blankVotes', 'nullVotes', 'candidacyVotes'] as const

export function validatePollingRows(
  rows: PollingStationRow[],
  opts: { knownMunicipalities?: Set<string> | null; maxMessagesPerMunicipality?: number } = {},
): DetailedValidation {
  const by = new Map<string, MunicipalityIssues>()
  const max = opts.maxMessagesPerMunicipality ?? 25
  const issues = (m: string) => {
    let x = by.get(m)
    if (!x) by.set(m, (x = { errors: [], warnings: [] }))
    return x
  }
  const err = (m: string, msg: string) => {
    const x = issues(m)
    if (x.errors.length < max) x.errors.push(msg)
  }
  const warn = (m: string, msg: string) => {
    const x = issues(m)
    if (x.warnings.length < max) x.warnings.push(msg)
  }
  const seen = new Set<string>()
  const candByMun = new Map<string, { tables: number; perCand: Map<string, number> }>()
  for (const r of rows) {
    if (r.special) continue
    const m = r.municipalityCode
    const id = `${m}-${r.districtCode}-${r.sectionCode}-${r.table}`
    if (!/^\d{2}$/.test(r.provinceCode)) err(m, `${id}: provincia "${r.provinceCode}" no es de 2 dígitos`)
    if (!/^\d{5}$/.test(m) || !m.startsWith(r.provinceCode)) err(m, `${id}: municipio "${m}" no es prov(2)+mun(3)`)
    if (!/^\d{2}$/.test(r.districtCode)) err(m, `${id}: distrito "${r.districtCode}" no es de 2 dígitos`)
    if (!/^\d{3}$/.test(r.sectionCode)) err(m, `${id}: sección "${r.sectionCode}" no es de 3 dígitos`)
    if (!r.table || r.table.trim() === '') err(m, `${id}: mesa vacía`)
    if (seen.has(id)) err(m, `${id}: mesa duplicada`)
    seen.add(id)
    if (opts.knownMunicipalities && !opts.knownMunicipalities.has(m)) err(m, `${id}: municipio inexistente en la referencia municipal de la fuente`)
    for (const f of COUNT_FIELDS) {
      const v = r[f]
      if (v !== null && (!Number.isInteger(v) || v < 0)) err(m, `${id}: ${f}=${v} no es un recuento válido`)
    }
    for (const [c, v] of Object.entries(r.votes)) if (!Number.isInteger(v) || v < 0) err(m, `${id}: votos ${c}=${v} no válidos`)
    if (r.voters !== null && r.validVotes !== null && r.nullVotes !== null && r.voters !== r.validVotes + r.nullVotes) {
      err(m, `${id}: votantes ${r.voters} ≠ válidos ${r.validVotes} + nulos ${r.nullVotes}`)
    }
    if (r.validVotes !== null && r.candidacyVotes !== null && r.blankVotes !== null && r.validVotes !== r.candidacyVotes + r.blankVotes) {
      err(m, `${id}: válidos ${r.validVotes} ≠ candidaturas ${r.candidacyVotes} + blancos ${r.blankVotes}`)
    }
    if (r.candidacyVotes !== null) {
      const sum = Object.values(r.votes).reduce((s, v) => s + v, 0)
      if (sum !== r.candidacyVotes) err(m, `${id}: suma por candidatura ${sum} ≠ votos a candidaturas ${r.candidacyVotes}`)
    }
    if (r.census !== null && r.abstentions !== null && r.voters !== null && r.abstentions !== r.census - r.voters) {
      err(m, `${id}: abstención ${r.abstentions} ≠ censo ${r.census} − votantes ${r.voters}`)
    }
    if (r.census !== null && r.voters !== null && r.voters > r.census) warn(m, `${id}: votantes ${r.voters} > censo ${r.census}`)
    let cm = candByMun.get(m)
    if (!cm) candByMun.set(m, (cm = { tables: 0, perCand: new Map() }))
    cm.tables++
    for (const c of Object.keys(r.votes)) cm.perCand.set(c, (cm.perCand.get(c) ?? 0) + 1)
  }
  for (const [m, cm] of candByMun) {
    for (const [c, n] of cm.perCand) {
      if (n !== cm.tables) warn(m, `candidatura ${c} publicada en ${n} de ${cm.tables} mesas (no se rellenan ceros)`)
    }
  }
  const errors: string[] = []
  const warnings: string[] = []
  for (const [m, x] of [...by.entries()].sort()) {
    for (const e of x.errors) errors.push(`${m}: ${e}`)
    for (const w of x.warnings) warnings.push(`${m}: ${w}`)
  }
  return { ok: errors.length === 0, rows: rows.length, errors, warnings, byMunicipality: by }
}
