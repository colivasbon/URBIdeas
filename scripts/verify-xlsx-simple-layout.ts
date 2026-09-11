// Validación del layout XLSX SIMPLE (requiere servidor local).
// Descarga vía HTTP GET /api/socideas/exportar/[codigoINE] y falla (exit 1) si:
//  - no hay exactamente 3 hojas (00_Resumen, 01_Demografía, 02_Economía);
//  - existe alguna hoja 01A/01B/01C/01D/02A/02B/02C/02D/02E;
//  - existe freeze panes, splits, columnas fijadas o autofilter;
//  - existe algún hipervínculo interno;
//  - alguna columna temática supera ancho 24 (Año debe ser 10);
//  - una cabecera verde sobrepasa su última columna real;
//  - hay fill verde en celdas vacías tras una cabecera;
//  - aparecen textos de índice/trazabilidad prohibidos;
//  - se usa #1E4D3F o falta #3E665C/#86B73D;
//  - se exporta un suprimido como 0 (salvo conteos de pirámide);
//  - hay secretos, URLs privadas o datos de otro municipio.
// Casos: 02003 (Albacete), 02069 (economía rica), 28143 (parcial),
// 07010 (Bunyola).
// Uso (con `npm run dev` en otro terminal): npx tsx scripts/verify-xlsx-simple-layout.ts [baseUrl]
// Archivos solo en tmp/ (ignorado por git).
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const CASES = [
  { ine: '02003', label: 'Albacete' },
  { ine: '02069', label: 'economía rica' },
  { ine: '28143', label: 'parcial con supresión' },
  { ine: '07010', label: 'Bunyola' },
]
const MAIN_SHEETS = [
  '00_PROYECTO',
  '01_PERFIL_DEMOGRÁFICO',
  '02_CONTEXTO_POLÍTICO',
  '03_CONTEXTO_ECONÓMICO',
  '04_CONTEXTO_SOCIOCULTURAL',
  '05_PATRIMONIO_Y_TURISMO',
  '06_INFRAESTRUCTURA_Y_RECURSOS',
  '07_ASOCIACIONES',
  '08_CRITERIOS_Y_FUENTES',
]
const DETAIL_RE = /^(01|02)[A-E]_/
const FORBIDDEN_TEXT = ['Hojas detalladas', 'Tablas incluidas', 'Cobertura y limitaciones', 'Observación', 'Incluida', '03_Secciones']

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

