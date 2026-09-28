// Verificación numérica e independiente de la reproyección EPSG:25830 → 4326.
//
// Tres pruebas, ninguna circular:
//  1. ROUND-TRIP con una proyección DIRECTA (fórmula standard, escrita aquí de
//     forma independiente): lat/lon -> UTM -> lat/lon. Si la inversa es
//     correcta, vuelve al mismo punto con error milimétrico.
//  2. PUNTOS DE CONTROL con coordenadas reales conocidas de municipios
//     españoles, proyectados a UTM con la fórmula directa y de vuelta por la
//     función del módulo.
//  3. GEOMETRÍA REAL DEL INE: el centroide reproyectado de cada municipio debe
//     caer cerca de sus coordenadas reales conocidas.
//
// Uso: npx tsx scripts/verify-secciones-proyeccion.ts
import {
  descargarSecciones,
  project25830,
  CRS_ORIGEN_INE,
  CRS_PUBLICADO,
} from '../src/lib/ine-secciones-geometry'
import { esPoligonoDistrito, municipioDeSeccion } from '../src/lib/socideas-secciones'

let fallos = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) fallos += 1
}

// ── Proyección DIRECTA (Transversal de Mercator, serie estándar) ────────────
// Escrita de forma independiente para que el round-trip no sea circular.
const A = 6378137.0
const F = 1 / 298.257222101
const K0 = 0.9996
const FE = 500000.0
const FN = 0.0
const LON0 = -3.0
const R2D = 180 / Math.PI

function directa25830(lon: number, lat: number): [number, number] {
  const e2 = F * (2 - F)
  const ep2 = e2 / (1 - e2)
  const phi = lat / R2D
  const lam = lon / R2D
  const lam0 = LON0 / R2D
  const sp = Math.sin(phi)
  const cp = Math.cos(phi)
  const tp = Math.tan(phi)
  const n = A / Math.sqrt(1 - e2 * sp * sp)
  const t = tp * tp
  const c = ep2 * cp * cp
  const m =
    A *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi))
  const Aa = cp * (lam - lam0)
  const e =
    FE +
    K0 *
      n *
      (Aa + ((1 - t + c) * Aa ** 3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * Aa ** 5) / 120)
  const north =
    FN +
    K0 *
      (m +
        n * tp * (Aa * Aa / 2 +
          ((5 - t + 9 * c + 4 * c * c) * Aa ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * Aa ** 6) / 720))
  return [e, north]
}

const CONTROL: { nombre: string; lon: number; lat: number }[] = [
  { nombre: 'Madrid Puerta del Sol', lon: -3.70379, lat: 40.41695 },
  { nombre: 'Alcalá del Júcar (Albacete)', lon: -1.4308, lat: 39.3543 },
  { nombre: 'Almendros (Ávila)', lon: -4.7206, lat: 40.1712 },
  { nombre: 'Ceuta centro', lon: -5.3133, lat: 35.8894 },
  { nombre: 'Melilla', lon: -2.9381, lat: 35.2923 },
  { nombre: 'Sevilla (Plaza España)', lon: -5.9851, lat: 37.3767 },
]

// Municipios piloto. `ancla` son coordenadas de REFERENCIA FIABLES:
//  - Para ciudades whose territory is the city itself, the city coordinates.
//  - Para rurales, NO se usa la coordenada del pueblo: un término municipal
//    puede extenderse decenas de km alrededor de su núcleo (el bounding box de
//    02007 va de lat 39.12 a 39.25 y el pueblo está al norte del término).
//    Se ancla contra la PROVINCIA, que es un hecho comprobable: el propio INE
//    publica `NPRO` en cada geometría.
const MUNICIPIOS: { ine: string; nombre: string; provincia: string; ref?: [number, number] }[] = [
  { ine: '02007', nombre: 'Alcalá del Júcar', provincia: 'Albacete' },
  { ine: '16016', nombre: 'Almendros', provincia: 'Cuenca' },
  { ine: '51001', nombre: 'Ceuta', provincia: 'Ceuta', ref: [-5.3225, 35.8894] },
  { ine: '52001', nombre: 'Melilla', provincia: 'Melilla', ref: [-2.9381, 35.2923] },
  { ine: '28079', nombre: 'Madrid', provincia: 'Madrid', ref: [-3.7038, 40.4168] },
  { ine: '41091', nombre: 'Sevilla', provincia: 'Sevilla', ref: [-5.9845, 37.3891] },
  // València: 46250 es el municipio de València capital (607 secciones);
  // 46208 es Rafelcofer. La etiqueta de provincia que publica el INE es
  // literalmente "Valencia/Valéncia", así que se compara con esa.
  { ine: '46250', nombre: 'València', provincia: 'Valencia/Valéncia', ref: [-0.3763, 39.4699] },
]

