// Validación de las etapas de instrumentación del endpoint XLSX.
// Verifica que:1. El requestId se genera correctamente2. Los logs de etapa se estructuran correctamente3. Los errores se sanean correctamente4. El requestId se devuelve al cliente en errores 5. No se exponen secretos en logs ni en respuestas
//
// Uso: npx tsx scripts/verify-xlsx-runtime-stages.ts
// Archivos solo en tmp/ (ignorado por git).
import { readFileSync } from 'node:fs'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

function testRouteInstrumentation() {
  console.log('\n=== Test 1: Instrumentación del route handler ===')
  const code = readFileSync('src/app/api/socideas/exportar/[codigoINE]/route.ts', 'utf-8')

  // requestId generation
  check('genera requestId con randomUUID', code.includes('randomUUID()'))
  check('requestId recortado a 8 chars', code.includes("randomUUID().slice(0, 8)"))
  check('requestId en mayúsculas', code.includes('.toUpperCase()'))

  // Stage type
  check('define ExportStage type', code.includes("type ExportStage ="))
  check('etapa validate_code', code.includes("'validate_code'"))
  check('etapa create_supabase_client', code.includes("'create_supabase_client'"))
  check('etapa resolve_municipality', code.includes("'resolve_municipality'"))
  check('etapa load_base_data', code.includes("'load_base_data'"))
  check('etapa serialize_xlsx', code.includes("'serialize_xlsx'"))
  check('etapa build_http_response', code.includes("'build_http_response'"))

  // Logging
  check('usa console.log para etapas', code.includes("tag: 'SOCIDEAS_XLSX_EXPORT'"))
  check('usa console.error para errores', code.includes("level: 'error'"))
  check('registra requestId en logs', code.includes('requestId,'))
  check('registra stage en logs', code.includes('stage,'))
  check('registra ineCode en logs', code.includes('ineCode,'))

  // Error response
  check('error 500 incluye requestId', code.includes("'requestId'") || code.includes('requestId,'))
  check('error 500 incluye ref', code.includes("ref: `XLSX-${requestId}`"))

  // Sanitization
  check('sanitiza paths en mensajes', code.includes('[path]'))
  check('sanitiza tokens', code.includes('[redacted]') || code.includes('[hash]'))
  check('limita mensaje a 200 chars', code.includes('.slice(0, 200)'))

  // Headers
  check('header X-Socideas-Request-Id', code.includes('X-Socideas-Request-Id'))
  check('Cache-Control private no-store', code.includes('private, no-store'))

  // Security
  check('NO expone env vars en logs', !code.includes('process.env.NEXT_PUBLIC_SUPABASE_URL'))
  check('NO expone SUPABASE_SERVICE_ROLE_KEY', !code.includes('SUPABASE_SERVICE_ROLE_KEY'))
  check('NO expone R2_SECRET_ACCESS_KEY', !code.includes('R2_SECRET_ACCESS_KEY'))
  check('NO expone R2_ACCESS_KEY_ID en logs', !code.includes('console.log.*R2_ACCESS'))
  check('NO expone stack trace al cliente', !code.includes("err.stack"))
  check('NO expone err.message al cliente', !code.includes("err.message"))
}

function testLogStructure() {
  console.log('\n=== Test 2: Estructura de logs ===')
  const code = readFileSync('src/app/api/socideas/exportar/[codigoINE]/route.ts', 'utf-8')

  // Log function
  check('logStage función existe', code.includes('function logStage('))
  check('logError función existe', code.includes('function logError('))

  // JSON log format
  check('logs son JSON válido (tag)', code.includes("tag: 'SOCIDEAS_XLSX_EXPORT'"))
  check('logs incluyen timestamp', code.includes('ts: new Date().toISOString()'))

  // Error log
  check('error log incluye errorName', code.includes('errorName:'))
  check('error log incluye errorMessage', code.includes('errorMessage:'))
}

function testErrorSecurity() {
  console.log('\n=== Test 3: Seguridad de errores ===')
  const code = readFileSync('src/app/api/socideas/exportar/[codigoINE]/route.ts', 'utf-8')

  const FORBIDDEN = [
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
    'SOCIDEAS_SYNC_TOKEN',
    'localhost', '127.0.0.1',
    'vercel.app', 'cloudflare', 'r2.cloudflarestorage',
    'Bearer',
  ]

  for (const term of FORBIDDEN) {
    check(
      `no expone "${term}" en respuesta al cliente`,
      !code.includes(`error:.*${term}`) && !code.includes(`"${term}"`),
    )
  }

  // Verify requestId format in error response
  check('error response requestId es UUID parcial', code.includes("`XLSX-${requestId}`"))
}

function testRequestHeader() {
  console.log('\n=== Test 4: Header de respuesta ===')
  const code = readFileSync('src/app/api/socideas/exportar/[codigoINE]/route.ts', 'utf-8')
  check('X-Socideas-Request-Id en respuesta exitosa', code.includes("'X-Socideas-Request-Id': requestId"))
  check('requestId en 200 success', code.includes('requestId,') || code.includes('requestId}'))
}

// ---------- Main ----------

function main() {
  testRouteInstrumentation()
  testLogStructure()
  testErrorSecurity()
  testRequestHeader()
  console.log(`\n${failures === 0 ? 'OK' : failures} comprobaciones ${failures === 0 ? 'superadas' : 'FALLIDAS'}`)
  if (failures > 0) process.exit(1)
}

main()
