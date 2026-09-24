// Validación del layout XLSX del endpoint de exportación (requiere servidor).
// Descarga vía HTTP GET /api/socideas/exportar/[codigoINE] y falla (exit 1) si:
//  - no hay exactamente las 11 hojas del contrato `socideas-book@2` en orden;
//  - existe alguna hoja detallada 01A/01B/01C/01D/02A/02B/02C/02D/02E;
//  - faltan freeze panes, autofilter/tabla o enlaces internos de navegación;
//  - alguna columna supera el tope 42 (la columna A es unificada; "Año" ya no
//    se fuerza a 10, solo debe conservar el mínimo legible);
//  - una cabecera sobrepasa su última columna real;
//  - aparecen textos de hojas detalladas prohibidos del layout retirado;
//  - se usa #1E4D3F o falta #3E665C/#86B73D;
//  - se exporta un suprimido como 0 (salvo conteos de pirámide);
//  - hay secretos, URLs privadas o datos de otro municipio.
// Casos: 02003 (Albacete), 02069 (economía rica), 28143 (parcial),
// 07010 (Bunyola).
// Uso (con `npm run dev` en otro terminal): npx tsx scripts/verify-xlsx-simple-layout.ts [baseUrl]
// Archivos solo en tmp/ (ignorado por git).
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { writeFileSync } from 'node:fs'
import { SOCIDEAS_BOOK_SHEET_IDS } from '../src/lib/socideas-book-contract'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const CASES = [
  { ine: '02003', label: 'Albacete' },
  { ine: '02069', label: 'economía rica' },
  { ine: '28143', label: 'parcial con supresión' },
  { ine: '07010', label: 'Bunyola' },
]
const MAIN_SHEETS = [...SOCIDEAS_BOOK_SHEET_IDS]
const DETAIL_RE = /^(01|02)[A-E]_/
// Textos del layout retirado que no deben reaparecer. "Tablas incluidas" y las
// claves de trazabilidad v1 ya NO se prohíben: 10_METODOLOGÍA_FUENTES declara
// legítimamente la trazabilidad de las tablas incluidas.
const FORBIDDEN_TEXT = ['Hojas detalladas']

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

