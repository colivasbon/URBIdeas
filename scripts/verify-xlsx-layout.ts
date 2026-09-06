// Validación de LAYOUT del XLSX corporativo (requiere servidor local).
// Descarga vía HTTP GET /api/socideas/exportar/[codigoINE] y falla (exit 1) si:
//  - falta alguna hoja principal (00/01/02) o hay hojas vacías/indebidas;
//  - existe freeze panes, xSplit o columnas fijadas;
//  - una cabecera verde sale de sus columnas reales o hay fill en celdas vacías;
//  - el autofilter sobrepasa la tabla o toca títulos/metadatos;
//  - un ancho incumple su rol (Año ≤ 11, número ≤ 14, etc.);
//  - falta #3E665C/#86B73D o aparece #1E4D3F;
//  - hay 0 donde había secreto/supresión (salvo conteos de pirámide);
//  - hay secretos, URLs privadas o datos de otro municipio.
// Casos: Bunyola 07010 + 02069 (economía rica) + 28143 (parcial con supresión).
// Uso (con `npm run dev` en otro terminal): npx tsx scripts/verify-xlsx-layout.ts [baseUrl]
// Archivos solo en tmp/ (ignorado por git).
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { columnLimitsFor } from '../src/lib/socideas-xlsx'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const CASES = [
  { ine: '07010', label: 'Bunyola' },
  { ine: '02069', label: 'economía rica' },
  { ine: '28143', label: 'parcial con supresión' },
]
const ALLOWED_DETAIL = new Set([
  '01A_Evolución demo', '01B_Edad y sexo', '01D_Comparativas demo',
  '02A_Renta', '02B_Desigualdad', '02C_Empresas', '02D_Sector primario',
])
const FORBIDDEN_SHEETS = /01C|02E|seccion/i
const SKIP_PREFIXES = ['Ideas Sostenibilidad', 'Fuente:', 'Sin tablas', 'Hojas detalladas', 'Cobertura y limitaciones', 'La ausencia', 'Tablas incluidas', 'Tablas no incluidas', 'Limitaciones']

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

const txt = (v: unknown): string => String((v as { value?: unknown })?.value ?? v ?? '')
const fillOf = (c: ExcelJS.Cell): string | undefined => (c.fill as ExcelJS.FillPattern)?.fgColor?.argb
const isHeaderCell = (c: ExcelJS.Cell): boolean => {
  const font = c.font as ExcelJS.Font | undefined
  return fillOf(c) === 'FF3E665C' && font?.bold === true && font?.color?.argb === 'FFFFFFFF'
}

interface HeaderRec { row: number; ncols: number; headers: string[] }

function headerRecords(ws: ExcelJS.Worksheet): HeaderRec[] {
  const recs: HeaderRec[] = []
  ws.eachRow((row, rn) => {
    const vals: string[] = []
    row.eachCell((c) => { vals.push(txt(c.value)) })
    if (vals.length >= 2 && vals.every((_, i) => isHeaderCell(row.getCell(i + 1)))) {
      const first = vals[0] ?? ''
      if (SKIP_PREFIXES.some((p) => first.startsWith(p))) return
      recs.push({ row: rn, ncols: vals.length, headers: vals })
    }
  })
  return recs
}

function dataRows(ws: ExcelJS.Worksheet, rec: HeaderRec): { rn: number; vals: string[] }[] {
  const out: { rn: number; vals: string[] }[] = []
  for (let r = rec.row + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r)
    const vals: string[] = []
    row.eachCell((c) => { vals.push(txt(c.value)) })
    if (vals.every((s) => s === '')) break
    if (vals.some((_, i) => isHeaderCell(row.getCell(i + 1)))) break
    const first = vals[0] ?? ''
    if (SKIP_PREFIXES.some((p) => first.startsWith(p))) break
    out.push({ rn: r, vals })
  }
  return out
}