const txt = (v: unknown): string => String((v as { value?: unknown })?.value ?? v ?? '')
const fillOf = (c: ExcelJS.Cell): string | undefined => (c.fill as ExcelJS.FillPattern)?.fgColor?.argb
const isGreen = (c: ExcelJS.Cell): boolean => {
  const font = c.font as ExcelJS.Font | undefined
  return fillOf(c) === 'FF3E665C' && font?.bold === true && font?.color?.argb === 'FFFFFFFF'
}
function hasGreen(c: ExcelJS.Cell): boolean {
  return fillOf(c) === 'FF3E665C'
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
    check('nombre SOCideas_*_libro.xlsx', !!m && /^SOCideas_.+_\d{5}_libro\.xlsx$/.test(m[1]), m?.[1])
    const buf = Buffer.from(await res.arrayBuffer())
    check('firma ZIP y no vacío', buf.length > 0 && buf[0] === 0x50 && buf[1] === 0x4b, `${buf.length} B`)
    const file = `tmp/xlsx-simple-${c.ine}.xlsx`
    writeFileSync(file, buf)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const names = wb.worksheets.map((w) => w.name)
    check('exactamente nueve hojas en orden contractual', JSON.stringify(names) === JSON.stringify(MAIN_SHEETS), names.join(','))
    check('sin hojas detalladas', !names.some((n) => DETAIL_RE.test(n)), names.join(','))

    let frozen = false
    let filtered = false
    let links = 0
    let green348 = false
    let accent = false
    let oldGreen = false
    const forbiddenFound: string[] = []
    for (const ws of wb.worksheets) {
      for (const v of ws.views ?? []) {
        if (v.state === 'frozen' || v.xSplit || v.ySplit) frozen = true
      }
      if (ws.autoFilter) filtered = true
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const s = txt(cell.value)
          const link = (cell.value as { hyperlink?: unknown } | null)?.hyperlink ?? (cell as { hyperlink?: unknown }).hyperlink
          if (typeof link === 'string' && link.startsWith('#')) links += 1
          if (s.startsWith('#')) links += 1
          const f = fillOf(cell)
          if (f === 'FF3E665C') green348 = true
          if (f === 'FF1E4D3F') oldGreen = true
          const b = cell.border as ExcelJS.Borders | undefined
          for (const side of [b?.top, b?.bottom, b?.left, b?.right]) {
            const col = (side as { color?: { argb?: string } } | undefined)?.color?.argb
            if (col === 'FF86B73D') accent = true
          }
          for (const t of FORBIDDEN_TEXT) {
            if (s.includes(t)) forbiddenFound.push(`${ws.name}: ${t}`)
          }
        })
      })
    }
    check('sin freeze panes ni splits', !frozen)
    check('sin autofilter', !filtered)
    check('sin enlaces internos', links === 0, `${links}`)
    check('principal #3E665C presente', green348)
    check('acento #86B73D presente', accent)
    check('sin #1E4D3F', !oldGreen)
    check('sin textos de índice/trazabilidad', forbiddenFound.length === 0, forbiddenFound.slice(0, 3).join(' | '))

    // Cabeceras exactas: verde solo en [1..ncols]; anchos: Año 10, resto ≤24.
    const headerBad: string[] = []
    const widthBad: string[] = []
    const alignBad: string[] = []
    for (const ws of wb.worksheets) {
      if (ws.name === '00_PROYECTO' || ws.name === '08_CRITERIOS_Y_FUENTES') continue
      // Detecta filas de cabecera: ≥2 celdas verdes contiguas desde col 1.
      ws.eachRow((row, rn) => {
        let ncols = 0
        for (let ci = 1; ci <= ws.columnCount; ci += 1) {
          if (isGreen(row.getCell(ci))) ncols = ci
          else break
        }
        if (ncols < 2) return
        for (let ci = ncols + 1; ci <= ws.columnCount; ci += 1) {
          if (hasGreen(row.getCell(ci))) headerBad.push(`${ws.name} R${rn} verde tras col ${ncols}`)
        }
        // Datos bajo la cabecera hasta fila vacía u otra cabecera.
        for (let r = rn + 1; r <= ws.rowCount; r += 1) {
          const dr = ws.getRow(r)
          const first = txt(dr.getCell(1).value)
          if (first === '') break
          if (isGreen(dr.getCell(1))) break
          for (let ci = 1; ci <= ncols; ci += 1) {
            const cell = dr.getCell(ci)
            const h = txt(ws.getRow(rn).getCell(ci).value)
            const exp = h === 'Año' ? 'center' : ci === 1 ? 'left' : 'right'
            const got = cell.alignment?.horizontal
            if ((typeof cell.value === 'number' || h === 'Año') && got !== exp) {
              alignBad.push(`${ws.name} R${r}C${ci} ${got ?? '?'}≠${exp}`)
            }
          }
        }
      })
      for (let ci = 1; ci <= ws.columnCount; ci += 1) {
        const w = ws.getColumn(ci).width ?? 0
        if (w > 24) widthBad.push(`${ws.name} C${ci}=${w}`)
      }
      // Columna Año compacta (10) donde exista cabecera Año.
      ws.eachRow((row) => {
        row.eachCell((cell, cn) => {
          if (txt(cell.value) === 'Año') {
            const w = ws.getColumn(cn).width ?? 0
            if (w !== 10) widthBad.push(`${ws.name} Año C${cn}=${w} (esperado 10)`)
          }
        })
      })
    }
    check('cabeceras exactas (sin verde sobrante)', headerBad.length === 0, headerBad.slice(0, 3).join(' | '))
    check('anchos ≤24 y Año=10', widthBad.length === 0, widthBad.slice(0, 4).join(' | '))
    check('alineación por rol', alignBad.length === 0, alignBad.slice(0, 3).join(' | '))

    // Ceros: prohibidos salvo conteos del bloque pirámide (recuentos reales).
    const badZeros: string[] = []
    let piramideZeros = 0
    for (const ws of wb.worksheets) {
      if (ws.name === '00_PROYECTO' || ws.name === '08_CRITERIOS_Y_FUENTES') continue
      let pirStart = -1
      let pirEnd = -1
      ws.eachRow((row, rn) => {
        const first = txt(row.getCell(1).value)
        if (first.startsWith('Estructura por edad y sexo')) pirStart = rn
        else if (pirStart > 0 && pirEnd < 0 && first === '') pirEnd = rn
      })
      ws.eachRow((row, rn) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'number' && cell.value === 0) {
            if (pirStart > 0 && rn > pirStart && (pirEnd < 0 || rn < pirEnd)) piramideZeros += 1
            else badZeros.push(`${ws.name} R${rn}`)
          }
        })
      })
    }
    check('cero suprimidos como cero', badZeros.length === 0, badZeros.slice(0, 3).join(' | '))
    console.log(`INFO — ceros genuinos de pirámide: ${piramideZeros}`)

    const hits: string[] = []
    let wrongMuni = false
    for (const ws of wb.worksheets) {
      if (ws.name !== '00_PROYECTO' && ws.name !== '08_CRITERIOS_Y_FUENTES') {
        if (!txt(ws.getRow(1).getCell(1).value).includes(c.ine)) wrongMuni = true
      }
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const s = txt(cell.value)
          for (const re of [/token/i, /supabase/i, /localhost/i, /x-sync/i, /bearer/i, /password/i, /api[_-]?key/i, /\br2\b/i]) {
            if (re.test(s)) hits.push(`${ws.name}: ${s.slice(0, 50)}`)
          }
        })
      })
    }
    check('sin secretos ni URLs privadas', hits.length === 0, hits.slice(0, 2).join(' | '))
    check('todo del municipio', !wrongMuni)
  }
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nLayout XLSX municipal comparativo verificado: nueve hojas en orden contractual y formato Ideas OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
