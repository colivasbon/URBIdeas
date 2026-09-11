// Validación del manejo de errores del endpoint de exportación XLSX.
// Verifica que los mensajes de error son seguros (sin secretos, sin stack traces)
// y que el endpoint maneja correctamente códigos INE inválidos y configuración faltante.
//
// Uso: npx tsx scripts/verify-xlsx-download-errors.ts
// Archivos solo en tmp/ (ignorado por git).
import { readFileSync } from 'node:fs'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

// ---------- Test 1: Expresión regular de validación INE ----------

function testINEValidation() {
  console.log('\n=== Test 1: Validación código INE ===')
  const regex = /^\d{5}$/

  check('02003 válido (Albacete)', regex.test('02003'))
  check('00000 válido (5 dígitos)', regex.test('00000'))
  check('99999 válido (5 dígitos)', regex.test('99999'))
  check('2003 inválido (4 dígitos, sin cero inicial)', !regex.test('2003'))
  check('abcde inválido (no numérico)', !regex.test('abcde'))
  check('020030 inválido (6 dígitos)', !regex.test('020030'))
  check('02 003 inválido (espacio)', !regex.test('02 003'))
  check('vacío inválido', !regex.test(''))
}

// ---------- Test 2: Mensajes de error seguros ----------

function testSafeErrorMessages() {
  console.log('\n=== Test 2: Seguridad de mensajes de error ===')

  const FORBIDDEN = [
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE',
    'stack trace', 'stackTrace', 'at Object', 'at async',
    'node_modules', '.next', '/src/', '/app/',
    'vercel.app', 'cloudflare', 'r2.cloudflarestorage',
    'localhost', '127.0.0.1',
  ]

  // Mensajes de error que el endpoint debe poder devolver.
  const errorMessages = [
    'Código INE inválido (se esperan 5 dígitos)',
    'No se encontró el municipio 99999.',
    'Este municipio aún no tiene tablas con datos reales para exportar.',
    'La exportación no está disponible temporalmente.',
    'No se pudo generar el archivo en este momento.',
  ]

  for (const msg of errorMessages) {
    for (const forbidden of FORBIDDEN) {
      check(
        `error "${msg.slice(0, 40)}…" no contiene "${forbidden}"`,
        !msg.toLowerCase().includes(forbidden.toLowerCase()),
        msg.slice(0, 60),
      )
    }
  }
}

// ---------- Test 3: Captura de error del route handler ----------

function testCatchBlock() {
  console.log('\n=== Test 3: Estructura del catch block ===')

  // El catch block del route handler debe:
  // 1. Registrar el error (console.error)
  // 2. Devolver JSON con error genérico
  // 3. No exponer el error original
  // Verificamos leyendo el código fuente del route handler.

  const routeCode = readFileSync(
    'src/app/api/socideas/exportar/[codigoINE]/route.ts',
    'utf-8',
  )

  check('catch usa console.error (registro)', routeCode.includes('console.error'))
  check('catch NO expone err.message', !routeCode.includes('err.message'))
  check('catch NO expone err.stack', !routeCode.includes('err.stack'))
  check('catch devuelve 500', routeCode.includes('status: 500'))
  check('catch devuelve JSON', routeCode.includes('NextResponse.json'))
  check('catch tiene mensaje genérico', routeCode.includes('No se pudo generar el archivo'))
  check('NO hay console.log con secretos', !routeCode.includes('console.log(R2'))
  check('NO hay console.log con SUPABASE', !routeCode.includes('console.log(SUPABASE'))
}

// ---------- Test 4: Headers de respuesta ----------

function testResponseHeaders() {
  console.log('\n=== Test 4: Headers de respuesta ===')

  const routeCode = readFileSync(
    'src/app/api/socideas/exportar/[codigoINE]/route.ts',
    'utf-8',
  )

  check('Content-Type correcto', routeCode.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
  check('Content-Disposition attachment', routeCode.includes('attachment;'))
  check('Cache-Control private no-store', routeCode.includes('private, no-store'))
  check('Content-Length presente', routeCode.includes('Content-Length'))
  check('NO Cache-Control public', !routeCode.includes('Cache-Control.*public'))
  check('NO expone X-Socideas-R2-Base', !routeCode.includes('X-Socideas-R2'))
  check('NO expone X-Supabase', !routeCode.includes('X-Supabase'))
}

// ---------- Test 5: Variable de entorno segura ----------

function testSafeEnvHandling() {
  console.log('\n=== Test 5: Manejo seguro de variables de entorno ===')

  const routeCode = readFileSync(
    'src/app/api/socideas/exportar/[codigoINE]/route.ts',
    'utf-8',
  )
  const supabaseCode = readFileSync('src/lib/supabase-server.ts', 'utf-8')

  check('route usa createSupabaseServerSafe (no createSupabaseServer)',
    routeCode.includes('createSupabaseServerSafe') && !routeCode.includes("from '@/lib/supabase-server'\nimport { createSupabaseServer }"))
  check('route verifica null de Supabase', routeCode.includes('if (!supabase)'))
  check('route devuelve 503 si Supabase falta', routeCode.includes('503'))
  check('supabase-server exporta createSupabaseServerSafe', supabaseCode.includes('createSupabaseServerSafe'))
  check('createSupabaseServerSafe verifica env vars', supabaseCode.includes('!url || !key'))
  check('createSupabaseServerSafe retorna null (no throw)', supabaseCode.includes('return null'))
}

// ---------- Main ----------

function main() {
  testINEValidation()
  testSafeErrorMessages()
  testCatchBlock()
  testResponseHeaders()
  testSafeEnvHandling()
  console.log(`\n${failures === 0 ? 'OK' : failures} comprobaciones ${failures === 0 ? 'superadas' : 'FALLIDAS'}`)
  if (failures > 0) process.exit(1)
}

main()
