/**
 * Pruebas del mecanismo de revalidación de caché (problema prioritario 1).
 * Sin red salvo con `--integration <baseUrl>` (requiere servidor corriendo).
 *
 * Cubre:
 *  - validación estricta de INE-5 y descartes (unitario)
 *  - parsing/autenticación del payload del endpoint (unitario)
 *  - batching (unitario)
 *  - token en tiempo constante (unitario)
 *  - una carga R2 fallida (0 escritos) NUNCA llama a revalidación (unitario)
 *  - un fallo de revalidación queda como degradación, no éxito silencioso
 *  - B2: la ruta acepta SOLO SOCIDEAS_REVALIDATE_TOKEN; con valor de
 *    SOCIDEAS_SYNC_TOKEN → 401 (handler real importado, sin red)
 *  - B3: contador deslizante consumeRateRequest/consumeRateInes (unitario)
 *  - (--integration) el endpoint invalida tags válidas y rechaza inválidos
 *
 * Uso:
 *   npx tsx scripts/verify-revalidate.ts
 *   npx tsx scripts/verify-revalidate.ts --integration http://127.0.0.1:3111
 */
import { NextRequest } from 'next/server'
import {
  GET as routeGet,
  POST as routePost,
  consumeRateInes,
  consumeRateRequest,
} from '../src/app/api/socideas/revalidate/route'
import {
  REVALIDATE_BATCH_SIZE,
  REVALIDATE_MAX_INES,
  REVALIDATE_PATH,
  REVALIDATE_TOKEN_HEADER,
  buildRevalidationAuditRow,
  chunkInes,
  isValidIne5,
  muniCacheTag,
  parseRevalidateBody,
  revalidateAfterWrites,
  revalidateMunicipios,
  shouldRevalidate,
  tokenMatches,
  validateIneList,
} from '../src/lib/socideas-revalidate'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

