/**
 * E2E de invalidación de caché SIN tocar R2 de producción.
 *
 * Arquitectura del prueba:
 *  1. Copia el envelope real de un municipio desde el R2 público (solo LECTURA)
 *     a un directorio local que hace de "origen R2" simulado.
 *  2. Levanta un servidor estático local que sirve ese directorio.
 *  3. Levanta `next start` (build de producción) con
 *     NEXT_PUBLIC_SOCIDEAS_R2_BASE apuntando al mock y con
 *     SOCIDEAS_REVALIDATE_TOKEN de prueba.
 *  4. Secuencia:
 *       a) GET ficha → puebla la Data Cache con el valor original.
 *       b) Modifica el archivo local (el "origen") con un valor sonda.
 *       c) GET ficha → debe seguir mostrando el VALOR ANTIGUO (TTL 1 h activo).
 *       d) POST /api/socideas/revalidate con token → invalidados=1.
 *       e) GET ficha → debe mostrar el VALOR SONDA (sin esperar 1 h).
 *  5. Negativos: GET endpoint → 405; POST sin token → 401; body inválido → 400.
 *  6. Limpieza: mata servidores; el directorio local es desechable.
 *
 * Reproducción:
 *   npx tsx scripts/verify-cache-invalidation-e2e.ts
 * Requiere: `npm run build` previo y credenciales .env.local (lectura R2 + Supabase).
 */
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import { spawn, type ChildProcess } from 'child_process'

config({ path: '.env.local' })

