// Verificación de la integración UI/XLSX de los saldos migratorios (69767).
// Lee los objetos reales de producción (URL pública) y comprueba identidades,
// el DTO de presentación y las tablas XLSX. Solo lectura, sin escrituras.
import { buildMigrationBalancePresentation } from '../src/lib/socideas-migration-balances'
import { buildSaldosMigratoriosTables } from '../src/lib/socideas-ine-layers-export'
import type { MunicipalIneLayersV1 } from '../src/lib/socideas-ine-layers'

const BASE = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ?? 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const CODES = ['28079', '02003', '28174', '41091', '15030', '01001', '07010']

;(async () => {
  let pass = 0
  let fail = 0
  for (const c of CODES) {
    const url = `${BASE}/socideas/ine-layers/v1/municipal/${c}.json?cb=${Date.now()}`
    let j: MunicipalIneLayersV1
    try {
      j = (await (await fetch(url)).json()) as MunicipalIneLayersV1
    } catch (e) {
      console.log(`${c}: fetch ERR ${(e as Error).message}`)
      fail++
      continue
    }
    const dto = buildMigrationBalancePresentation(j)
    if (!dto) {
      console.log(`${c}: SIN DTO (capa migrationBalance ausente)`)
      fail++
      continue
    }
    const t = dto.total.value, i = dto.interior.value, e = dto.exterior.value
    const m = dto.bySex?.male.total.value ?? null
    const f = dto.bySex?.female.total.value ?? null
    const okSum = t !== null && i !== null && e !== null ? t === i + e : null
    const okSex = t !== null && m !== null && f !== null ? t === m + f : null
    const tabs = buildSaldosMigratoriosTables(j) ?? []
    // ND nunca como 0: ninguna celda de valor debe ser "0" cuando el dato es nulo.
    const zeros = tabs
      .flatMap((tb) => tb.filas)
      .flat()
      .filter((cell) => cell.text === '0' && cell.numeric === null).length
    const ok = (okSum === true && okSex === true && zeros === 0 && tabs.length === 3)
    console.log(
      `${c}: total=${t} ext=${e} int=${i} H=${m} M=${f} | T=ext+int:${okSum} T=H+M:${okSex} | tablas=${tabs.length} | "0" falsos=${zeros} => ${ok ? 'PASS' : 'FAIL'}`,
    )
    if (ok) pass++
    else fail++
  }
  console.log(`\nRESULTADO: ${pass}/${CODES.length} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
})().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
