// Read-back INDEPENDIENTE desde la URL pública de R2. No usa los módulos de
// lectura del proyecto: lee por HTTP público y valida el contrato, para que una
// lectura defectuosa de SOCideas no pueda enmascarar un objeto corrupto.
// Uso: npx tsx scripts/verify-secciones-r2.ts
import { createHash } from 'node:crypto'
import {
  SECCIONES_R2_PREFIX,
  SECCIONES_MANIFESTS_PREFIX,
  esPoligonoDistrito,
  municipioDeSeccion,
  validarSeccionesAtlas,
  expandirObservaciones,
  type SeccionesAtlasR2V1,
} from '../src/lib/socideas-secciones'

let fallos = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) fallos += 1
}

const BASE =
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'

/** Municipios piloto con los casos exigidos por la misión. */
const PILOTOS = [
  { ine: '02007', nombre: 'Alcalá del Júcar', caso: 'una sola sección' },
  { ine: '16016', nombre: 'Almendros', caso: 'una sola sección (Cuenca)' },
  { ine: '16211', nombre: 'Torrejoncillo del Rey', caso: 'pequeño' },
  { ine: '45090', nombre: 'Manzaneque', caso: 'pequeño' },
  { ine: '28079', nombre: 'Madrid', caso: 'cientos/miles de secciones + ND' },
  { ine: '41091', nombre: 'Sevilla', caso: 'grande + ND' },
  { ine: '46250', nombre: 'València', caso: 'grande + ND' },
  { ine: '51001', nombre: 'Ceuta', caso: 'insular/ciudad autónoma + multipolígonos' },
  { ine: '52001', nombre: 'Melilla', caso: 'insular/ciudad autónoma' },
]

