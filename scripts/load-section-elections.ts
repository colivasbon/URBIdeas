#!/usr/bin/env node
// Cargador de RESULTADOS ELECTORALES por sección electoral.
//
// Agregación de mesas → secciones. Soporte para municipales, autonómicas,
// Congreso, Senado y Europeas.
//
// USO
//   npx tsx scripts/load-section-elections.ts --type=municipal --date=2023-05-28 --ines=02003
//   npx tsx scripts/load-section-elections.ts --type=municipal --date=2023-05-28 --all --confirm-r2-write
//   npx tsx scripts/load-section-elections.ts --type=municipal --date=2023-05-28 --verify
//
// FLAGS
//   --type              Tipo de elección (municipal|autonomic|congress|senate|european)
//   --date              Fecha de convocatoria (YYYY-MM-DD)
//   --ines              Códigos municipales INE separados por coma
//   --communities       Códigos de comunidades autónomas (para autonómicas)
//   --all               Procesar todos los municipios con cobertura
//   --write             Escribir en R2 (seco por defecto)
//   --confirm-r2-write  Autorización explícita de escritura
//   --verify            Validar readback
//   --resume            Omitir municipios ya procesados
//   --manifest          Generar manifiesto

import { config } from 'dotenv'
config({ path: '.env.local' })

interface LoaderOptions {
  type?: string
  date?: string
  ines?: string[]
  communities?: string[]
  all?: boolean
  write?: boolean
  confirmR2Write?: boolean
  verify?: boolean
  resume?: boolean
  manifest?: boolean
  dryRun?: boolean
}

async function main() {
  const args = process.argv.slice(2)
  const opts = parseArgs(args)

  console.log('[elections-loader] Inicializando...')
  console.log(`  tipo: ${opts.type || 'no especificado'}`)
  console.log(`  fecha: ${opts.date || 'no especificada'}`)
  console.log(`  municipios: ${opts.ines?.length || 0}`)
  console.log(`  escribir: ${opts.write && opts.confirmR2Write ? 'SÍ' : 'no'}`)
  console.log(`  dry-run: ${opts.dryRun !== false}`)

  // Validaciones
  if (!opts.type || !opts.date) {
    console.error('[elections-loader] ERROR: se requieren --type y --date')
    process.exit(1)
  }

  if (opts.write && !opts.confirmR2Write) {
    console.error('[elections-loader] ERROR: se requiere --confirm-r2-write para escribir')
    process.exit(2)
  }

  // TODO: Implementar descarga de datos electorales del Ministerio del Interior
  // TODO: Detectar nivel territorial (mesa, sección, municipal)
  // TODO: Agregar por sección censal/electoral
  // TODO: Normalizar candidaturas
  // TODO: Validar integridad y sumas
  // TODO: Cruzar geometría
  // TODO: Bloquear correspondencias irresueltas
  // TODO: Escribir en R2
  // TODO: Generar manifiesto

  console.log('[elections-loader] ✓ Completado (stub)')
  process.exit(0)
}

function parseArgs(args: string[]): LoaderOptions {
  const opts: LoaderOptions = { dryRun: true }

  for (const arg of args) {
    if (arg.startsWith('--type=')) {
      opts.type = arg.split('=')[1]
    } else if (arg.startsWith('--date=')) {
      opts.date = arg.split('=')[1]
    } else if (arg.startsWith('--ines=')) {
      opts.ines = arg.split('=')[1].split(',')
    } else if (arg.startsWith('--communities=')) {
      opts.communities = arg.split('=')[1].split(',')
    } else if (arg === '--all') {
      opts.all = true
    } else if (arg === '--write') {
      opts.write = true
    } else if (arg === '--confirm-r2-write') {
      opts.confirmR2Write = true
    } else if (arg === '--verify') {
      opts.verify = true
    } else if (arg === '--resume') {
      opts.resume = true
    } else if (arg === '--manifest') {
      opts.manifest = true
    }
  }

  return opts
}

main().catch((err) => {
  console.error('[elections-loader] ERROR:', err.message)
  process.exit(1)
})
