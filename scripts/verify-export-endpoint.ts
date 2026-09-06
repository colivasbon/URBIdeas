// Prueba del ENDPOINT real de descarga XLSX (requiere servidor local).
// Descarga vía HTTP GET /api/socideas/exportar/[codigoINE] y verifica que el
// archivo es un libro SOCideas corporativo (no un bruto INE): cabecera,
// hojas 00/01/02, fill mineral, trazabilidad con exclusiones, ND sin ceros,
// sin secretos. Municipios reales: 02069 (medio con economía) y
// 28143 (pequeño, serie demográfica larga).
// Uso (con `npm run dev` en otro terminal):
//   npx tsx scripts/verify-export-endpoint.ts [baseUrl]
// Guarda copia en tmp/endpoint-{ine}.xlsx (ignorado por git).
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const CASES = [
  { ine: '02069', label: 'medio con economía' },
  { ine: '02081', label: 'medio con economía' },
  { ine: '28143', label: 'pequeño con serie larga' },
]
const FORBIDDEN = [/token/i, /supabase/i, /localhost/i, /x-sync/i, /bearer/i, /password/i, /api[_-]?key/i, /\br2\b/i]

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

async function main(): Promise<void> {
  for (const c of CASES) {
    console.log(`\n=== ${c.ine} (${c.label}) ===`)
    const res = await fetch(`${BASE}/api/socideas/exportar/${c.ine}`)
    check('HTTP 200', res.status === 200, `status ${res.status}`)
    if (res.status !== 200) {
      check('cuerpo de error trazable', (await res.text()).length > 0)
      continue
    }
    const ct = res.headers.get('content-type') ?? ''
    check('content-type XLSX real', ct.includes('spreadsheetml.sheet'), ct)
    const cd = res.headers.get('content-disposition') ?? ''
    const m = cd.match(/filename="([^"]+)"/)
    check('attachment con nombre SOCideas_*_tablas.xlsx', !!m && /^SOCideas_.+_\d{5}_tablas\.xlsx$/.test(m[1]), m?.[1] ?? cd)
    const buf = Buffer.from(await res.arrayBuffer())
    check('firma ZIP (PK) y no vacío', buf.length > 0 && buf[0] === 0x50 && buf[1] === 0x4b, `${buf.length} B`)
    const file = `tmp/endpoint-${c.ine}.xlsx`
    writeFileSync(file, buf)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const names = wb.worksheets.map((w) => w.name)
    check('hojas 00/01/02 (sin 03 sin datos)', JSON.stringify(names) === JSON.stringify(['00_Resumen', '01_Demografía', '02_Economía']), names.join(','))
    const resumen = wb.getWorksheet('00_Resumen')
    const titleFill = (resumen?.getRow(1).getCell(1).fill as ExcelJS.FillPattern)?.fgColor?.argb
    const titleText = String(resumen?.getRow(1).getCell(1).value ?? '')
    check('identidad Ideas (marca + #3E665C)', titleText.includes('Ideas Sostenibilidad') && titleFill === 'FF3E665C', `${titleText.slice(0, 40)} / ${titleFill}`)
    let cols8 = false; let excl = false; let cero = false
    resumen?.eachRow((row) => {
      const joined = (row.values as unknown[]).map((x) => String((x as { value?: unknown })?.value ?? x ?? '')).join('|')
      if (joined.includes('Bloque') && joined.includes('Observación')) cols8 = true
      if (joined.includes('03_Secciones censales')) excl = true
      if (joined.includes('nunca equivale a 0')) cero = true
    })
    check('trazabilidad Bloque…Observación + exclusión 03 + regla cero', cols8 && excl && cero)
    const ecoTitles: string[] = []
    wb.getWorksheet('02_Economía')?.eachRow((row) => {
      const vals = row.values as unknown[]
      const a = String((vals[1] as { value?: unknown })?.value ?? vals[1] ?? '')
      const b = String((vals[2] as { value?: unknown })?.value ?? vals[2] ?? '')
      if (a !== '' && a === b && !a.startsWith('Fuente:') && !a.startsWith('Ideas Sostenibilidad')) ecoTitles.push(a)
    })
    const hasGini = ecoTitles.some((t) => /gini|p80/i.test(t))
    const hasRenta = ecoTitles.some((t) => /renta anual/i.test(t))
    if (c.ine === '28143') {
      check('desigualdad suprimida: sin tablas gini/p80 (secreto, no ceros)', !hasGini, ecoTitles.join(' + '))
      check('renta real sí exportada', hasRenta)
    } else {
      check('renta real exportada', hasRenta)
      check('gini real exportado', hasGini)
    }
    let headerOk = false; let accentOk = false; let oldGreen = false
    const widthBad: string[] = []
    for (const ws of wb.worksheets) {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const fill = (cell.fill as ExcelJS.FillPattern)?.fgColor?.argb
          if (fill === 'FF1E4D3F') oldGreen = true
          if (cell.value === 'Año') {
            const font = cell.font as ExcelJS.Font
            const bottom = (cell.border as ExcelJS.Borders | undefined)?.bottom as { color?: { argb?: string } } | undefined
            if (fill === 'FF3E665C' && font.bold && font.color?.argb === 'FFFFFFFF') headerOk = true
            if (bottom?.color?.argb === 'FF86B73D') accentOk = true
          }
        })
      })
      for (let ci = 1; ci <= ws.columnCount; ci += 1) {
        const w = ws.getColumn(ci).width ?? 0
        if (w > 48 || w === 46) widthBad.push(`${ws.name} C${ci}=${w}`)
      }
    }
    check('cabeceras #3E665C + blanco negrita', headerOk)
    check('acento #86B73D en cabeceras', accentOk)
    check('ausencia del verde anterior #1E4D3F', !oldGreen)
    check('anchos ≤48 y sin fijo 46', widthBad.length === 0, widthBad.slice(0, 3).join(' | '))
    // Política de ceros: prohibidos en todas las tablas SALVO pirámide por edad
    // y sexo, cuyos conteos 0 son publicables y reales en municipios pequeños
    // (verificado: INE publica el tramo; el 0 es recuento, no supresión).
    // Gini/P80-P20/rentas/empresas/población con 0 = supresión o error → FAIL.
    let currentTitle = ''
    const badZeros: string[] = []
    let piramideZeros = 0
    const cellText = (x: unknown): string => String((x as { value?: unknown })?.value ?? x ?? '')
    for (const ws of wb.worksheets) {
      if (ws.name === '00_Resumen') continue
      ws.eachRow((row) => {
        const vals = row.values as unknown[]
        const a = cellText(vals[1])
        const b = cellText(vals[2])
        const c = cellText(vals[3])
        if (a === '' && b === '' && c === '') { currentTitle = ''; return }
        if (a !== '' && b === a && (c === a || c === '')) {
          if (!a.startsWith('Fuente:') && !a.startsWith('Ideas Sostenibilidad')) currentTitle = a
          return
        }
        const allow = /pirámide|edad y sexo/i.test(currentTitle)
        row.eachCell((cell) => {
          if (typeof cell.value === 'number' && cell.value === 0) {
            if (allow) piramideZeros += 1
            else badZeros.push(`${ws.name}/${currentTitle || a}`)
          }
        })
      })
    }
    check('cero ceros indebidos (gini/renta/empresas/población)', badZeros.length === 0, badZeros.slice(0, 3).join(' | '))
    console.log(`INFO — ceros genuinos de pirámide conservados: ${piramideZeros}`)
    const hits: string[] = []
    for (const ws of wb.worksheets) {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const s = String(cell.value ?? '')
          for (const re of FORBIDDEN) if (re.test(s)) hits.push(`${ws.name}: ${s.slice(0, 50)}`)
        })
      })
    }
    check('sin secretos ni URLs privadas', hits.length === 0, hits.slice(0, 2).join(' | '))
  }
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nEndpoint XLSX verificado: libro corporativo generado por SOCideas OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
