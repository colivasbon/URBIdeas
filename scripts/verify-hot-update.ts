// Validación del hot update administrado (Fase 4) — sin red, sin R2.
// Comprueba que la interfaz está oculta fuera de entorno interno, que la ruta
// exige autorización server-side, que no hay escritura desde el navegador y que
// no puede lanzar una carga nacional. Uso: npx tsx scripts/verify-hot-update.ts
import { readFileSync } from 'node:fs'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

const ROUTE = 'src/app/api/socideas/admin/ine-layers/[codigoINE]/route.ts'
const MENU = 'src/components/socideas/ActualizacionMenu.tsx'
const ADMIN = 'src/lib/socideas-ine-layers-admin.ts'
const LOAD = 'scripts/load-ine-layers-r2.ts'

function src(path: string): string {
  return readFileSync(path, 'utf8')
}

function main(): void {
  const route = src(ROUTE)
  const menu = src(MENU)
  const admin = src(ADMIN)
  const load = src(LOAD)

  console.log('=== Autorización server-side ===')
  check('ruta con x-sync-token', route.includes('x-sync-token'))
  check('ruta con comparación en tiempo constante', route.includes('timingSafeEqual'))
  check('ruta responde 401 sin token', /401/.test(route))
  check('ruta valida INE-5', route.includes('isValidIneCode'))
  check('dry-run por defecto', /dryRun\s*=\s*url\.searchParams\.get\('dryRun'\)\s*!==\s*'false'/.test(route) || route.includes("!== 'false'"))
  check('ruta sin Supabase', !/createSupabaseServer|@supabase\/supabase-js/.test(route))
  check('ruta sin carga nacional', !/sync-all|allMunicipios|8132|batch\s+nacional/i.test(route))
  check('ruta sin R2 put', !/PutObjectCommand|@aws-sdk\/client-s3/.test(route))

  console.log('\n=== Visibilidad del botón ===')
  check('menú depende de flag interno', menu.includes('NEXT_PUBLIC_SOCIDEAS_INTERNAL'))
  check('menú no renderiza si no es interno', /if\s*\(!isInternal\)\s*return null/.test(menu))
  check('menú incluye texto "Actualizar datos"', menu.includes('Actualizar datos'))
  check('menú no usa lenguaje prohibido', !/Hot update|Refrescar API|Recargar R2|Forzar sincronización/.test(menu))
  check('menú pide confirmación previa', menu.includes('No se sobrescribirán datos publicados sin crear una versión de rollback'))
  check('menú solo invoca dry-run', menu.includes('?dryRun=true'))
  check('menú sin escritura R2 en cliente', !/@aws-sdk\/client-s3|PutObject/.test(menu))

  console.log('\n=== Aplicación bloqueada sin autorización real ===')
  check('apply no escribe', admin.includes('written: false') && admin.includes('blocked: true'))
  check('apply sin S3', !/@aws-sdk\/client-s3|PutObject/.test(admin))
  check('capa aprobada vacía (auditoría pendiente)', admin.includes('APPROVED_LAYERS_FOR_LOAD'))
  check('motivo de bloqueo explícito', admin.includes('UPDATE_BLOCKED_REASON'))

  console.log('\n=== Carga real solo por CLI con gates ===')
  check('cargador exige --confirm-r2-write', load.includes('--confirm-r2-write'))
  check('cargador exige dataset completo', load.includes('dataset.complete'))
  check('cargador exige match ≥ 99,5 %', load.includes('MATCH_GATE'))
  check('cargador usa runId inmutable', load.includes('runId') && load.includes('run-${runId}.json'))
  check('cargador escribe manifiesto latest-successful', load.includes('latest-successful.json'))
  check('cargador con prefijo autorizado', load.includes('INE_LAYERS_V1_PREFIX'))

  console.log(`\n${failures === 0 ? 'OK' : failures + ' FALLOS'} — hot update`)
  if (failures > 0) process.exit(1)
}

main()