/** Ámbitos aproximados de provincia (bbox) para anclar el centroide sin
 *  depender de la memoria ni de centroides municipales de baja calidad. */
const BBOX_PROVINCIA: Record<string, [number, number, number, number]> = {
  Albacete: [-2.65, 38.05, -0.6, 39.6],
  Cuenca: [-3.35, 39.4, -1.6, 40.6],
  Madrid: [-4.4, 40.05, -3.25, 41.2],
  Sevilla: [-6.35, 36.85, -4.55, 38.15],
  Ceuta: [-5.45, 35.82, -5.25, 35.95],
  Melilla: [-3.0, 35.24, -2.9, 35.34],
  'Valencia/Valéncia': [-1.55, 38.6, 0.75, 40.2],
}

function metrosDeError(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): { e: number; n: number } {
  const mid = ((lat1 + lat2) / 2) * (Math.PI / 180)
  const e = (lon1 - lon2) * 111320 * Math.cos(mid)
  const n = (lat1 - lat2) * 110540
  return { e, n }
}

function centroide(features: { geometry?: unknown }[]): [number, number] | null {
  let sx = 0
  let sy = 0
  let n = 0
  const recorrer = (c: unknown): void => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      sx += c[0] as number
      sy += c[1] as number
      n += 1
      return
    }
    for (const x of c) recorrer(x)
  }
  for (const f of features) recorrer((f.geometry as { coordinates?: unknown })?.coordinates)
  if (!n) return null
  return [sx / n, sy / n]
}

function bboxDe(features: { geometry?: unknown }[]): [number, number, number, number] | null {
  let minLon = 180
  let maxLon = -180
  let minLat = 90
  let maxLat = -90
  let n = 0
  const recorrer = (c: unknown): void => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      minLon = Math.min(minLon, c[0] as number)
      maxLon = Math.max(maxLon, c[0] as number)
      minLat = Math.min(minLat, c[1] as number)
      maxLat = Math.max(maxLat, c[1] as number)
      n += 1
      return
    }
    for (const x of c) recorrer(x)
  }
  for (const f of features) recorrer((f.geometry as { coordinates?: unknown })?.coordinates)
  return n ? [minLon, minLat, maxLon, maxLat] : null
}

