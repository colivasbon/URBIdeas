// Validación de datos temporales/provisionales (Fase 4) — sin red, sin R2.
// Uso: npx tsx scripts/verify-temporary-data-visibility.ts
import { readFileSync } from 'node:fs'
import {
  isTemporaryCurrent,
  validateTemporaryMunicipalData,
  type TemporaryMunicipalData,
} from '../src/lib/socideas-temporary-data'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

function good(): TemporaryMunicipalData {
  return {
    schemaVersion: 'temporary-municipal-data-v1',
    ineCode: '02003',
    status: 'provisional',
    label: 'Dato provisional',
    source: 'INE',
    sourceUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=69767',
    period: '2024',
    retrievedAt: '2026-09-11T00:00:00.000Z',
    values: { saldo: 1214, supuesto: null },
  }
}

function main(): void {
  console.log('=== Contrato temporal ===')
  check('temporal válido aceptado', validateTemporaryMunicipalData(good()).ok)

  check('rechaza sin fuente', !validateTemporaryMunicipalData({ ...good(), source: '' }).ok)
  check('rechaza sin período', !validateTemporaryMunicipalData({ ...good(), period: '' }).ok)
  check('rechaza sin retrievedAt', !validateTemporaryMunicipalData({ ...good(), retrievedAt: undefined }).ok)
  check('rechaza sin etiqueta correcta', !validateTemporaryMunicipalData({ ...good(), label: 'Otro' }).ok)
  check('rechaza status no provisional', !validateTemporaryMunicipalData({ ...good(), status: 'definitivo' }).ok)
  check('rechaza INE-5 inválido', !validateTemporaryMunicipalData({ ...good(), ineCode: '2003' }).ok)

  const withNull = good()
  const parsed = validateTemporaryMunicipalData(withNull)
  check('null se conserva (nunca 0)', parsed.ok && parsed.data.values.supuesto === null)

  console.log('\n=== Caducidad ===')
  check('sin expiresAt es vigente', isTemporaryCurrent(good()))
  check('caducado no vigente', !isTemporaryCurrent({ ...good(), expiresAt: '2000-01-01T00:00:00.000Z' }))
  check('futuro vigente', isTemporaryCurrent({ ...good(), expiresAt: '2100-01-01T00:00:00.000Z' }))

  console.log('\n=== Visibilidad estructural ===')
  const notice = readFileSync('src/components/socideas/TemporaryDataNotice.tsx', 'utf8')
  check('notice muestra etiqueta Dato provisional', notice.includes('Dato provisional'))
  check('notice no usa lenguaje prohibido', !/Hot data|Dato en caché|Dato de R2|Experimental|>\s*Draft\s*<|>\s*Temp\s*</.test(notice))
  check('notice nunca imprime 0 por null', notice.includes('=== null') && notice.includes('"ND"'))
  check('notice no añade placeholder vacío', !/No hay datos temporales/.test(notice))
  check('notice no suma ambos valores', !/provisional\s*\+\s*consolidado/.test(notice))

  const ficha = readFileSync('src/components/socideas/FichaFiltros.tsx', 'utf8')
  check('ficha solo renderiza con datos', ficha.includes('{temporaryData && <TemporaryDataNotice'))
  check('ficha pasa el temporal', ficha.includes('temporaryData={temporaryData}') || ficha.includes('temporaryData?:'))

  console.log(`\n${failures === 0 ? 'OK' : failures + ' FALLOS'} — datos temporales`)
  if (failures > 0) process.exit(1)
}

main()