async function unitTests(): Promise<void> {
  console.log('=== INE-5 ===')
  check('acepta 02003', isValidIne5('02003'))
  check('acepta 28079', isValidIne5('28079'))
  check('rechaza 2003 (4 dígitos)', !isValidIne5('2003'))
  check('rechaza 020031 (6)', !isValidIne5('020031'))
  check('rechaza 0200A', !isValidIne5('0200A'))
  check('rechaza número 2003', !isValidIne5(2003 as unknown))
  check('rechaza null', !isValidIne5(null))

  console.log('\n=== validateIneList ===')
  const v1 = validateIneList(['02003', '28079', 'bad', '02003', 42, '31201'])
  check('validos únicos correctos', v1.validos.join(',') === '02003,28079,31201', v1.validos.join(','))
  check('solicitados = 6', v1.solicitados === 6)
  check('descartados = 3 (bad + dup + 42)', v1.descartados === 3, String(v1.descartados))
  const v2 = validateIneList('no-array')
  check('no-array → vacío sin lanzar', v2.validos.length === 0 && v2.solicitados === 0)

  console.log('\n=== parseRevalidateBody ===')
  check('body válido acepta', parseRevalidateBody({ ines: ['02003'] }).ok === true)
  check('body sin ines rechaza', parseRevalidateBody({}).ok === false)
  check('body ines no-array rechaza', parseRevalidateBody({ ines: 'x' }).ok === false)
  check('body array plano rechaza', parseRevalidateBody(['02003']).ok === false)
  check('body ines vacío rechaza', parseRevalidateBody({ ines: [] }).ok === false)
  check(
    'body solo INE inválidos → 400 (sin éxito vacío)',
    parseRevalidateBody({ ines: ['abc', '12', null] }).ok === false,
  )
  const mixto = parseRevalidateBody({ ines: ['abc', '02003'] })
  check('body mixto (≥1 válido) acepta con descartes', mixto.ok === true && mixto.ok && mixto.validation.validos.length === 1 && mixto.validation.descartados === 1)
  const big = Array.from({ length: REVALIDATE_MAX_INES + 1 }, (_, i) => String(i % 100000).padStart(5, '0'))
  check(
    `payload > ${REVALIDATE_MAX_INES} rechazado (tamaño/duplicados excesivos)`,
    parseRevalidateBody({ ines: big }).ok === false,
  )

  console.log('\n=== Batching ===')
  const many = Array.from({ length: 450 }, (_, i) => String(i).padStart(5, '0'))
  const chunks = chunkInes(many)
  check('450 → 3 lotes', chunks.length === 3, String(chunks.length))
  check('lotes ≤ tamaño máximo', chunks.every((c) => c.length <= REVALIDATE_BATCH_SIZE))
  check('unión de lotes = original', chunks.flat().length === 450)
  check('lote vacío → 0 lotes', chunkInes([]).length === 0)

  console.log('\n=== Tag ===')
  check('tag coincide con lector', muniCacheTag('02003') === 'socideas-muni-02003')

  console.log('\n=== Auth (tiempo constante) ===')
  check('token correcto', tokenMatches('secreto', 'secreto'))
  check('token distinto', !tokenMatches('secreto', 'SECRETO'))
  check('token ausente', !tokenMatches(null, 'secreto'))
  check('token con longitud distinta', !tokenMatches('sec', 'secreto'))
  check('esperado vacío → false', !tokenMatches('', ''))
  check('esperado no configurado → false', !tokenMatches('x', null))

  console.log('\n=== shouldRevalidate (carga R2 fallida nunca revalida) ===')
  check('0 escritos → no revalida', shouldRevalidate(0) === false)
  check('escritura fallida (NaN) → no revalida', shouldRevalidate(NaN) === false)
  check('1 escrito → revalida', shouldRevalidate(1) === true)

  console.log('\n=== revalidateMunicipios sin llamadas de red ===')
  const spyCalls: string[] = []
  const spyFetch = async (url: string): Promise<Response> => {
    spyCalls.push(url)
    throw new Error('no debería llamarse')
  }
  const s0 = await revalidateMunicipios([], {
    fetchImpl: spyFetch,
    baseUrl: 'https://example.invalid',
    token: 't',
  })
  check('lista vacía → 0 peticiones', spyCalls.length === 0)
  check('lista vacía → no degradado', s0.degradado === false)

  const s1 = await revalidateMunicipios(['02003'], { fetchImpl: spyFetch, baseUrl: '', token: '' })
  check('sin configuración → degradado', s1.degradado === true)
  check('sin configuración → 0 invalidados', s1.invalidados === 0)
  check('sin configuración → error resumido', typeof s1.error === 'string' && s1.error.length > 0)
  check('sin configuración → sin peticiones', spyCalls.length === 0)

  console.log('\n=== Degradación auditada (endpoint caído) ===')
  const failFetch = async (): Promise<Response> => {
    throw new Error('ECONNREFUSED (simulado)')
  }
  const s2 = await revalidateMunicipios(['02003', '28079'], {
    fetchImpl: failFetch,
    baseUrl: 'https://example.invalid',
    token: 't',
    now: () => '2026-09-22T12:00:00.000Z',
  })
  check('endpoint caído → degradado', s2.degradado === true)
  check('endpoint caído → invalidados = 0', s2.invalidados === 0)
  check('endpoint caído → errores = válidos', s2.errores === s2.validos, `${s2.errores}/${s2.validos}`)
  check('endpoint caído → modo endpoint', s2.modo === 'endpoint')
  check('endpoint caído → fetch NO usado con lista vacía', spyCalls.length === 0)

  const row = buildRevalidationAuditRow(s2, { runId: 'test-run', writtenCount: 2 })
  check('auditoría estado = error (nada revalidado)', row.estado === 'error')
  check('auditoría lleva run_id', row.metadata.run_id === 'test-run')
  check('auditoría lleva tags solicitadas', row.metadata.tags_solicitadas === s2.solicitados)
  check('auditoría lleva tags fallidas', row.metadata.tags_fallidas === s2.errores)
  check('auditoría lleva modo endpoint', row.metadata.endpoint_modo === 'endpoint')
  check('auditoría lleva timestamp', typeof row.metadata.timestamp === 'string')
  check('auditoría lleva error resumido', typeof row.metadata.error === 'string')
  check('auditoría sin campo token/secret', !('token' in row.metadata) && !('secret' in row.metadata))

  const partial = buildRevalidationAuditRow(
    { ...s2, invalidados: 1, errores: 1, degradado: true },
    { runId: 'test-run', writtenCount: 2 },
  )
  check('auditoría parcial → estado partial', partial.estado === 'partial')

  const allGood = buildRevalidationAuditRow(
    { ...s2, invalidados: 2, errores: 0, degradado: false },
    { runId: 'test-run', writtenCount: 2 },
  )
  check('auditoría completa → estado ok', allGood.estado === 'ok')

  console.log('\n=== revalidateAfterWrites (capa writer, con spy) ===')
  const writerSpy: string[][] = []
  const spyFn = async (ines: readonly string[]): Promise<typeof s2> => {
    writerSpy.push([...ines])
    return { ...s2, solicitados: ines.length, validos: ines.length }
  }
  // writer fallido / dry-run: lista vacía → la revalidación NO se invoca.
  const null1 = await revalidateAfterWrites([], { revalidateFn: spyFn })
  check('lista vacía → null y spy NO llamado', null1 === null && writerSpy.length === 0)
  // writer exitoso: solo los INE escritos llegan a la revalidación.
  const sum1 = await revalidateAfterWrites(['02003', '28079', '02003'], { revalidateFn: spyFn })
  check('writer exitoso → spy recibe los INE escritos', writerSpy.length === 1 && writerSpy[0].join(',') === '02003,28079,02003')
  // La capa propaga la lista del writer tal cual (dedup ocurre dentro del cliente).
  check('writer exitoso → devuelve summary', sum1 !== null && sum1.solicitados === 3)
  // fallo del endpoint: la capa propaga el summary degradado (auditable).
  const degr = await revalidateAfterWrites(['02003'], {
    revalidateFn: async () => ({ ...s2, degradado: true, invalidados: 0, errores: 1 }),
  })
  check('fallo endpoint → summary degradado propagado', degr !== null && degr.degradado === true)
  const rowDegr = buildRevalidationAuditRow(degr!, { runId: 'w', writtenCount: 1 })
  check('degradación → auditoría estado error (no éxito silencioso)', rowDegr.estado === 'error')

  console.log('\n=== B2 · ruta revalidate sin fallback SYNC (handler real) ===')
  const REVAL = 'b2-test-revalidate-token'
  const SYNC = 'b2-test-sync-token'
  const savedReval = process.env.SOCIDEAS_REVALIDATE_TOKEN
  const savedSync = process.env.SOCIDEAS_SYNC_TOKEN
  const mkReq = (tok?: string, body?: unknown): NextRequest =>
    new NextRequest('http://127.0.0.1/api/socideas/revalidate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(tok ? { [REVALIDATE_TOKEN_HEADER]: tok } : {}),
      },
      body: JSON.stringify(body ?? { ines: [] }),
    })
  try {
    // A) Solo REVALIDATE configurado: con el dedicado pasa el auth (400 = body vacío tras auth).
    process.env.SOCIDEAS_REVALIDATE_TOKEN = REVAL
    delete process.env.SOCIDEAS_SYNC_TOKEN
    const aOk = await routePost(mkReq(REVAL))
    check('B2 solo REVALIDATE en env → token dedicado supera auth (400 body)', aOk.status === 400, String(aOk.status))
    const aSync = await routePost(mkReq(SYNC))
    check('B2 solo REVALIDATE en env → valor SYNC recibe 401', aSync.status === 401, String(aSync.status))
    const aNone = await routePost(mkReq(undefined))
    check('B2 sin cabecera → 401', aNone.status === 401, String(aNone.status))

    // B) Ambos en env (prod-like): solo el dedicado vale; SYNC sigue 401.
    process.env.SOCIDEAS_REVALIDATE_TOKEN = REVAL
    process.env.SOCIDEAS_SYNC_TOKEN = SYNC
    const bSync = await routePost(mkReq(SYNC))
    check('B2 ambos en env → SYNC recibe 401 (sin fallback)', bSync.status === 401, String(bSync.status))
    const bReval = await routePost(mkReq(REVAL))
    check('B2 ambos en env → REVALIDATE supera auth (400 body)', bReval.status === 400, String(bReval.status))

    // C) Solo SYNC en env (sin dedicado): 503 no configurada (nunca acepta SYNC).
    delete process.env.SOCIDEAS_REVALIDATE_TOKEN
    process.env.SOCIDEAS_SYNC_TOKEN = SYNC
    const c = await routePost(mkReq(SYNC))
    check('B2 sin REVALIDATE en env → 503 (nunca acepta SYNC)', c.status === 503, String(c.status))

    // D) GET sigue 405.
    const g = await routeGet()
    check('B2 GET → 405', g.status === 405, String(g.status))
  } finally {
    if (savedReval === undefined) delete process.env.SOCIDEAS_REVALIDATE_TOKEN
    else process.env.SOCIDEAS_REVALIDATE_TOKEN = savedReval
    if (savedSync === undefined) delete process.env.SOCIDEAS_SYNC_TOKEN
    else process.env.SOCIDEAS_SYNC_TOKEN = savedSync
  }

  console.log('\n=== B3 · contador deslizante (por clave; best-effort por instancia) ===')
  const rk = `unit-b3-${Date.now()}`
  let okReqs = 0
  for (let i = 0; i < 61; i++) {
    if (consumeRateRequest(rk).ok) okReqs++
  }
  check('B3 60 peticiones aceptadas', okReqs === 60, String(okReqs))
  const denied = consumeRateRequest(rk)
  check('B3 61.ª denegada con Retry-After', !denied.ok && denied.retryAfterSec >= 1, JSON.stringify(denied))
  const rkIne = `${rk}-ines`
  const ines1 = consumeRateInes(rkIne, 10000)
  check('B3 10000 INEs aceptados', ines1.ok)
  const ines2 = consumeRateInes(rkIne, 1)
  check('B3 10001.º INE denegado', !ines2.ok && ines2.limit === 'ines', JSON.stringify(ines2))
}

