// Tests de verificación de enlaces para GAL y Asociaciones.
// Ejecuta: npx tsx scripts/test-enlaces.ts

import { config } from 'dotenv'
config({ path: '.env.local' })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const TIMEOUT_MS = 30_000

type Estado = 'verificado' | 'pendiente' | 'no_verificado'

function estadoDeSonda(status: number | null, ok: boolean): Estado {
  if (status === null) return 'pendiente'
  if (status === 404 || status === 410) return 'no_verificado'
  if (ok) return 'verificado'
  return 'pendiente'
}

async function sondearUrl(url: string): Promise<{ status: number | null; ok: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    return { status: res.status, ok: res.ok }
  } catch {
    return { status: null, ok: false }
  }
}

interface TestCase {
  nombre: string
  fn: () => Promise<boolean> | boolean
}

const tests: TestCase[] = [
  {
    nombre: 'estadoDeSonda: HTTP 200 → verificado',
    fn: () => estadoDeSonda(200, true) === 'verificado',
  },
  {
    nombre: 'estadoDeSonda: HTTP 301 → verificado',
    fn: () => estadoDeSonda(301, true) === 'verificado',
  },
  {
    nombre: 'estadoDeSonda: HTTP 404 → no_verificado',
    fn: () => estadoDeSonda(404, false) === 'no_verificado',
  },
  {
    nombre: 'estadoDeSonda: HTTP 410 → no_verificado',
    fn: () => estadoDeSonda(410, false) === 'no_verificado',
  },
  {
    nombre: 'estadoDeSonda: timeout → pendiente',
    fn: () => estadoDeSonda(null, false) === 'pendiente',
  },
  {
    nombre: 'estadoDeSonda: HTTP 500 → pendiente',
    fn: () => estadoDeSonda(500, false) === 'pendiente',
  },
  {
    nombre: 'sondearUrl: URL válida responde',
    fn: async () => {
      const r = await sondearUrl('https://www.adesiman.com/')
      return r.status === 200 && r.ok
    },
  },
  {
    nombre: 'sondearUrl: URL inválida → null',
    fn: async () => {
      const r = await sondearUrl('https://www.sitio-inexistente-12345.com/')
      return r.status === null && !r.ok
    },
  },
]

async function runTests(): Promise<void> {
  console.log('=== TESTS DE VERIFICACIÓN DE ENLACES ===\n')
  let passed = 0
  let failed = 0

  for (const test of tests) {
    try {
      const result = await test.fn()
      if (result) {
        console.log(`✓ ${test.nombre}`)
        passed++
      } else {
        console.log(`✗ ${test.nombre}`)
        failed++
      }
    } catch (err) {
      console.log(`✗ ${test.nombre} (ERROR: ${err instanceof Error ? err.message : 'desconocido'})`)
      failed++
    }
  }

  console.log(`\n=== RESULTADO: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) process.exit(1)
}

void runTests()
