// Gráficos nativos (OOXML DrawingML Charts) para el libro XLSX municipal SOCideas — SOLO SERVIDOR.
//
// ExcelJS 4.4.0 no implementa `worksheet.addChart` (no existe en su API pública), así que este
// módulo post-procesa el paquete .xlsx ya escrito por ExcelJS y añade las partes OOXML que Excel
// necesita para renderizar gráficos nativos y editables:
//
//   xl/charts/chartK.xml                     definición del gráfico (título, series, cachés, ejes)
//   xl/drawings/drawingN.xml                 anclas (twoCellAnchor) de los gráficos de una hoja
//   xl/drawings/_rels/drawingN.xml.rels      rId -> ../charts/chartK.xml
//   xl/worksheets/_rels/sheetM.xml.rels      rId -> ../drawings/drawingN.xml
//   xl/worksheets/sheetM.xml                 nuevo <drawing r:id="rIdX"/> (antes de tableParts/extLst)
//   [Content_Types].xml                      Overrides de drawing y chart
//
// Reglas de construcción (críticas para que Excel NO repare el archivo):
//  - Orden de hijos según el esquema ECMA-376 (c:chartSpace > c:chart > c:plotArea > tipo > ejes).
//  - Ids de eje (c:axId) únicos por gráfico y cruzados (c:crossAx).
//  - Cachés de datos (c:strCache / c:numCache) para que el gráfico se vea sin recalcular en Excel.
//  - Todo texto se escapa y se filtran caracteres de control no válidos en XML 1.0.
//  - Los rId se eligen libres dentro de cada parte de relaciones existente.
//
// LIMITACIONES CONOCIDAS:
//  - No se generan las partes heredadas xl/charts/styleK.xml ni colorsK.xml (opcionales): Excel
//    y LibreOffice aplican el estilo por defecto y pintan los colores srgbClr explícitos.
//  - El formato de números cacheado es '#,##0' (coherente con c:numFmt del eje de valores).
//  - Si el libro ya tiene un dibujo en la hoja (p. ej. imágenes de ExcelJS), los gráficos se
//    añaden a ese mismo dibujo en lugar de crear un segundo <drawing> (inválido en el esquema).
//
// Este módulo NO hace I/O de red ni de disco: recibe y devuelve Buffer.
import JSZip from 'jszip'

export interface ChartSeriesSpec {
  nombre: string
  /** TÍtulo de la categoría por punto (se cachea en el XML para que el gráfico se vea sin abrir Excel). */
  categorias: string[]
  /** Valores por punto; null = hueco (no se escribe <c:pt> para ese Índice). */
  valores: (number | null)[]
}

export interface ChartSpec {
  /** Nombre EXACTO de la hoja (tal cual en workbook.xml). */
  sheetName: string
  tipo: 'line' | 'bar' | 'column' | 'pie'
  titulo: string
  /** LÍnea de subtítulo obligatoria: "unidad · período · fuente". */
  subtitulo: string
  series: ChartSeriesSpec[]
  /** Referencias A1 SIN hoja, p. ej. categoriasRef: 'A12:A41', valoresRef: 'B12:B41'. */
  refs: { categorias: string; valores: string }[]
  /** Ancla en celdas 0-based: [colFrom, rowFrom, colTo, rowTo]. Tamaño razonable: 6-9 columnas por 15-20 filas. */
  anchor: [number, number, number, number]
}

/** Resultado de la inspección de QA de las partes de gráfico de un XLSX. */
export interface NativeChartsInspection {
  charts: number
  drawings: number
  sheetsWithDrawing: string[]
  contentTypesOk: boolean
  relsOk: boolean
  problems: string[]
}

// ============================================================================
// Constantes OOXML
// ============================================================================

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const NS_CHART = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
const NS_DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_RELACIONES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_DRAWING_HOJA = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
const NS_REL_PAQUETE = 'http://schemas.openxmlformats.org/package/2006/relationships'
const REL_TIPO_DIBUJO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
const REL_TIPO_GRAFICO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'
const CT_DIBUJO = 'application/vnd.openxmlformats-officedocument.drawing+xml'
const CT_GRAFICO = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'

/** Paleta SOCideas para series y porciones (cicla si hay más series/puntos que colores). */
const PALETA_SOCIDEAS: readonly string[] = ['3E665C', '86B73D', 'C2E189', '643335', '3C403E']

/** Referencia A1 sencilla (celda o rango), sin nombre de hoja. */
const REF_A1 = /^[A-Za-z]{1,3}\d{1,7}(:[A-Za-z]{1,3}\d{1,7})?$/

// ============================================================================
// Texto, XML y números
// ============================================================================

/** Elimina caracteres de control no válidos en XML 1.0 (si se cuelan, Excel repara el libro). */
function limpiarTextoXml(texto: string): string {
  return texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
}

