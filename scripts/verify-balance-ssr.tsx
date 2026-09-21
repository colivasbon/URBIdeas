// Smoke SSR real del bloque "Saldo migratorio neto": renderiza el componente a
// HTML estático con el DTO construido desde los datos reales de producción.
// No usa el dev-server; llama directamente a la lógica server-side.
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { SaldosMigratoriosBlock } from '../src/components/socideas/MigrationBlocks'
import { buildMigrationBalancePresentation } from '../src/lib/socideas-migration-balances'
import type { MunicipalIneLayersV1 } from '../src/lib/socideas-ine-layers'

const BASE = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ?? 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const CODES = ['28079', '02003', '28174']

;(async () => {
  let fail = 0
  for (const c of CODES) {
    const j = (await (await fetch(`${BASE}/socideas/ine-layers/v1/municipal/${c}.json?cb=${Date.now()}`)).json()) as MunicipalIneLayersV1
    const dto = buildMigrationBalancePresentation(j)
    if (!dto) {
      console.log(`${c}: SIN DTO`)
      fail++
      continue
    }
    const html = renderToStaticMarkup(createElement(SaldosMigratoriosBlock, { data: dto }))
    const checks = ['Saldo migratorio neto', 'Saldo total', 'Saldo exterior', 'Saldo interior', 'no es el número total de movimientos']
    const missing = checks.filter((s) => !html.includes(s))
    const ndIfZero = /(^|>)\s*0\s*(<|$)/.test(html.replace(/<[^>]*>/g, ' '))
    console.log(`${c}: html ${html.length} B | faltan=${missing.length ? missing.join(',') : 'ninguno'} | ND-ok=${!ndIfZero}`)
    if (missing.length > 0) fail++
  }
  console.log(`\nRESULTADO SSR: ${CODES.length - fail}/${CODES.length} PASS`)
  if (fail > 0) process.exit(1)
})().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
