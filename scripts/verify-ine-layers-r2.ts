// Validación estructural de las capas INE laterales (Fase 4) — sin red, sin R2.
// Comprueba el contrato, el prefijo aislado y las salvaguardas del cargador.
// Uso: npx tsx scripts/verify-ine-layers-r2.ts
import { readFileSync } from 'node:fs'
import {
  INE_LAYERS_V1_PREFIX,
  isValidIneCode,
  validateMunicipalIneLayers,
  type IneValue,
  type MunicipalIneLayersV1,
} from '../src/lib/socideas-ine-layers'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

function val(value: number | null, status: IneValue['status'] = 'observed'): IneValue {
  return { value, unit: 'personas', status, source: 'INE', tableId: '69767', period: '2024', derived: false }
}

function goodObject(): MunicipalIneLayersV1 {
  return {
    schemaVersion: 'municipal-ine-layers-v1',
    ineCode: '02003',
    municipalityName: 'Albacete',
    generatedAt: '2026-09-11T00:00:00.000Z',
    layers: {
      migration: {
        period: '2024',
        latest: { period: '2024', total: val(1214), interior: val(400), exterior: val(814) },
        annualSeries: [
          { period: '2023', total: val(1138), interior: val(380), exterior: val(758) },
          { period: '2024', total: val(1214), interior: val(400), exterior: val(814) },
        ],
        status: 'observed',
      },
      education: {
        period: '2021',
        censusYear: 2021,
        status: 'observed',
        total: {
          primaryOrBelow: val(100),
          lowerSecondary: val(200),
          upperSecondaryPostSecondary: val(150),
          higher: val(120),
          notApplicableUnder15: val(50),
        },
      },
    },
    quality: { territoryMatch: 'exact', sourceChecksums: { '69767': 'abc' }, validationStatus: 'passed' },
  }
}

function staticCheck(path: string, mustMatch: RegExp[], mustNotMatch: RegExp[]): void {
  const src = readFileSync(path, 'utf8')
  for (const re of mustMatch) check(`${path} contiene ${re}`, re.test(src))
  for (const re of mustNotMatch) check(`${path} NO contiene ${re}`, !re.test(src))
}

function main(): void {
  console.log('=== Contrato lateral INE ===')
  check('INE-5 válido', isValidIneCode('02003') && !isValidIneCode('2003') && !isValidIneCode('ABCDE'))
  check('prefijo aislado', INE_LAYERS_V1_PREFIX === 'socideas/ine-layers/v1/municipal')

  const ok = validateMunicipalIneLayers(goodObject())
  check('objeto válido aceptado', ok.ok)

  const badSchema = { ...goodObject(), schemaVersion: 'otro' }
  check('schema inválido rechazado', !validateMunicipalIneLayers(badSchema).ok)

  const badIne = { ...goodObject(), ineCode: '2003' }
  check('INE-5 inválido rechazado', !validateMunicipalIneLayers(badIne).ok)

  const suppressedAsNumber = goodObject()
  suppressedAsNumber.layers.migration!.latest!.total = { ...val(5), status: 'suppressed', value: 5 }
  check('supresión con número rechazada', !validateMunicipalIneLayers(suppressedAsNumber).ok)

  const missingSource = goodObject()
  missingSource.layers.migration!.latest!.total = { ...val(5), source: '' }
  check('valor sin fuente rechazado', !validateMunicipalIneLayers(missingSource).ok)

  const noEduYear = { ...goodObject(), layers: { ...goodObject().layers, education: { period: '2021', censusYear: 2020, status: 'observed' } } }
  check('Censo 2020 en educación rechazado', !validateMunicipalIneLayers(noEduYear).ok)

  console.log('\n=== Salvaguardas del cargador y del lector ===')
  staticCheck(
    'scripts/load-ine-layers-r2.ts',
    [/--confirm-r2-write/, /INE_LAYERS_V1_PREFIX/, /complete/, /MATCH_GATE/],
    [/putMunicipioJson|r2KeyFor|R2_KEY_PREFIX/],
  )
  staticCheck(
    'src/lib/socideas-ine-layers.ts',
    [/socideas\/ine-layers\/v1\/municipal/, /validateMunicipalIneLayers/],
    [/PutObjectCommand/, /@supabase\/supabase-js|createClient\(/],
  )
  staticCheck(
    'docs/socideas-ine-layers-audit.md',
    [/69767/, /33578/, /No apta/, /no se escribe R2/i],
    [/Cero secretos: no/],
  )

  console.log(`\n${failures === 0 ? 'OK' : failures + ' FALLOS'} — validación de capas INE`)
  if (failures > 0) process.exit(1)
}

main()