/** Escapa texto para nodos XML (<c:v>, <a:t>, <c:f>...). */
function escaparTextoXml(texto: string): string {
  return limpiarTextoXml(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escapa texto para valores de atributo XML. */
function escaparAtributoXml(texto: string): string {
  return escaparTextoXml(texto).replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** Deshace el escapado de un valor de atributo leído del paquete (&amp; siempre al final). */
function desescaparXml(texto: string): string {
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Serializa un número para <c:v> (SpreadsheetML admite notación decimal y científica). */
function formatearNumero(valor: number): string {
  if (Object.is(valor, -0)) return '0'
  return String(valor)
}

/** Convierte una referencia A1 sin hoja en referencia absoluta ($A$12:$B$41). */
function referenciarAbsoluta(refA1: string): string {
  return refA1.replace(/([A-Za-z]{1,3})(\d+)/g, '$$$1$$$2')
}

/** Referencia completa para c:f con el nombre de hoja entrecomillado y escapado. */
function referenciaCompleta(nombreHoja: string, refA1: string): string {
  return `'${nombreHoja.replace(/'/g, "''")}'!${referenciarAbsoluta(refA1)}`
}

/** Extrae los atributos de una etiqueta XML abierta (p. ej. '<sheet name="X" r:id="rId1"/>'). */
function parsearAtributos(etiqueta: string): Record<string, string> {
  const atributos: Record<string, string> = {}
  const re = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g
  for (const coincidencia of etiqueta.matchAll(re)) {
    atributos[coincidencia[1]] = coincidencia[2]
  }
  return atributos
}

// ============================================================================
// Relaciones del paquete
// ============================================================================

interface RelacionPaquete {
  id: string
  tipo: string
  destino: string
  modoExterno: boolean
}

function parsearRelaciones(xml: string): RelacionPaquete[] {
  const relaciones: RelacionPaquete[] = []
  for (const coincidencia of xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const atributos = parsearAtributos(coincidencia[0])
    const id = atributos.Id
    const tipo = atributos.Type
    const destino = atributos.Target
    if (!id || !tipo || !destino) continue
    relaciones.push({ id, tipo, destino, modoExterno: atributos.TargetMode === 'External' })
  }
  return relaciones
}

function construirRelsXml(relaciones: RelacionPaquete[]): string {
  const cuerpo = relaciones
    .map((rel) => {
      const modo = rel.modoExterno ? ' TargetMode="External"' : ''
      return `<Relationship Id="${escaparAtributoXml(rel.id)}" Type="${escaparAtributoXml(rel.tipo)}" Target="${escaparAtributoXml(rel.destino)}"${modo}/>`
    })
    .join('')
  return `${XML_DECL}\n<Relationships xmlns="${NS_REL_PAQUETE}">${cuerpo}</Relationships>`
}

/** Primer rId libre (rIdN con N = mayor numérico + 1). */
function siguienteRid(relaciones: RelacionPaquete[]): string {
  let maximo = 0
  for (const rel of relaciones) {
    const coincidencia = /^rId(\d+)$/.exec(rel.id)
    if (coincidencia) maximo = Math.max(maximo, Number(coincidencia[1]))
  }
  return `rId${maximo + 1}`
}

/** Ruta de la parte de relaciones de una parte dada ('xl/worksheets/sheet1.xml' -> '.../_rels/...rels'). */
function rutaRelsDeParte(parte: string): string {
  const ultimaBarra = parte.lastIndexOf('/')
  const carpeta = parte.slice(0, ultimaBarra)
  const nombre = parte.slice(ultimaBarra + 1)
  return `${carpeta}/_rels/${nombre}.rels`
}

/** Normaliza un Target relativo a una parte absoluta del paquete (sin barras iniciales ni '..'). */
function normalizarRutaParte(destino: string, carpetaBase: string): string {
  const sinAncla = destino.split('#')[0]
  const absoluto = sinAncla.startsWith('/') ? sinAncla.slice(1) : `${carpetaBase}/${sinAncla}`
  const segmentos: string[] = []
  for (const segmento of absoluto.split('/')) {
    if (segmento === '' || segmento === '.') continue
    if (segmento === '..') segmentos.pop()
    else segmentos.push(segmento)
  }
  return segmentos.join('/')
}

/** Siguiente Índice libre para una familia de partes (drawingN.xml, chartN.xml...). */
function siguienteIndiceDeParte(nombres: string[], patron: RegExp): number {
  let maximo = 0
  for (const nombre of nombres) {
    const coincidencia = patron.exec(nombre)
    if (coincidencia) maximo = Math.max(maximo, Number(coincidencia[1]))
  }
  return maximo + 1
}

function ordenNaturalPorSufijo(a: string, b: string): number {
  const na = Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0)
  const nb = Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0)
  return na - nb
}

function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function leerTexto(zip: JSZip, ruta: string): Promise<string> {
  const archivo = zip.file(ruta)
  if (!archivo) throw new Error(`Falta la parte ${ruta} en el XLSX`)
  return archivo.async('string')
}

// ============================================================================
// Hojas del libro
// ============================================================================

interface HojaLibro {
  nombre: string
  parte: string
}

/** Lista las hojas del libro resolviendo nombre -> parte de hoja vía workbook.xml y sus rels. */
async function listarHojas(zip: JSZip): Promise<HojaLibro[]> {
  const workbookXml = await leerTexto(zip, 'xl/workbook.xml')
  const relaciones = parsearRelaciones(await leerTexto(zip, 'xl/_rels/workbook.xml.rels'))
  const hojas: HojaLibro[] = []
  for (const coincidencia of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const atributos = parsearAtributos(coincidencia[0])
    const nombre = desescaparXml(atributos.name ?? '')
    const rid = atributos['r:id']
    if (!nombre || !rid) continue
    const relacion = relaciones.find((rel) => rel.id === rid && !rel.modoExterno)
    if (!relacion) continue
    hojas.push({ nombre, parte: normalizarRutaParte(relacion.destino, 'xl') })
  }
  return hojas
}

// ============================================================================
// Construcción de la hoja de cálculo: inserción de <drawing r:id="..."/>
// ============================================================================

/** Garantiza xmlns:r en el nodo raíz de la hoja (ExcelJS ya lo escribe, pero no se asume). */
function asegurarNamespaceRelaciones(sheetXml: string): string {
  const raiz = /<worksheet\b[^>]*>/.exec(sheetXml)
  if (!raiz) throw new Error('La parte de hoja no tiene nodo raíz <worksheet>')
  if (/\bxmlns:r\s*=/.test(raiz[0])) return sheetXml
  const nuevaRaiz = raiz[0].replace('<worksheet', `<worksheet xmlns:r="${NS_RELACIONES}"`)
  return sheetXml.slice(0, raiz.index) + nuevaRaiz + sheetXml.slice(raiz.index + raiz[0].length)
}

/** Posición del último hijo directo <etiqueta> del nodo raíz (solo si cierra el documento). */
function posicionHijoFinalRaiz(xml: string, etiqueta: string): number {
  const cierreRaiz = xml.lastIndexOf('</worksheet>')
  if (cierreRaiz === -1) return -1
  const apertura = xml.lastIndexOf(`<${etiqueta}`)
  if (apertura === -1) return -1
  const finApertura = xml.indexOf('>', apertura)
  if (finApertura === -1) return -1
  // Solo es autocerrada si el '>' de la propia etiqueta viene precedido de '/'.
  let fin: number
  if (xml[finApertura - 1] === '/') {
    fin = finApertura + 1
  } else {
    const cierreEtiqueta = xml.indexOf(`</${etiqueta}>`, finApertura)
    if (cierreEtiqueta === -1) return -1
    fin = cierreEtiqueta + etiqueta.length + 3
  }
  return xml.slice(fin, cierreRaiz).trim() === '' ? apertura : -1
}

/** Punto de inserción válido para <drawing>: antes de tableParts/extLst (orden del esquema) o al final. */
function posicionInsercionDrawing(sheetXml: string): number {
  const tableParts = sheetXml.indexOf('<tableParts')
  if (tableParts !== -1) return tableParts
  const extLst = posicionHijoFinalRaiz(sheetXml, 'extLst')
  if (extLst !== -1) return extLst
  const cierre = sheetXml.lastIndexOf('</worksheet>')
  if (cierre === -1) throw new Error('La parte de hoja no tiene cierre </worksheet>')
  return cierre
}

function insertarElementoDrawing(sheetXml: string, rId: string): string {
  const xml = asegurarNamespaceRelaciones(sheetXml)
  const posicion = posicionInsercionDrawing(xml)
  const elemento = `<drawing r:id="${escaparAtributoXml(rId)}"/>`
  return xml.slice(0, posicion) + elemento + xml.slice(posicion)
}

// ============================================================================
// Construcción de xl/drawings/drawingN.xml
// ============================================================================

interface AnclaDibujo {
  anchor: [number, number, number, number]
  rId: string
  nombre: string
  id: number
}

function construirAnclaXml(ancla: AnclaDibujo): string {
  const [colFrom, rowFrom, colTo, rowTo] = ancla.anchor
  return [
    '<xdr:twoCellAnchor>',
    `<xdr:from><xdr:col>${colFrom}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${rowFrom}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`,
    `<xdr:to><xdr:col>${colTo}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${rowTo}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`,
    '<xdr:graphicFrame macro="">',
    '<xdr:nvGraphicFramePr>',
    `<xdr:cNvPr id="${ancla.id}" name="${escaparAtributoXml(ancla.nombre)}"/>`,
    '<xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr>',
    '</xdr:nvGraphicFramePr>',
    '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>',
    `<a:graphic><a:graphicData uri="${NS_CHART}"><c:chart xmlns:c="${NS_CHART}" xmlns:r="${NS_RELACIONES}" r:id="${escaparAtributoXml(ancla.rId)}"/></a:graphicData></a:graphic>`,
    '</xdr:graphicFrame>',
    '<xdr:clientData/>',
    '</xdr:twoCellAnchor>',
  ].join('')
}

function construirDrawingXml(anclasXml: string): string {
  return `${XML_DECL}\n<xdr:wsDr xmlns:xdr="${NS_DRAWING_HOJA}" xmlns:a="${NS_DRAWING}">${anclasXml}</xdr:wsDr>`
}

/** Inserta anclas nuevas al final de un dibujo ya existente (imágenes de ExcelJS, etc.). */
function insertarAnclasEnDrawing(drawingXml: string, anclasXml: string): string {
  const cierre = drawingXml.lastIndexOf('</xdr:wsDr>')
  if (cierre === -1) throw new Error('La parte de dibujo no tiene cierre </xdr:wsDr>')
  return drawingXml.slice(0, cierre) + anclasXml + drawingXml.slice(cierre)
}

/** Siguiente id de forma libre dentro de un dibujo (xdr:cNvPr id debe ser único). */
function siguienteIdForma(drawingXml: string): number {
  let maximo = 1
  for (const coincidencia of drawingXml.matchAll(/<xdr:cNvPr\b[^>]*\bid="(\d+)"/g)) {
    maximo = Math.max(maximo, Number(coincidencia[1]))
  }
  return maximo + 1
}

// ============================================================================
// Construcción de xl/charts/chartK.xml
// ============================================================================

function construirTituloXml(titulo: string, subtitulo: string): string {
  return [
    '<c:title>',
    '<c:tx><c:rich>',
    '<a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="0"/>',
    '<a:lstStyle/>',
    `<a:p><a:pPr><a:defRPr sz="1400" b="1" i="0" u="none" strike="noStrike" kern="1200" baseline="0"/></a:pPr><a:r><a:rPr lang="es-ES" sz="1400" b="1"/><a:t>${escaparTextoXml(titulo)}</a:t></a:r></a:p>`,
    `<a:p><a:pPr><a:defRPr sz="900" b="0" i="0" u="none" strike="noStrike" kern="1200" baseline="0"/></a:pPr><a:r><a:rPr lang="es-ES" sz="900"/><a:t>${escaparTextoXml(subtitulo)}</a:t></a:r></a:p>`,
    '</c:rich></c:tx>',
    '<c:layout/>',
    '<c:overlay val="0"/>',
    '</c:title>',
  ].join('')
}

function construirSerieSpPrXml(tipo: ChartSpec['tipo'], color: string): string {
  if (tipo === 'line') {
    return `<c:spPr><a:ln w="25400" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln><a:effectLst/></c:spPr>`
  }
  return `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr>`
}

/** Colorea cada porción no vacía del pastel con la paleta SOCideas (varyColors=1 + dPt). */
function construirPuntosPastelXml(valores: (number | null)[]): string {
  let xml = ''
  let colorIndice = 0
  for (let i = 0; i < valores.length; i += 1) {
    const valor = valores[i]
    if (typeof valor !== 'number' || !Number.isFinite(valor)) continue
    const color = PALETA_SOCIDEAS[colorIndice % PALETA_SOCIDEAS.length]
    colorIndice += 1
    xml += `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln><a:effectLst/></c:spPr></c:dPt>`
  }
  return xml
}

function construirSerieXml(
  serie: ChartSeriesSpec,
  ref: ChartSpec['refs'][number],
  indice: number,
  tipo: ChartSpec['tipo'],
  nombreHoja: string,
): string {
  const color = PALETA_SOCIDEAS[indice % PALETA_SOCIDEAS.length]
  const puntosCategoria = serie.categorias
    .map((categoria, i) =>
      categoria.length > 0 ? `<c:pt idx="${i}"><c:v>${escaparTextoXml(categoria)}</c:v></c:pt>` : '',
    )
    .join('')
  const puntosValor = serie.valores
    .map((valor, i) =>
      typeof valor === 'number' && Number.isFinite(valor)
        ? `<c:pt idx="${i}"><c:v>${formatearNumero(valor)}</c:v></c:pt>`
        : '',
    )
    .join('')

  const partes: string[] = []
  partes.push(`<c:ser><c:idx val="${indice}"/><c:order val="${indice}"/>`)
  partes.push(`<c:tx><c:v>${escaparTextoXml(serie.nombre)}</c:v></c:tx>`)
  partes.push(construirSerieSpPrXml(tipo, color))
  if (tipo === 'line') partes.push('<c:marker><c:symbol val="none"/></c:marker>')
  if (tipo === 'pie') partes.push(construirPuntosPastelXml(serie.valores))
  partes.push(
    `<c:cat><c:strRef><c:f>${escaparTextoXml(referenciaCompleta(nombreHoja, ref.categorias))}</c:f><c:strCache><c:ptCount val="${serie.categorias.length}"/>${puntosCategoria}</c:strCache></c:strRef></c:cat>`,
  )
  partes.push(
    `<c:val><c:numRef><c:f>${escaparTextoXml(referenciaCompleta(nombreHoja, ref.valores))}</c:f><c:numCache><c:formatCode>#,##0</c:formatCode><c:ptCount val="${serie.valores.length}"/>${puntosValor}</c:numCache></c:numRef></c:val>`,
  )
  partes.push('</c:ser>')
  return partes.join('')
}

function construirEtiquetasDatosXml(): string {
  return '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>'
}

function construirTipoGraficoXml(
  spec: ChartSpec,
  axIdCategoria: number,
  axIdValores: number,
): string {
  const series = spec.series
    .map((serie, i) => construirSerieXml(serie, spec.refs[i], i, spec.tipo, spec.sheetName))
    .join('')
  const etiquetas = construirEtiquetasDatosXml()

  if (spec.tipo === 'line') {
    return `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}${etiquetas}<c:smooth val="0"/><c:axId val="${axIdCategoria}"/><c:axId val="${axIdValores}"/></c:lineChart>`
  }
  if (spec.tipo === 'bar' || spec.tipo === 'column') {
    const barDir = spec.tipo === 'bar' ? 'bar' : 'col'
    return `<c:barChart><c:barDir val="${barDir}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}${etiquetas}<c:gapWidth val="80"/><c:overlap val="-20"/><c:axId val="${axIdCategoria}"/><c:axId val="${axIdValores}"/></c:barChart>`
  }
  return `<c:pieChart><c:varyColors val="1"/>${series}${etiquetas}<c:firstSliceAng val="0"/></c:pieChart>`
}

function construirTxPrEjeXml(rotacion: string): string {
  return `<c:txPr><a:bodyPr rot="${rotacion}" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="0" i="0" u="none" strike="noStrike" kern="1200" baseline="0"/></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr>`
}

/** Ejes cat/val para bar y line. En barras horizontales se intercambian las posiciones y se gira el texto. */
function construirEjesXml(axIdCategoria: number, axIdValores: number, horizontal: boolean): string {
  const posCategoria = horizontal ? 'l' : 'b'
  const posValores = horizontal ? 'b' : 'l'
  const rotacionCategoria = horizontal ? '-60000000' : '0'
  return [
    '<c:catAx>',
    `<c:axId val="${axIdCategoria}"/>`,
    '<c:scaling><c:orientation val="minMax"/></c:scaling>',
    '<c:delete val="0"/>',
    `<c:axPos val="${posCategoria}"/>`,
    '<c:numFmt formatCode="General" sourceLinked="1"/>',
    '<c:majorTickMark val="none"/>',
    '<c:minorTickMark val="none"/>',
    '<c:tickLblPos val="nextTo"/>',
    '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr>',
    construirTxPrEjeXml(rotacionCategoria),
    `<c:crossAx val="${axIdValores}"/>`,
    '<c:crosses val="autoZero"/>',
    '<c:auto val="1"/>',
    '<c:lblAlgn val="ctr"/>',
    '<c:lblOffset val="100"/>',
    '<c:noMultiLvlLbl val="0"/>',
    '</c:catAx>',
    '<c:valAx>',
    `<c:axId val="${axIdValores}"/>`,
    '<c:scaling><c:orientation val="minMax"/></c:scaling>',
    '<c:delete val="0"/>',
    `<c:axPos val="${posValores}"/>`,
    '<c:majorGridlines><c:spPr><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill><a:round/></a:ln><a:effectLst/></c:spPr></c:majorGridlines>',
    '<c:numFmt formatCode="#,##0" sourceLinked="0"/>',
    '<c:majorTickMark val="none"/>',
    '<c:minorTickMark val="none"/>',
    '<c:tickLblPos val="nextTo"/>',
    '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr>',
    construirTxPrEjeXml('0'),
    `<c:crossAx val="${axIdCategoria}"/>`,
    '<c:crosses val="autoZero"/>',
    '<c:crossBetween val="between"/>',
    '</c:valAx>',
  ].join('')
}

function construirLeyendaXml(): string {
  return [
    '<c:legend><c:legendPos val="b"/><c:overlay val="0"/>',
    '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr>',
    `<c:txPr><a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="0" i="0" u="none" strike="noStrike" kern="1200" baseline="0"/></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr>`,
    '</c:legend>',
  ].join('')
}

function construirChartXml(spec: ChartSpec, indiceGrafico: number): string {
  // Ids de eje únicos por gráfico (se repiten en c:axId de la serie y en c:crossAx del eje opuesto).
  const axIdCategoria = 100000000 + indiceGrafico * 2
  const axIdValores = axIdCategoria + 1
  const horizontal = spec.tipo === 'bar'

  const partes: string[] = []
  partes.push(XML_DECL)
  partes.push(`<c:chartSpace xmlns:c="${NS_CHART}" xmlns:a="${NS_DRAWING}" xmlns:r="${NS_RELACIONES}">`)
  partes.push('<c:date1904 val="0"/>')
  partes.push('<c:lang val="es-ES"/>')
  partes.push('<c:roundedCorners val="0"/>')
  partes.push('<c:chart>')
  partes.push(construirTituloXml(spec.titulo, spec.subtitulo))
  partes.push('<c:autoTitleDeleted val="0"/>')
  partes.push('<c:plotArea>')
  partes.push('<c:layout/>')
  partes.push(construirTipoGraficoXml(spec, axIdCategoria, axIdValores))
  if (spec.tipo !== 'pie') partes.push(construirEjesXml(axIdCategoria, axIdValores, horizontal))
  partes.push('<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr>')
  partes.push('</c:plotArea>')
  if (spec.series.length > 1 || spec.tipo === 'pie') partes.push(construirLeyendaXml())
  partes.push('<c:plotVisOnly val="1"/>')
  partes.push('<c:dispBlanksAs val="gap"/>')
  partes.push('<c:showDLblsOverMax val="0"/>')
  partes.push('</c:chart>')
  partes.push('<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr>')
  partes.push('<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr>')
  partes.push('<c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>')
  partes.push('</c:chartSpace>')
  return partes.join('')
}

// ============================================================================
// Validación de entrada
// ============================================================================

function validarGraficos(charts: ChartSpec[]): void {
  charts.forEach((grafico, i) => {
    const etiqueta = `charts[${i}]`
    if (!grafico.sheetName) throw new Error(`${etiqueta}: sheetName vacío`)
    if (grafico.series.length === 0) throw new Error(`${etiqueta}: el gráfico no tiene series`)
    if (grafico.refs.length !== grafico.series.length) {
      throw new Error(
        `${etiqueta}: refs (${grafico.refs.length}) y series (${grafico.series.length}) no coinciden`,
      )
    }
    const ancla: readonly number[] = grafico.anchor
    if (ancla.length !== 4 || ancla.some((valor) => !Number.isInteger(valor) || valor < 0)) {
      throw new Error(`${etiqueta}: anchor inválido (se esperan 4 enteros >= 0)`)
    }
    const [colFrom, rowFrom, colTo, rowTo] = ancla
    if (colTo <= colFrom || rowTo <= rowFrom) {
      throw new Error(`${etiqueta}: anchor sin área (colTo/rowTo deben superar colFrom/rowFrom)`)
    }
    grafico.refs.forEach((ref, j) => {
      if (!REF_A1.test(ref.categorias) || !REF_A1.test(ref.valores)) {
        throw new Error(`${etiqueta}.refs[${j}]: referencia A1 inválida (${ref.categorias} / ${ref.valores})`)
      }
    })
    grafico.series.forEach((serie, j) => {
      if (serie.categorias.length !== serie.valores.length) {
        throw new Error(
          `${etiqueta}.series[${j}]: categorias (${serie.categorias.length}) y valores (${serie.valores.length}) no coinciden`,
        )
      }
    })
  })
}

// ============================================================================
// Inyección
// ============================================================================

/** Añade Overrides que falten justo antes de </Types> (sin duplicar PartName ya declarados). */
function agregarOverrides(contentTypesXml: string, overrides: { parte: string; tipo: string }[]): string {
  const existentes = new Set<string>()
  for (const coincidencia of contentTypesXml.matchAll(/<Override\b[^>]*\/?>/g)) {
    const atributos = parsearAtributos(coincidencia[0])
    if (atributos.PartName) existentes.add(atributos.PartName)
  }
  const nuevos = overrides.filter((override) => !existentes.has(override.parte))
  if (nuevos.length === 0) return contentTypesXml
  const cierre = contentTypesXml.lastIndexOf('</Types>')
  if (cierre === -1) throw new Error('[Content_Types].xml no tiene cierre </Types>')
  const xml = nuevos
    .map(
      (override) =>
        `<Override PartName="${escaparAtributoXml(override.parte)}" ContentType="${escaparAtributoXml(override.tipo)}"/>`,
    )
    .join('')
  return contentTypesXml.slice(0, cierre) + xml + contentTypesXml.slice(cierre)
}

/** Inyecta gráficos nativos en un XLSX de ExcelJS. Devuelve un buffer nuevo.
 *  Si `charts` está vacío, devuelve el buffer de entrada sin modificar. */
export async function injectNativeCharts(xlsxBuffer: Buffer, charts: ChartSpec[]): Promise<Buffer> {
  if (charts.length === 0) return xlsxBuffer
  validarGraficos(charts)

  const zip = await JSZip.loadAsync(xlsxBuffer)
  const nombresPartes = Object.keys(zip.files)
  const hojas = await listarHojas(zip)

  const porHoja = new Map<string, ChartSpec[]>()
  for (const grafico of charts) {
    const acumulado = porHoja.get(grafico.sheetName)
    if (acumulado) acumulado.push(grafico)
    else porHoja.set(grafico.sheetName, [grafico])
  }

  let siguienteDrawing = siguienteIndiceDeParte(nombresPartes, /^xl\/drawings\/drawing(\d+)\.xml$/)
  let siguienteChart = siguienteIndiceDeParte(nombresPartes, /^xl\/charts\/chart(\d+)\.xml$/)
  const overridesNuevos: { parte: string; tipo: string }[] = []

  for (const [nombreHoja, graficosHoja] of porHoja) {
    const hoja = hojas.find((candidata) => candidata.nombre === nombreHoja)
    if (!hoja) {
      throw new Error(`No existe ninguna hoja llamada "${nombreHoja}" en el libro`)
    }

    let sheetXml = await leerTexto(zip, hoja.parte)
    let sheetXmlCambiada = false
    const sheetRelsPath = rutaRelsDeParte(hoja.parte)
    const sheetRelsExistente = await zip.file(sheetRelsPath)?.async('string')
    const sheetRels = sheetRelsExistente ? parsearRelaciones(sheetRelsExistente) : []
    let sheetRelsCambiadas = false

    // Si la hoja ya apunta a un dibujo (imágenes de ExcelJS), se reutiliza esa parte: el esquema
    // solo admite UN elemento <drawing> por hoja.
    const relacionDibujo = sheetRels.find((rel) => rel.tipo === REL_TIPO_DIBUJO && !rel.modoExterno)
    let drawingPart: string
    let drawingXml: string
    let drawingRels: RelacionPaquete[]
    let drawingEsNuevo = false

    if (relacionDibujo) {
      drawingPart = normalizarRutaParte(relacionDibujo.destino, 'xl/worksheets')
      drawingXml = await leerTexto(zip, drawingPart)
      drawingRels = parsearRelaciones(await zip.file(rutaRelsDeParte(drawingPart))?.async('string') ?? '')
      if (!/<drawing\b/.test(sheetXml)) {
        sheetXml = insertarElementoDrawing(sheetXml, relacionDibujo.id)
        sheetXmlCambiada = true
      }
    } else {
      drawingPart = `xl/drawings/drawing${siguienteDrawing}.xml`
      siguienteDrawing += 1
      drawingXml = ''
      drawingRels = []
      drawingEsNuevo = true
      const rId = siguienteRid(sheetRels)
      sheetRels.push({
        id: rId,
        tipo: REL_TIPO_DIBUJO,
        destino: `../drawings/${drawingPart.slice('xl/drawings/'.length)}`,
        modoExterno: false,
      })
      sheetRelsCambiadas = true
      sheetXml = insertarElementoDrawing(sheetXml, rId)
      sheetXmlCambiada = true
    }

    let siguienteForma = siguienteIdForma(drawingXml)
    const anclas: AnclaDibujo[] = []
    for (const grafico of graficosHoja) {
      const chartPart = `xl/charts/chart${siguienteChart}.xml`
      zip.file(chartPart, construirChartXml(grafico, siguienteChart))
      overridesNuevos.push({ parte: `/${chartPart}`, tipo: CT_GRAFICO })
      siguienteChart += 1

      const rId = siguienteRid(drawingRels)
      drawingRels.push({
        id: rId,
        tipo: REL_TIPO_GRAFICO,
        destino: `../charts/${chartPart.slice('xl/charts/'.length)}`,
        modoExterno: false,
      })
      anclas.push({ anchor: grafico.anchor, rId, nombre: `Gráfico ${siguienteForma}`, id: siguienteForma })
      siguienteForma += 1
    }

    const anclasXml = anclas.map(construirAnclaXml).join('')
    if (drawingEsNuevo) {
      zip.file(drawingPart, construirDrawingXml(anclasXml))
      overridesNuevos.push({ parte: `/${drawingPart}`, tipo: CT_DIBUJO })
    } else {
      zip.file(drawingPart, insertarAnclasEnDrawing(drawingXml, anclasXml))
    }
    zip.file(rutaRelsDeParte(drawingPart), construirRelsXml(drawingRels))
    if (sheetRelsCambiadas) zip.file(sheetRelsPath, construirRelsXml(sheetRels))
    if (sheetXmlCambiada) zip.file(hoja.parte, sheetXml)
  }

  const contentTypesXml = await leerTexto(zip, '[Content_Types].xml')
  zip.file('[Content_Types].xml', agregarOverrides(contentTypesXml, overridesNuevos))

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

// ============================================================================
// Inspección (QA)
// ============================================================================

/** Inspección para QA: cuenta partes de gráfico y valida consistencia de rels. */
export async function inspectNativeCharts(xlsxBuffer: Buffer): Promise<NativeChartsInspection> {
  const problems: string[] = []
  const zip = await JSZip.loadAsync(xlsxBuffer)
  const nombresPartes = Object.keys(zip.files).filter((nombre) => !zip.files[nombre].dir)
  const partesChart = nombresPartes
    .filter((nombre) => /^xl\/charts\/chart\d+\.xml$/.test(nombre))
    .sort(ordenNaturalPorSufijo)
  const partesDrawing = nombresPartes
    .filter((nombre) => /^xl\/drawings\/drawing\d+\.xml$/.test(nombre))
    .sort(ordenNaturalPorSufijo)

  // --- Content types ---
  let contentTypesOk = true
  const overrides = new Map<string, string>()
  const archivoContentTypes = zip.file('[Content_Types].xml')
  if (!archivoContentTypes) {
    contentTypesOk = false
    problems.push('Falta [Content_Types].xml en el paquete')
  } else {
    const contentTypesXml = await archivoContentTypes.async('string')
    for (const coincidencia of contentTypesXml.matchAll(/<Override\b[^>]*\/?>/g)) {
      const atributos = parsearAtributos(coincidencia[0])
      if (atributos.PartName && atributos.ContentType) {
        overrides.set(atributos.PartName, atributos.ContentType)
      }
    }
    for (const parte of partesChart) {
      const tipo = overrides.get(`/${parte}`)
      if (tipo !== CT_GRAFICO) {
        contentTypesOk = false
        problems.push(`Sin Override de content-type para /${parte} (declarado: ${tipo ?? 'ausente'})`)
      }
    }
    for (const parte of partesDrawing) {
      const tipo = overrides.get(`/${parte}`)
      if (tipo !== CT_DIBUJO) {
        contentTypesOk = false
        problems.push(`Sin Override de content-type para /${parte} (declarado: ${tipo ?? 'ausente'})`)
      }
    }
    for (const [partName, tipo] of overrides) {
      const esChart = /^\/xl\/charts\/chart\d+\.xml$/.test(partName)
      const esDrawing = /^\/xl\/drawings\/drawing\d+\.xml$/.test(partName)
      if ((esChart || esDrawing) && !zip.file(partName.slice(1))) {
        contentTypesOk = false
        problems.push(`Override de ${tipo} apunta a una parte inexistente: ${partName}`)
      }
    }
  }

  // --- Relaciones de dibujo -> gráfico ---
  let relsOk = true
  const chartsReferenciados = new Set<string>()
  for (const parteDrawing of partesDrawing) {
    const drawingXml = await leerTexto(zip, parteDrawing)
    const ridsEnDrawing = new Set(
      [...drawingXml.matchAll(/<c:chart\b[^>]*\br:id="([^"]+)"/g)].map((coincidencia) => coincidencia[1]),
    )
    const relsPath = rutaRelsDeParte(parteDrawing)
    const archivoRels = zip.file(relsPath)
    if (ridsEnDrawing.size > 0 && !archivoRels) {
      relsOk = false
      problems.push(`${parteDrawing} referencia ${ridsEnDrawing.size} gráfico(s) pero no existe ${relsPath}`)
      continue
    }
    const relaciones = archivoRels ? parsearRelaciones(await archivoRels.async('string')) : []
    for (const rId of ridsEnDrawing) {
      const relacion = relaciones.find((rel) => rel.id === rId)
      if (!relacion) {
        relsOk = false
        problems.push(`${parteDrawing}: ${rId} no está declarado en ${relsPath}`)
      } else if (relacion.tipo !== REL_TIPO_GRAFICO) {
        relsOk = false
        problems.push(`${parteDrawing}: ${rId} no es una relación de tipo chart`)
      }
    }
    for (const relacion of relaciones) {
      if (relacion.tipo !== REL_TIPO_GRAFICO) continue
      const destino = normalizarRutaParte(relacion.destino, 'xl/drawings')
      if (!zip.file(destino)) {
        relsOk = false
        problems.push(`${parteDrawing}: ${relacion.id} apunta a una parte inexistente (${destino})`)
        continue
      }
      if (!ridsEnDrawing.has(relacion.id)) {
        relsOk = false
        problems.push(`${parteDrawing}: la relación ${relacion.id} (${destino}) no se usa en ningún ancla`)
      }
      chartsReferenciados.add(destino)
    }
  }
  for (const parteChart of partesChart) {
    if (!chartsReferenciados.has(parteChart)) {
      relsOk = false
      problems.push(`Gráfico huérfano (ningún dibujo lo referencia): ${parteChart}`)
    }
  }

  // --- Hojas -> dibujo ---
  let hojas: HojaLibro[] = []
  try {
    hojas = await listarHojas(zip)
  } catch (error) {
    relsOk = false
    problems.push(`No se pudo resolver la lista de hojas del libro: ${mensajeError(error)}`)
  }
  const sheetsWithDrawing: string[] = []
  const drawingsReferenciados = new Set<string>()
  for (const hoja of hojas) {
    const sheetXml = await leerTexto(zip, hoja.parte)
    const relsPath = rutaRelsDeParte(hoja.parte)
    const archivoRels = zip.file(relsPath)
    const relaciones = archivoRels ? parsearRelaciones(await archivoRels.async('string')) : []
    const elementoDrawing = /<drawing\b[^>]*\br:id="([^"]+)"/.exec(sheetXml)
    if (elementoDrawing) {
      sheetsWithDrawing.push(hoja.nombre)
      const relacion = relaciones.find((rel) => rel.id === elementoDrawing[1])
      if (!relacion) {
        relsOk = false
        problems.push(`${hoja.parte}: <drawing r:id="${elementoDrawing[1]}"> sin relación declarada`)
        continue
      }
      if (relacion.tipo !== REL_TIPO_DIBUJO) {
        relsOk = false
        problems.push(`${hoja.parte}: ${relacion.id} no es una relación de tipo drawing`)
        continue
      }
      const destino = normalizarRutaParte(relacion.destino, 'xl/worksheets')
      if (!zip.file(destino)) {
        relsOk = false
        problems.push(`${hoja.parte}: el dibujo ${destino} no existe`)
        continue
      }
      drawingsReferenciados.add(destino)
    }
    for (const relacion of relaciones) {
      if (relacion.tipo === REL_TIPO_DIBUJO && !elementoDrawing) {
        relsOk = false
        problems.push(`${hoja.parte}: relación ${relacion.id} de tipo drawing sin elemento <drawing> en la hoja`)
      }
    }
  }
  for (const parteDrawing of partesDrawing) {
    if (!drawingsReferenciados.has(parteDrawing)) {
      relsOk = false
      problems.push(`Dibujo huérfano (ninguna hoja lo referencia): ${parteDrawing}`)
    }
  }

  return {
    charts: partesChart.length,
    drawings: partesDrawing.length,
    sheetsWithDrawing,
    contentTypesOk,
    relsOk,
    problems,
  }
}