async function integrationTests(base: string): Promise<void> {
  console.log(`\n=== Integración contra ${base}${REVALIDATE_PATH} ===`)
  // B2: SOLO SOCIDEAS_REVALIDATE_TOKEN (el SYNC ya no abre esta ruta).
  const token = process.env.SOCIDEAS_REVALIDATE_TOKEN || ''
  const url = `${base.replace(/\/$/, '')}${REVALIDATE_PATH}`

  const getRes = await fetch(url)
  check('GET → 405', getRes.status === 405, String(getRes.status))

  const noAuth = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ines: ['02003'] }),
  })
  check('POST sin token → 401', noAuth.status === 401, String(noAuth.status))

  if (!token) {
    check('token de integración disponible (SOCIDEAS_REVALIDATE_TOKEN)', false, 'variable no exportada en el entorno')
    return
  }

  const badAuth = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [REVALIDATE_TOKEN_HEADER]: `${token}-wrong` },
    body: JSON.stringify({ ines: ['02003'] }),
  })
  check('POST token incorrecto → 401', badAuth.status === 401, String(badAuth.status))

  const badBody = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [REVALIDATE_TOKEN_HEADER]: token },
    body: JSON.stringify({ ines: [] }),
  })
  check('POST ines vacío → 400', badBody.status === 400, String(badBody.status))

  const good = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [REVALIDATE_TOKEN_HEADER]: token },
    body: JSON.stringify({ ines: ['02003', '28079', 'nope', '02003'] }),
  })
  check('POST mixto → 200', good.status === 200, String(good.status))
  const json = (await good.json()) as {
    data?: { validos: number; invalidados: number; descartados: number; errores: number }
  }
  check('data presente', !!json.data)
  check('validos = 2 (dedup)', json.data?.validos === 2, String(json.data?.validos))
  check('invalidados = 2', json.data?.invalidados === 2, String(json.data?.invalidados))
  check('descartados = 2 (nope + dup)', json.data?.descartados === 2, String(json.data?.descartados))
  check('errores = 0', json.data?.errores === 0, String(json.data?.errores))
}

async function main(): Promise<void> {
  await unitTests()
  const iArg = process.argv.indexOf('--integration')
  if (iArg >= 0) {
    const base = process.argv[iArg + 1]
    if (!base) {
      check('--integration requiere baseUrl', false)
    } else {
      await integrationTests(base)
    }
  }
  console.log(`\n${failures === 0 ? 'OK' : failures + ' FALLOS'} — revalidación`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