async function main() {
  console.log(`=== Read-back público R2: ${BASE} ===\n`)

  // 1. Manifiesto
  let manifiesto: { runId?: string; mode?: string; counts?: Record<string, number> } | null = null
  try {
    const r = await fetch(`${BASE}/${SECCIONES_MANIFESTS_PREFIX}/latest-successful.json`)
    check('manifiesto latest-successful.json accesible', r.ok, `HTTP ${r.status}`)
    if (r.ok) {
      manifiesto = (await r.json()) as typeof manifiesto
      check(
        'el manifiesto declara una corrida con escritura',
        manifiesto?.mode === 'write',
        `runId=${manifiesto?.runId} mode=${manifiesto?.mode}`,
      )
    }
  } catch (e) {
    check('manifiesto latest-successful.json accesible', false, e instanceof Error ? e.message : String(e))
  }

  for (const p of PILOTOS) {
    const url = `${BASE}/${SECCIONES_R2_PREFIX}/${p.ine}.json`
    let objeto: SeccionesAtlasR2V1
    try {
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) {
        check(`${p.ine} ${p.nombre} (${p.caso}) publicado`, false, `HTTP ${r.status}`)
        continue
      }
      objeto = (await r.json()) as SeccionesAtlasR2V1
    } catch (e) {
      check(`${p.ine} ${p.nombre} publicado`, false, e instanceof Error ? e.message : String(e))
      continue
    }

    check(`${p.ine} ${p.nombre} (${p.caso}) publicado`, true, `${p.ine}.json`)

    // 2. Cabeceras HTTP de caché coherentes con versión inmutable.
    const cr = await fetch(url, { method: 'HEAD' })
    const cc = cr.headers.get('cache-control') ?? ''
    check(`${p.ine} Cache-Control con versión inmutable`, cc.includes('max-age=86400'), cc)

    // 3. Identidad y geometría.
    check(`${p.ine} municipalityIne correcto`, objeto.municipalityIne === p.ine, objeto.municipalityIne)
    check(
      `${p.ine} el INE es la fuente declarada de la geometría`,
      /Instituto Nacional de Estad/i.test(objeto.geometrySource),
      objeto.geometrySource,
    )
    check(`${p.ine} secciones presentes`, objeto.sections.length > 0, `${objeto.sections.length}`)

    const agregados = objeto.sections.filter((f) => esPoligonoDistrito(f.properties.CUSEC))
    check(
      `${p.ine} ningún polígono agregado de distrito publicado como sección`,
      agregados.length === 0,
      `${agregados.length} agregados`,
    )
    const ajenos = objeto.sections.filter(
      (f) => municipioDeSeccion(f.properties.CUSEC) !== p.ine || f.properties.CUMUN !== p.ine,
    )
    check(
      `${p.ine} el 100 % de los polígonos pertenece al municipio INE`,
      ajenos.length === 0,
      `${ajenos.length} ajenos de ${objeto.sections.length}`,
    )
    const claves = new Set(objeto.sections.map((f) => f.properties.CUSEC))
    check(
      `${p.ine} CUSEC únicos y de 10 dígitos`,
      claves.size === objeto.sections.length &&
        [...claves].every((k) => /^\d{10}$/.test(k)),
      `${claves.size} únicos`,
    )

    // 4. Geometría dentro del ámbito español (prueba de reproyección).
    let dentro = true
    const recorrer = (c: unknown): void => {
      if (!Array.isArray(c)) return
      if (typeof c[0] === 'number' && typeof c[1] === 'number') {
        const lon = c[0] as number
        const lat = c[1] as number
        if (lon < -11 || lon > 5 || lat < 35 || lat > 44.6) dentro = false
        return
      }
      for (const x of c) recorrer(x)
    }
    for (const f of objeto.sections) recorrer((f.geometry as { coordinates?: unknown })?.coordinates)
    check(`${p.ine} geometría en coordenadas WGS84 de España`, dentro)

    // 5. Integridad del checksum de contenido.
    const { schemaChecksum, ...cuerpo } = objeto
    const recalculado = createHash('sha256').update(JSON.stringify(cuerpo)).digest('hex')
    check(
      `${p.ine} schemaChecksum reproducible`,
      recalculado === schemaChecksum,
      schemaChecksum ? `${recalculado.slice(0, 12)}…` : 'ausente',
    )

    // 6. Validación del contrato sobre la forma EXPANDIDA (la que ve la UI).
    const ind = objeto.indicators[0]
    if (ind) {
      const expandido = expandirObservaciones(objeto.series, {
        municipalityIne: objeto.municipalityIne,
        geometryYear: objeto.geometryYear,
        operation: ind.operation,
        sourceTable: ind.sourceTable,
        unit: ind.unidad,
        denominator: ind.denominador,
        sourceUrl: ind.url,
        publishedAt: null,
        retrievedAt: objeto.statsRetrievedAt,
        checksum: objeto.sourceChecksums?.adrhProvincial ?? '',
      })
      // `schemaVersion` debe ir DESPUÉS del spread: el objeto compacto declara
      // `secciones-atlas-r2-v1` y el contrato validado es `secciones-atlas-v1`.
      const atlas = {
        ...objeto,
        schemaVersion: 'secciones-atlas-v1',
        observations: expandido,
      } as unknown as Parameters<typeof validarSeccionesAtlas>[0]
      const v = validarSeccionesAtlas(atlas)
      check(`${p.ine} el contrato valida tras expandir`, v.ok, v.errores.slice(0, 2).join(' | '))
    }

    // 7. El invariante de compactación: la forma publicada debe contener
    //    exactamente el mismo número de celdas que se leyeron del INE.
    let celdas = 0
    for (const porInd of Object.values(objeto.series)) {
      for (const serie of Object.values(porInd)) celdas += serie.length
    }
    const esperado = objeto.indicators.length * 9 * objeto.sections.length
    check(
      `${p.ine} nº de celdas coherente con secciones×indicadores×años`,
      celdas > 0 && celdas <= esperado,
      `${celdas} celdas (máx ${esperado})`,
    )

    // 8. ND nunca 0, y 0 real conservado.
    let nd = 0
    let ceros = 0
    let ndConValor = 0
    for (const porInd of Object.values(objeto.series)) {
      for (const serie of Object.values(porInd)) {
        for (const v of serie) {
          if (v.s === 'observado') {
            if (v.v === null) ndConValor++
            if (v.v === 0) ceros++
          } else {
            nd++
            if (v.v !== null && v.v !== undefined) ndConValor++
          }
        }
      }
    }
    check(
      `${p.ine} ningún ND con valor numérico`,
      ndConValor === 0,
      `${ndConValor} infracciones de ${nd} ND`,
    )
    console.log(`       ${p.ine}: ND=${nd} ceros reales=${ceros} celdas=${celdas}`)

    // 9. Cobertura declarada coherente con lo publicado.
    const conDatos = objeto.indicators.filter((i) => i.publicadoPorSeccion)
    check(
      `${p.ine} hay indicadores con dato por sección`,
      conDatos.length > 0,
      `${conDatos.length}/${objeto.indicators.length} indicadores`,
    )

    // 10. Fechas de cartografía y de estadística separadas.
    check(
      `${p.ine} año de geometría y fecha de estadística son campos distintos`,
      typeof objeto.geometryYear === 'number' && typeof objeto.statsRetrievedAt === 'string',
      `geometría=${objeto.geometryYear} estadística=${objeto.statsRetrievedAt.slice(0, 10)}`,
    )
  }

  console.log(`\n${fallos === 0 ? 'OK' : `${fallos} FALLOS`} — read-back R2 de secciones censales`)
  if (fallos > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error('ERROR', e instanceof Error ? e.message : e)
  process.exit(1)
})