const txt = (v: unknown): string => String((v as { value?: unknown })?.value ?? v ?? '')
const fillOf = (c: ExcelJS.Cell): string | undefined => (c.fill as ExcelJS.FillPattern)?.fgColor?.argb
function hasGreen(c: ExcelJS.Cell): boolean {
  return fillOf(c) === 'FF3E665C'
}
/** Cabecera de tabla del contrato v2 (relleno Crisopa). */
function isHeaderCell(c: ExcelJS.Cell): boolean {
  return fillOf(c) === 'FFC2E189'
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
    check('exactamente 11 hojas en orden contractual (socideas-book@2)', JSON.stringify(names) === JSON.stringify(MAIN_SHEETS), names.join(','))
    check('sin hojas detalladas', !names.some((n) => DETAIL_RE.test(n)), names.join(','))

    let frozenSheets = 0
    let filterSheets = 0
    let green348 = false
    let accent = false
    let oldGreen = false
    const forbiddenFound: string[] = []
    for (const ws of wb.worksheets) {
      if ((ws.views ?? []).some((v) => v.state === 'frozen' || v.xSplit || v.ySplit)) frozenSheets += 1
      if (ws.autoFilter || ws.getTables().length > 0) filterSheets += 1
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const s = txt(cell.value)
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
    // Enlaces internos del contrato v2: `location="…"` en el XML (ExcelJS no
    // expone los hipervínculos internos sin relación externa al releer).
    const zip = await JSZip.loadAsync(buf)
    let internalLinks = 0
    for (const file of Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))) {
      const xml = (await zip.file(file)?.async('string')) ?? ''
      internalLinks += (xml.match(/location="/g) ?? []).length
    }
    check('freeze panes en las 11 hojas', frozenSheets === MAIN_SHEETS.length, `${frozenSheets}/${MAIN_SHEETS.length}`)
    check('autofilter o tabla nativa en cada hoja', filterSheets === MAIN_SHEETS.length, `${filterSheets}/${MAIN_SHEETS.length}`)
    check('enlaces internos de navegación ≥8', internalLinks >= 8, `${internalLinks}`)
    check('principal #3E665C presente', green348)
    check('acento #86B73D presente', accent)
    check('sin #1E4D3F', !oldGreen)
    check('sin textos de hojas detalladas', forbiddenFound.length === 0, forbiddenFound.slice(0, 3).join(' | '))

    // Cabeceras exactas: relleno Crisopa solo en [1..ncols]; anchos ≤42 y
    // columna Año con el mínimo legible (el v1 la fijaba a 10).
    const headerBad: string[] = []
    const widthBad: string[] = []
    const alignBad: string[] = []
    for (const ws of wb.worksheets) {
      if (ws.name === '00_RESUMEN' || ws.name === '10_METODOLOGÍA_FUENTES') continue
      // Detecta filas de cabecera: ≥2 celdas Crisopa contiguas desde col 1.
      ws.eachRow((row, rn) => {
        let ncols = 0
        for (let ci = 1; ci <= ws.columnCount; ci += 1) {
          if (isHeaderCell(row.getCell(ci))) ncols = ci
          else break
        }
        if (ncols < 2) return
        for (let ci = ncols + 1; ci <= ws.columnCount; ci += 1) {
          if (isHeaderCell(row.getCell(ci))) headerBad.push(`${ws.name} R${rn} cabecera tras col ${ncols}`)
        }
        // Datos bajo la cabecera hasta fila vacía u otro título de bloque.
        for (let r = rn + 1; r <= ws.rowCount; r += 1) {
          const dr = ws.getRow(r)
          const first = txt(dr.getCell(1).value)
          if (first === '') break
          if (hasGreen(dr.getCell(1))) break
          for (let ci = 1; ci <= ncols; ci += 1) {
            const cell = dr.getCell(ci)
            const h = txt(ws.getRow(rn).getCell(ci).value)
            const exp = h === 'Año' || h === 'Período' ? 'center' : ci === 1 ? 'left' : 'right'
            const got = cell.alignment?.horizontal
            if ((typeof cell.value === 'number' || h === 'Año' || h === 'Período') && got !== exp) {
              alignBad.push(`${ws.name} R${r}C${ci} ${got ?? '?'}≠${exp}`)
            }
          }
        }
      })
      for (let ci = 1; ci <= ws.columnCount; ci += 1) {
        const w = ws.getColumn(ci).width ?? 0
        if (w > 42) widthBad.push(`${ws.name} C${ci}=${w}`)
      }
      // Columna Año con el mínimo legible (la columna A es unificada en v2).
      ws.eachRow((row) => {
        row.eachCell((cell, cn) => {
          if (txt(cell.value) === 'Año') {
            const w = ws.getColumn(cn).width ?? 0
            if (w < 10) widthBad.push(`${ws.name} Año C${cn}=${w} (mínimo 10)`)
          }
        })
      })
    }
    check('cabeceras exactas (sin relleno sobrante)', headerBad.length === 0, headerBad.slice(0, 3).join(' | '))
    check('anchos ≤42 y Año≥10', widthBad.length === 0, widthBad.slice(0, 4).join(' | '))
    check('alineación por rol', alignBad.length === 0, alignBad.slice(0, 3).join(' | '))

    // Ceros: prohibidos en hojas temáticas salvo conteos del bloque pirámide.
    const badZeros: string[] = []
    let piramideZeros = 0
    for (const ws of wb.worksheets) {
      if (!/^0[1-9]_/.test(ws.name)) continue
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
      // En v2 el código INE viaja en la línea de ámbito (fila 2); la fila 1 es
      // el título corto "SOCideas · <hoja>".
      if (ws.name !== '00_RESUMEN' && ws.name !== '10_METODOLOGÍA_FUENTES') {
        if (!txt(ws.getRow(2).getCell(1).value).includes(c.ine)) wrongMuni = true
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
  console.log('\nLayout XLSX verificado: 11 hojas del contrato socideas-book@2 y formato Ideas OK.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