const APP_PORT = 3111
const MOCK_PORT = 18787
const TOKEN = 'e2e-local-revalidate-token'
const APP = `http://127.0.0.1:${APP_PORT}`
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`
const CANDIDATES = ['02003', '28079', '41091', '08019'] // Albacete, Madrid, Sevilla, Barcelona

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

const ORIGIN_DIR = path.join(process.cwd(), 'tmp', 'cache-e2e-origin')
// Mismo fallback que r2PublicBase() en src/lib/socideas-r2.ts: la env local
// puede venir vacía y la app usa la base pública R2 documentada.
const R2_PUBLIC_BASE_FALLBACK = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const r2PublicBase = (
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  process.env.SOCIDEAS_R2_PUBLIC_BASE ||
  R2_PUBLIC_BASE_FALLBACK
).replace(/\/$/, '')

async function fetchOriginEnvelope(ine: string): Promise<Record<string, unknown> | null> {
  if (!r2PublicBase) return null
  try {
    const res = await fetch(`${r2PublicBase}/socideas/v2/municipios/${ine}.json`, {
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'application/json' },
    })
    if (res.status !== 200) return null
    const json = (await res.json()) as Record<string, unknown>
    return json.codigo_ine === ine ? json : null
  } catch {
    return null
  }
}

/** Extrae el índice de la tupla de irpf_declaraciones con valor numérico. */
function findIrpfTuple(env: Record<string, unknown>): { idx: number; anio: number; valor: number } | null {
  const indicators = (env.indicators ?? []) as { slug: string }[]
  const valores = (env.valores ?? []) as unknown[][]
  const ii = indicators.findIndex((i) => i.slug === 'irpf_declaraciones')
  if (ii < 0) return null
  for (let t = 0; t < valores.length; t++) {
    const row = valores[t]
    if (row?.[0] === ii && typeof row[2] === 'number' && row[2] > 0) {
      return { idx: t, anio: Number(row[1]), valor: Number(row[2]) }
    }
  }
  return null
}

function fmtEs(n: number): string {
  return n.toLocaleString('es-ES')
}

async function waitFor(url: string, ms: number): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (r.status < 500) return true
    } catch {
      // sigue esperando
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

function serveOrigin(dir: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
    const file = path.join(dir, safe)
    if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end('not found')
      return
    }
    const body = fs.readFileSync(file)
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': body.length, 'cache-control': 'no-store' })
    res.end(body)
  })
  return new Promise((resolve) => server.listen(MOCK_PORT, '127.0.0.1', () => resolve(server)))
}

async function getSsr(ine: string): Promise<string> {
  const r = await fetch(`${APP}/socideas/${ine}?hoja=economia`, {
    signal: AbortSignal.timeout(60_000),
    headers: { 'cache-control': 'no-cache' },
  })
  if (r.status !== 200) throw new Error(`SSR HTTP ${r.status}`)
  return r.text()
}

async function main(): Promise<void> {
  console.log('=== E2E invalidación de caché (mock local, R2 producción intacto) ===')
  if (!fs.existsSync(path.join(process.cwd(), '.next', 'BUILD_ID'))) {
    console.error('Falta build de producción: ejecutar `npm run build` antes.')
    process.exit(1)
  }

  // 1. Elegir candidato con envelope real + irpf numérico.
  let ine = ''
  let original: Record<string, unknown> | null = null
  let tuple: { idx: number; anio: number; valor: number } | null = null
  for (const c of CANDIDATES) {
    const env = await fetchOriginEnvelope(c)
    if (!env) continue
    const t = findIrpfTuple(env)
    if (t) {
      ine = c
      original = env
      tuple = t
      break
    }
  }
  if (!original || !tuple || !ine) {
    console.error('No se encontró candidato con irpf_declaraciones numérico en R2 público.')
    process.exit(1)
  }
  const Sonda = tuple.valor + 1
  console.log(`  Municipio: ${ine} · irpf original=${tuple.valor} (${fmtEs(tuple.valor)}) · sonda=${Sonda}`)

  // 2. Preparar origen simulado
  fs.rmSync(ORIGIN_DIR, { recursive: true, force: true })
  const originFile = path.join(ORIGIN_DIR, 'socideas', 'v2', 'municipios', `${ine}.json`)
  fs.mkdirSync(path.dirname(originFile), { recursive: true })
  const originalText = JSON.stringify(original)
  fs.writeFileSync(originFile, originalText)

  // 3. Levantar mock + app
  const mock = await serveOrigin(ORIGIN_DIR)
  console.log(`  Mock R2: ${MOCK_BASE} (dir ${path.relative(process.cwd(), ORIGIN_DIR)})`)

  const appEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // NEXT_PUBLIC_* se inyecta en build: el override en runtime no funciona en
    // el servidor. La lectura r2PublicBase() cae a SOCIDEAS_R2_PUBLIC_BASE
    // cuando la NEXT_PUBLIC viene vacía (inlinada como "").
    SOCIDEAS_R2_PUBLIC_BASE: MOCK_BASE,
    NEXT_PUBLIC_SOCIDEAS_R2_BASE: '',
    SOCIDEAS_REVALIDATE_BASE_URL: APP,
    SOCIDEAS_REVALIDATE_TOKEN: TOKEN,
  }
  delete appEnv.SOCIDEAS_SYNC_TOKEN // forzar el secreto dedicado
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
  const appProc: ChildProcess = spawn(
    process.execPath,
    [nextBin, 'start', '-p', String(APP_PORT)],
    { env: appEnv, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let appLog = ''
  appProc.stdout?.on('data', (d) => { appLog += String(d) })
  appProc.stderr?.on('data', (d) => { appLog += String(d) })

  const ready = await waitFor(`${APP}/`, 90_000)
  check('next start arranca (HTTP local)', ready, ready ? '' : appLog.slice(-400))
  if (!ready) {
    appProc.kill()
    mock.close()
    process.exit(1)
  }

  try {
    // a) Poblar caché con el valor original
    const html1 = await getSsr(ine)
    fs.writeFileSync(path.join(process.cwd(), 'tmp', 'cache-e2e-html1.html'), html1)
    console.log(
      `  [debug] html1 len=${html1.length} pendiente=${html1.includes('Economía en preparación')} raw=${html1.includes('98166')} fmt=${html1.includes(fmtEs(tuple.valor))} label=${html1.includes('Declaraciones de IRPF')}`,
    )
    check('SSR 200 inicial', html1.length > 5000)
    check('SSR muestra valor original', html1.includes(fmtEs(tuple.valor)), fmtEs(tuple.valor))

    // b) Modificar el ORIGEN (simula la escritura R2 del loader)
    const env2 = JSON.parse(originalText) as Record<string, unknown>
    const vals2 = env2.valores as unknown[][]
    vals2[tuple.idx][2] = Sonda
    fs.writeFileSync(originFile, JSON.stringify(env2))

    // c) Sin revalidar: la caché debe seguir sirviendo el original (TTL 1 h)
    const html2 = await getSsr(ine)
    check('SIN revalidar → sigue el valor original (TTL activo)', html2.includes(fmtEs(tuple.valor)) && !html2.includes(fmtEs(Sonda)))

    // d) Revalidar vía endpoint
    const revalRes = await fetch(`${APP}/api/socideas/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-token': TOKEN },
      body: JSON.stringify({ ines: [ine, 'no-valido'] }),
    })
    check('POST revalidate → 200', revalRes.status === 200, String(revalRes.status))
    const revalJson = (await revalRes.json()) as { data?: { invalidados: number; descartados: number } }
    check('invalidados = 1', revalJson.data?.invalidados === 1, String(revalJson.data?.invalidados))
    check('descartados = 1 (INE inválido)', revalJson.data?.descartados === 1, String(revalJson.data?.descartados))

    // e) Con revalidar: el valor sonda debe ser visible SIN esperar 1 hora
    const html3 = await getSsr(ine)
    check('CON revalidar → valor nuevo visible en SSR', html3.includes(fmtEs(Sonda)), fmtEs(Sonda))
    check('CON revalidar → valor antiguo ya no está', !html3.includes(fmtEs(tuple.valor)))

    // Negativos del endpoint
    const getRes = await fetch(`${APP}/api/socideas/revalidate`)
    check('GET endpoint → 405', getRes.status === 405, String(getRes.status))
    const noAuth = await fetch(`${APP}/api/socideas/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ines: [ine] }),
    })
    check('POST sin token → 401', noAuth.status === 401, String(noAuth.status))
    const badBody = await fetch(`${APP}/api/socideas/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-token': TOKEN },
      body: JSON.stringify({ ines: [] }),
    })
    check('POST body inválido → 400', badBody.status === 400, String(badBody.status))

    // Restaurar el origen simulado (y revalidar) para dejar todo limpio
    fs.writeFileSync(originFile, originalText)
    await fetch(`${APP}/api/socideas/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-token': TOKEN },
      body: JSON.stringify({ ines: [ine] }),
    }).catch(() => undefined)
  } finally {
    appProc.kill()
    mock.close()
    if (failures > 0 && appLog) {
      console.log('--- next start log (tail) ---')
      console.log(appLog.slice(-4000))
    }
  }

  console.log(`\n${failures === 0 ? 'OK' : failures + ' FALLOS'} — e2e caché (mock local; R2 producción no modificado)`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