async function main(): Promise<void> {
  for (const c of CASES) {
    console.log(`\n=== ${c.ine} (${c.label}) ===`)
    const res = await fetch(`${BASE}/api/socideas/exportar/${c.ine}`)
    check('HTTP 200', res.status === 200, `status ${res.status}`)
    if (res.status !== 200) continue
    check('content-type XLSX', (res.headers.get('content-type') ?? '').includes('spreadsheetml.sheet'))
    const cd = res.headers.get('content-disposition') ?? ''
    const m = cd.match(/filename="([^"]+)"/)
    check('nombre SOCideas_*_tablas.xlsx', !!m && /^SOCideas_.+_\d{5}_tablas\.xlsx$/.test(m[1]), m?.[1])
    const buf = Buffer.from(await res.arrayBuffer())
    check('firma ZIP y no vacío', buf.length > 0 && buf[0] === 0x50 && buf[1] === 0x4b, `${buf.length} B`)
    const file = `tmp/xlsx-layout-${c.ine}.xlsx`
    writeFileSync(file, buf)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const names = wb.worksheets.map((w) => w.name)
    check('hojas 00/01/02', ['00_Resumen', '01_Demografía', '02_Economía'].every((n) => names.includes(n)), names.join(','))
    const detail = names.filter((n) => !['00_Resumen', '01_Demografía', '02_Economía'].includes(n))
    check('detalle solo permitido y con datos', detail.every((n) => ALLOWED_DETAIL.has(n)), detail.join(',') || '—')
    check('sin 01C/02E/secciones', !names.some((n) => FORBIDDEN_SHEETS.test(n)))

    let frozen = false
    let green348 = false
    let accent = false
    let oldGreen = false
    for (const ws of wb.worksheets) {
      for (const v of ws.views ?? []) {
        if (v.state === 'frozen' || v.xSplit || v.ySplit) frozen = true
      }
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const f = fillOf(cell)
          if (f === 'FF3E665C') green348 = true
          if (f === 'FF1E4D3F') oldGreen = true
          const b = cell.border as ExcelJS.Borders | undefined
          for (const side of [b?.top, b?.bottom, b?.left, b?.right]) {
            const col = (side as { color?: { argb?: string } } | undefined)?.color?.argb
            if (col === 'FF86B73D') accent = true
          }
        })
      })
    }
    check('sin freeze panes ni splits', !frozen)
    check('principal #3E665C presente', green348)
    check('acento #86B73D presente', accent)
    check('sin #1E4D3F', !oldGreen)

    // Cabeceras exactas + autofilter exacto + anchos por rol + alineación.
    const widthBad: string[] = []
    const alignBad: string[] = []
    const filterBad: string[] = []
    const headerBad: string[] = []
    for (const ws of wb.worksheets) {
      const recs = headerRecords(ws)
      // Anchos: intersección de roles por columna (hojas de familia coherente).
      const rolesByCol = new Map<number, [number, number][]>()
      for (const rec of recs) {
        rec.headers.forEach((h, i) => {
          if (!h) return
          const arr = rolesByCol.get(i + 1) ?? []
          arr.push(columnLimitsFor(h, i === 0))
          rolesByCol.set(i + 1, arr)
        })
      }
      for (const [ci, roles] of rolesByCol) {
        const lo = Math.max(...roles.map((r) => r[0]))
        const hi = Math.min(...roles.map((r) => r[1]))
        const w = ws.getColumn(ci).width ?? 0
        if (lo > hi) widthBad.push(`${ws.name} C${ci} roles incompatibles`)
        else if (w < lo || w > hi) widthBad.push(`${ws.name} C${ci}=${w} (rol ${lo}-${hi})`)
      }
      for (const rec of recs) {
        // Fill verde solo dentro de [1..ncols] en la fila de cabecera.
        for (let ci = rec.ncols + 1; ci <= ws.columnCount; ci += 1) {
          if (fillOf(ws.getRow(rec.row).getCell(ci)) === 'FF3E665C') {
            headerBad.push(`${ws.name} R${rec.row} fill tras col ${rec.ncols}`)
          }
        }
        const rows = dataRows(ws, rec)
        if (rows.length === 0) headerBad.push(`${ws.name} R${rec.row} sin filas de datos`)
        for (const dr of rows) {
          rec.headers.forEach((h, i) => {
            if (!h) return
            const cell = ws.getRow(dr.rn).getCell(i + 1)
            const exp = h === 'Año' || h === 'Estado' || h === 'Incluida' ? 'center' : i === 0 ? 'left' : 'right'
            const got = cell.alignment?.horizontal
            if (typeof cell.value === 'number' || (typeof cell.value === 'string' && h === 'Año')) {
              if (got !== exp) alignBad.push(`${ws.name} R${dr.rn}C${i + 1} ${got ?? '?'}≠${exp}`)
            }
          })
        }
      }
      const af = ws.autoFilter
      if (af && typeof af === 'object' && 'from' in af) {
        const from = (af as { from: { row: number; column: number }; to: { row: number; column: number } }).from
        const to = (af as { from: { row: number; column: number }; to: { row: number; column: number } }).to
        const rec = recs.find((r) => r.row === from.row)
        if (!rec || to.column > rec.ncols || to.row <= from.row) {
          filterBad.push(`${ws.name} autofilter fuera de tabla`)
        }
      }
    }
    check('cabeceras exactas (sin verde tras última columna, con datos)', headerBad.length === 0, headerBad.slice(0, 3).join(' | '))
    check('autofilter exacto', filterBad.length === 0, filterBad.slice(0, 2).join(' | '))
    check('anchos por rol', widthBad.length === 0, widthBad.slice(0, 4).join(' | '))
    let w9 = false
    for (const ws of wb.worksheets) {
      for (let ci = 1; ci <= ws.columnCount; ci += 1) {
        if (ws.getColumn(ci).width === 9) w9 = true
      }
    }
    check('ninguna columna con ancho 9 (quirk ExcelJS: no se serializa)', !w9)
    check('alineación por rol', alignBad.length === 0, alignBad.slice(0, 3).join(' | '))

    // Ceros: prohibidos salvo conteos de pirámide (01B).
    const badZeros: string[] = []
    let piramideZeros = 0
    for (const ws of wb.worksheets) {
      if (ws.name === '00_Resumen') continue
      const allow = ws.name === '01B_Edad y sexo'
      ws.eachRow((row) => {
        row.eachCell((c) => {
          if (typeof c.value === 'number' && c.value === 0) {
            if (allow) piramideZeros += 1
            else badZeros.push(`${ws.name} R${row.number}`)
          }
        })
      })
    }
    check('cero ceros indebidos', badZeros.length === 0, badZeros.slice(0, 3).join(' | '))
    console.log(`INFO — ceros genuinos de pirámide: ${piramideZeros}`)

    // Secretos, municipio ajeno e hipervínculos.
    const hits: string[] = []
    let wrongMuni = false
    let links = 0
    for (const ws of wb.worksheets) {
      if (ws.name !== '00_Resumen') {
        const title = txt(ws.getRow(1).getCell(1).value)
        if (!title.includes(c.ine)) wrongMuni = true
      }
      ws.eachRow((row) => {
        row.eachCell((c) => {
          const s = txt(c.value)
          for (const re of [/token/i, /supabase/i, /localhost/i, /x-sync/i, /bearer/i, /password/i, /api[_-]?key/i, /\br2\b/i]) {
            if (re.test(s)) hits.push(`${ws.name}: ${s.slice(0, 50)}`)
          }
          const link = (c.value as { hyperlink?: string } | null)?.hyperlink ?? (c as { hyperlink?: string }).hyperlink ?? ''
          if (typeof link === 'string' && link.startsWith('#')) links += 1
        })
      })
    }
    check('sin secretos ni URLs privadas', hits.length === 0, hits.slice(0, 2).join(' | '))
    check('todas las hojas son del municipio', !wrongMuni)
    console.log(`INFO — hipervínculos internos: ${links}`)

    // Tabla de anchos para el informe (Bunyola y resto).
    console.log(`--- Anchos ${c.ine} ---`)
    for (const ws of wb.worksheets) {
      const cols: string[] = []
      for (let ci = 1; ci <= ws.columnCount; ci += 1) cols.push(`C${ci}=${ws.getColumn(ci).width ?? 0}`)
      console.log(`${ws.name}: ${cols.join(' ')}`)
    }
  }
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nLayout XLSX verificado: hojas, rangos, anchos, alineación y colores OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