async function main() {
  console.log(`=== Proyección ${CRS_ORIGEN_INE} → ${CRS_PUBLICADO} ===\n`)

  // ── 1. Round-trip con fórmula directa independiente ────────────────────────
  console.log('--- 1. Round-trip directa → inversa ---')
  let peorRoundTrip = 0
  for (const c of CONTROL) {
    const [e, n] = directa25830(c.lon, c.lat)
    const [lon, lat] = project25830(e, n)
    const { e: de, n: dn } = metrosDeError(c.lon, c.lat, lon, lat)
    const peor = Math.max(Math.abs(de), Math.abs(dn))
    peorRoundTrip = Math.max(peorRoundTrip, peor)
    check(
      `round-trip ${c.nombre}`,
      peor < 0.05,
      `UTM(${e.toFixed(1)}, ${n.toFixed(1)}) → (${lon.toFixed(7)}, ${lat.toFixed(7)}) err=${peor.toExponential(2)} m`,
    )
  }
  console.log(`peor error de round-trip: ${peorRoundTrip.toExponential(3)} m\n`)

  // ── 2. Geometría REAL del INE ─────────────────────────────────────────────
  console.log('--- 2. Geometría real del INE ---')
  for (const m of MUNICIPIOS) {
    let r
    try {
      r = await descargarSecciones(m.ine, 'Secciones_2025', { toleranciaMetros: 8 })
    } catch (e) {
      check(`geometría ${m.ine} (${m.nombre})`, false, e instanceof Error ? e.message : String(e))
      continue
    }

    check(
      `${m.ine} ${m.nombre}: secciones descargadas`,
      r.features.length > 0,
      `n=${r.features.length} páginas=${r.paginas} totalAnunciado=${r.totalAnunciado} agregadosDistrito=${r.agregadosDistrito.length} ms=${r.ms}`,
    )
    check(
      `${m.ine}: todo CUSEC pertenece al municipio`,
      r.features.every((f) => municipioDeSeccion(f.properties.CUSEC) === m.ine),
    )
    check(
      `${m.ine}: ningún polígono agregado de distrito publicado como sección`,
      r.features.every((f) => !esPoligonoDistrito(f.properties.CUSEC)),
    )
    check(
      `${m.ine}: CUMUN coincide con codigo_ine`,
      r.features.every((f) => f.properties.CUMUN === m.ine),
    )
    check(
      `${m.ine}: geometría no nula`,
      r.features.every((f) => f.geometry && f.geometry !== null),
    )

    // La provincia la declara el propio INE en cada geometría: es la ancla
    // fiable, y además detectamos aquí un `CUMUN` que no sea el municipio.
    const npros = new Set(r.features.map((f) => f.properties.NPRO))
    check(
      `${m.ine}: la provincia declarada por el INE es ${m.provincia}`,
      npros.size === 1 && npros.has(m.provincia),
      `NPRO=${[...npros].join('/')}`,
    )

    const bb = bboxDe(r.features)
    if (bb) {
      const [minLon, minLat, maxLon, maxLat] = bb
      check(
        `${m.ine}: coordenadas dentro del ámbito peninsular+islas`,
        minLon > -11 && maxLon < 5 && minLat > 35 && maxLat < 44.6,
        `lon[${minLon.toFixed(3)},${maxLon.toFixed(3)}] lat[${minLat.toFixed(3)},${maxLat.toFixed(3)}]`,
      )
      const pb = BBOX_PROVINCIA[m.provincia]
      if (pb) {
        const solapa =
          minLon <= pb[2] && pb[0] <= maxLon && minLat <= pb[3] && pb[1] <= maxLat
        check(
          `${m.ine}: el término cae dentro del ámbito de ${m.provincia}`,
          solapa,
          `lon[${minLon.toFixed(3)},${maxLon.toFixed(3)}] lat[${minLat.toFixed(3)},${maxLat.toFixed(3)}] vs ${JSON.stringify(pb)}`,
        )
      }
    } else {
      check(`${m.ine}: bbox calculado`, false, 'sin coordenadas')
    }

    const c = centroide(r.features)
    if (c) {
      if (m.ref) {
        const { e, n } = metrosDeError(c[0], c[1], m.ref[0], m.ref[1])
        // 25 km: holgado para términos extensos, pero un orden de magnitud por
        // debajo del fallo que detectamos antes (~4 000 km).
        const dist = Math.hypot(e, n)
        check(
          `${m.ine}: centroide cerca de ${m.nombre}`,
          dist < 25000,
          `${(dist / 1000).toFixed(2)} km de (${m.ref[0]}, ${m.ref[1]})`,
        )
      } else {
        const pb = BBOX_PROVINCIA[m.provincia]
        if (pb) {
          const dentro = c[0] >= pb[0] && c[0] <= pb[2] && c[1] >= pb[1] && c[1] <= pb[3]
          check(
            `${m.ine}: centroide dentro del ámbito de ${m.provincia}`,
            dentro,
            `centroide (${c[0].toFixed(4)}, ${c[1].toFixed(4)})`,
          )
        }
      }
    }
  }

  // ── 3. Paginación: Madrid supera el límite de una sola página ─────────────
  console.log('\n--- 3. Paginación (Madrid) ---')
  const mad = await descargarSecciones('28079', 'Secciones_2025', { toleranciaMetros: 8 })
  check(
    'Madrid devuelve TODAS sus secciones',
    mad.features.length > 1000,
    `${mad.features.length} secciones en ${mad.paginas} páginas; sin paginar se perderían ${mad.features.length - 1000}`,
  )
  check(
    'Madrid: el total cuadra con numberMatched del servidor',
    mad.totalAnunciado === mad.features.length + mad.agregadosDistrito.length,
    `anunciado=${mad.totalAnunciado} features=${mad.features.length} agregados=${mad.agregadosDistrito.length}`,
  )

  console.log(`\n${fallos === 0 ? 'OK' : `${fallos} FALLOS`} — proyección y geometría`)
  if (fallos > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error('ERROR', e instanceof Error ? e.message : e)
  process.exit(1)
})
