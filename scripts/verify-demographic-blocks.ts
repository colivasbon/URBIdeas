// Verifica bloques demográficos en ficha: unidad (DTO puro) + integración.
// Unidad: porcentajes, top-5, sin agregados inventados, INE distinto, nulos,
// suprimidos, mezcla prohibidas. Integración (requiere servidor local):
// rutas 200, bloques únicos, sin explorador/selectores/tablas largas.
// Uso (con `npm run dev` en otro terminal):
//   npx tsx scripts/verify-demographic-blocks.ts [baseUrl]
// Sin escrituras, sin navegador (breakpoints: estructurales + pendiente humano).
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import {
  buildDemographicPresentation,
  readDemographicSummary,
} from '../src/lib/socideas-demographic-summary'

config({ path: '.env.local' })

const BASE = process.argv[2] ?? 'http://localhost:3000'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

const raw02069 = () => JSON.parse(readFileSync('tmp/demo3e-summaries.json', 'utf8')).find(
  (o: { ineCode: string }) => o.ineCode === '02069',
)

async function unit(): Promise<void> {
  console.log('=== Unidad (DTO puro) ===')
  const dto = buildDemographicPresentation(raw02069())
  check('DTO construido', !!dto && !!dto.nationality && !!dto.birthCountry && !!dto.birthResidenceRelation)
  check('nacionalidad cuadra y porcentajes', dto?.nationality?.spanishPercent === 85.0 && dto?.nationality?.foreignPercent === 15.0,
    `${dto?.nationality?.spanishPercent}/${dto?.nationality?.foreignPercent}`)
  check('España separada + top-5 como máximo', (dto?.birthCountry?.spain?.label === 'España') && (dto?.birthCountry?.topCountries.length ?? 99) <= 5,
    `${dto?.birthCountry?.topCountries.length}`)
  check('sin agregado extranjero inventado', !('bornAbroad' in (dto?.birthCountry ?? {})) && !dto?.birthCountry?.topCountries.some((c) => /total/i.test(c.label) || c.label === 'España'))
  check('sin suma de países', !JSON.stringify(dto?.birthCountry).includes('totalForeign'))
  const coins = dto?.birthCountry?.topCountries.map((c) => c.label) ?? []
  check('sin duplicados ni nulos en top', new Set(coins).size === coins.length && coins.every(Boolean))
  const arr = dto?.birthResidenceRelation
  const suma = (arr?.categories ?? []).reduce((a, c) => a + (c.value ?? 0), 0)
  check('arraigo cuadra con total', arr?.total === suma, `${arr?.total} vs ${suma}`)
  check('arraigo sin residencia anterior', !/residencia anterior/i.test(JSON.stringify(arr)))
  // Suprimido sintético: todo null + suppressed.
  const sup = buildDemographicPresentation({
    schemaVersion: 'ine-demographic-summary-v1',
    ineCode: '99999',
    nationality: { period: '2025', total: null, spanish: null, foreign: null, status: 'suppressed' },
    birthCountry: { period: '2025', categories: [], status: 'suppressed' },
    birthResidenceRelation: { period: '2025', total: null, sameMunicipality: null, sameProvinceOtherMunicipality: null, sameAutonomousCommunityOtherProvince: null, otherAutonomousCommunity: null, bornAbroad: null, status: 'suppressed' },
  } as never)
  check('suprimido sin números ni porcentajes',
    sup?.nationality?.spanishPercent === null && sup?.birthResidenceRelation?.categories.every((c) => c.percent === null) === true)
  check('ausencia total → DTO null', buildDemographicPresentation(null) === null)
  check('DTO sin 61 categorías', JSON.stringify(dto).length < 5120, `${JSON.stringify(dto).length} B`)
  // Loader: solo lectura lateral (estático) + lectura real.
  const src = readFileSync('src/lib/socideas-demographic-summary.ts', 'utf8')
  check('loader sin escrituras/Supabase/CSV', !/PutObject|insert|update|upsert|delete|supabase|jaxiT3\/files|ListObjects/.test(src))
  check('loader valida INE-5 y schema', /\\d\{5\}/.test(src) && src.includes('ine-demographic-summary-v1') && src.includes('ineCode !== codigoIne'))
  const live = await readDemographicSummary('02069')
  check('lectura lateral R2 (02069)', live?.ineCode === '02069')
  check('INE inexistente → null', (await readDemographicSummary('99999')) === null)
  check('INE inválido → null', (await readDemographicSummary('abc')) === null)
}

async function integration(): Promise<void> {
  console.log('\n=== Integración (rutas y estructura) ===')
  const routes = ['02003', '07010', '02069', '28143', '02065', '28079', '50297']
  const compSrc = readFileSync('src/components/socideas/DemographicBlocks.tsx', 'utf8')
  check('sin animaciones (reduced motion por construcción)', !/transition|animation|motion\./.test(compSrc))
  check('textos de estado presentes', /secreto estadístico/.test(compSrc) && /no disponible para este municipio/i.test(compSrc) && /Cobertura parcial/.test(compSrc))
  for (const ine of routes) {
    let html = ''
    try {
      const res = await fetch(`${BASE}/socideas/${ine}`)
      check(`ruta /socideas/${ine} 200`, res.status === 200, `status ${res.status}`)
      if (res.status !== 200) continue
      html = await res.text()
    } catch {
      check(`ruta /socideas/${ine} 200`, false, 'sin conexión (arranque `npm run dev`)')
      continue
    }
    const count = (s: string): number => html.split(s).length - 1
    // React inserta <!-- --> entre nodos de texto/expresiones: normalizar antes.
    const flat = html.replace(/<!-- -->/g, "")
    check(`${ine}: bloques únicos`, count('aria-label="Nacionalidad"') <= 1 && count('aria-label="Lugar de nacimiento"') <= 1 && count('aria-label="Arraigo territorial"') <= 1)
    check(`${ine}: sin Explorar datos`, !flat.includes('Explorar datos'))
    check(`${ine}: sin selector de país/nacionalidad/arraigo`, !/name="(pais|nacionalidad|arraigo)[^"]*"/.test(flat) && !flat.includes('id="exp-'))
    check(`${ine}: trazabilidad con Tabla INE`, flat.includes('Tabla 68535') && flat.includes('Tabla 66322') && flat.includes('Tabla 68540'))
    check(`${ine}: nota de países visible`, flat.includes('no equivale a una'))
  }
}

async function main(): Promise<void> {
  await unit()
  await integration()
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nBloques demográficos verificados: DTO, rutas, estructura y accesibilidad OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
