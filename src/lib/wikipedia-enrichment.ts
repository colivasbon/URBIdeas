// Enriquecimiento enciclopédico (es.wikipedia + Wikidata) de la ficha municipal.
//
// Principios:
//  · NUNCA lanza: todo fallo de red/API degrada a status 'error' | 'partial' |
//    'not_found' para que la ficha no se bloquee jamás.
//  · Validación estricta del artículo: si no es inequívocamente ESE municipio
//    (texto territorial español + provincia + P300/INE cuando existe) se
//    descarta y se devuelve 'not_found' en vez de contenido de otro pueblo.
//  · Imágenes SOLO con licencia libre verificada en Commons (CC0, cualquier
//    variante CC BY o dominio público). Sin certeza → sin imagen.
//  · Sin efectos secundarios a la importación: la red solo se toca dentro de
//    las funciones exportadas (seguro tanto en servidor como en scripts tsx).
//
// Origen de los datos: resumen REST de es.wikipedia, wbgetentities de Wikidata,
// WDQS (SPARQL) para bienes con P1435 y imageinfo de Commons para licencias.

// ============================================================================
// Contrato público
// ============================================================================

export interface WikipediaArticle {
  title: string
  pageId: number
  /** Texto plano (sin HTML), máx. 1000 caracteres. */
  summary: string
  /** Presente SOLO si Commons confirma una licencia libre del fichero. */
  thumbnail?: { url: string; width: number; height: number; license?: string }
  description?: string
  url: string
  lastRevision?: string
  license: 'CC BY-SA 4.0'
  attribution: string
}

export interface WikidataEnrichment {
  qid: string
  officialWebsite?: string
  coordinates?: { lat: number; lon: number }
  /** Año de P571 solo con precisión anual o superior (no se inventa siglos). */
  founded?: string
  /** Presente SOLO si Commons confirma una licencia libre del fichero. */
  mainImage?: string
  mainImageLicense?: string
  /** P300 (código INE declarado en Wikidata), si existe. */
  ineCode?: string
  /** P1566 (GeoNames), si existe. */
  geoNamesId?: string
}

export interface HeritageSite {
  title: string
  qid: string
  heritageType: string
  image?: string
  imageLicense?: string
  url: string
}

export interface WikipediaEnrichment {
  municipalityName: string
  ineCode: string
  wikipedia: WikipediaArticle | null
  wikidata: WikidataEnrichment | null
  heritageSites: HeritageSite[]
  status: 'found' | 'not_found' | 'partial' | 'error'
  retrievedAt: string
}

export const WIKIPEDIA_R2_PREFIX = 'socideas/wikipedia'

/** Clave R2 del objeto cacheado: `socideas/wikipedia/{ineCode}.json`. */
export function wikipediaEnrichmentKey(ineCode: string): string {
  return `${WIKIPEDIA_R2_PREFIX}/${ineCode.trim()}.json`
}

// ============================================================================
// Constantes de red
// ============================================================================

const USER_AGENT = 'SOCideas/2.3 (https://urb-ideas.vercel.app; contacto via repo)'
const DEFAULT_TIMEOUT_MS = 12000
const WDQS_TIMEOUT_MS = 15000
const WDQS_RETRY_TIMEOUT_MS = 25000
const R2_READ_TIMEOUT_MS = 10000

const SUMMARY_URL = 'https://es.wikipedia.org/api/rest_v1/page/summary/'
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const WDQS_URL = 'https://query.wikidata.org/sparql'
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'

/** LÍmite de bienes patrimoniales por municipio (payload acotado). */
const HERITAGE_LIMIT = 100
/** Máx. de títulos de fichero por petición de licencias en Commons. */
const LICENSE_BATCH = 12

const R2_PUBLIC_BASE_FALLBACK = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'

// ============================================================================
// Utilidades
// ============================================================================

type Outcome<T> = { ok: true; value: T } | { ok: false; reason: string; notFound?: boolean }

function r2PublicBase(): string {
  const base =
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    process.env.SOCIDEAS_R2_PUBLIC_BASE ||
    R2_PUBLIC_BASE_FALLBACK
  return base.replace(/\/$/, '')
}

async function getJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Outcome<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (res.status === 404) return { ok: false, reason: 'HTTP 404', notFound: true }
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    return { ok: true, value: (await res.json()) as T }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'error de red' }
  } finally {
    clearTimeout(timer)
  }
}

/** Normaliza para comparaciones: minúsculas, sin acentos, espacios simples. */
function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'Í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  uuml: 'ü',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
  iexcl: '¡',
  excl: '¿',
}

/** Elimina etiquetas HTML y decodifica las entidades habituales. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match)
}

/** Texto plano colapsado y recortado en un límite de caracteres. */
function toPlainText(raw: string, max: number): string {
  const collapsed = stripHtml(raw).replace(/\s+/g, ' ').trim()
  if (collapsed.length <= max) return collapsed
  const head = collapsed.slice(0, max - 1)
  const cut = head.replace(/\s+\S*$/, '')
  return `${cut.length > 0 ? cut : head}…`
}

// ============================================================================
// Modelos de respuesta de las APIs
// ============================================================================

interface SummaryResponse {
  type?: string
  title?: string
  pageid?: number
  wikibase_item?: string
  thumbnail?: { source?: string; width?: number; height?: number }
  originalimage?: { source?: string; width?: number; height?: number }
  description?: string
  extract?: string
  extract_html?: string
  revision?: string
  content_urls?: { desktop?: { page?: string } }
}

interface WbClaim {
  rank?: string
  mainsnak?: { datavalue?: { value?: unknown } }
}

interface WbEntity {
  id?: string
  missing?: string
  labels?: Record<string, { value?: string }>
  descriptions?: Record<string, { value?: string }>
  claims?: Record<string, WbClaim[]>
}

interface WbGetEntitiesResponse {
  entities?: Record<string, WbEntity>
}

interface SparqlBinding {
  item?: { value?: string }
  itemLabel?: { value?: string }
  heritageLabel?: { value?: string }
  image?: { value?: string }
}

interface SparqlResponse {
  results?: { bindings?: SparqlBinding[] }
}

interface CommonsImageInfo {
  pageid?: number
  title?: string
  missing?: boolean
  imageinfo?: { extmetadata?: Record<string, { value?: string }> }[]
}

interface CommonsQueryResponse {
  query?: { pages?: CommonsImageInfo[] }
}

// ============================================================================
// Claims de Wikidata
// ============================================================================

function claimValues(entity: WbEntity | null, property: string): unknown[] {
  if (!entity?.claims) return []
  const claims = entity.claims[property] ?? []
  const out: unknown[] = []
  for (const claim of claims) {
    if (claim.rank !== undefined && claim.rank !== 'normal') continue
    const value = claim.mainsnak?.datavalue?.value
    if (value !== undefined && value !== null) out.push(value)
  }
  return out
}

function claimString(entity: WbEntity | null, property: string): string | undefined {
  for (const value of claimValues(entity, property)) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function claimCoordinate(entity: WbEntity | null, property: string): { lat: number; lon: number } | undefined {
  for (const value of claimValues(entity, property)) {
    const coord = value as { latitude?: number; longitude?: number }
    if (typeof coord?.latitude === 'number' && typeof coord?.longitude === 'number') {
      return { lat: coord.latitude, lon: coord.longitude }
    }
  }
  return undefined
}

/** P571: solo año cuando la precisión de la declaración es anual o mayor. */
function claimYear(entity: WbEntity | null, property: string): string | undefined {
  for (const value of claimValues(entity, property)) {
    const time = value as { time?: string; precision?: number }
    if (typeof time?.time !== 'string') continue
    if (typeof time.precision === 'number' && time.precision < 9) continue
    const match = /^([+-])(\d+)-/.exec(time.time)
    if (match === null) continue
    return `${match[1] === '-' ? '-' : ''}${match[2]}`
  }
  return undefined
}

// ============================================================================
// Licencias en Wikimedia Commons
// ============================================================================

export interface CommonsLicense {
  free: boolean
  license?: string
}

/** Libre = CC0, cualquier variante de CC BY o dominio público. */
export function isFreeLicense(raw: string | undefined | null): boolean {
  if (!raw) return false
  const s = norm(raw)
  if (s === '') return false
  if (/dominio publico|public domain|\bpd\b|pdm/.test(s)) return true
  if (/cc0|zero/.test(s)) return true
  if (/cc[ -]?by|creative commons attribution/.test(s)) return true
  return false
}

/** TÍtulo `File:`/`commons` a partir de la URL de miniatura de Commons. */
export function commonsFileFromThumbUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname
    const match = /\/commons\/thumb\/[^/]+\/[^/]+\/([^/]+)\//.exec(pathname)
    if (match === null) return null
    const decoded = decodeURIComponent(match[1]).replace(/_/g, ' ')
    return decoded.trim() === '' ? null : decoded
  } catch {
    return null
  }
}

/**
 * Consulta `imageinfo.extmetadata` de Commons en lotes. Devuelve un mapa
 * fichero → licencia; los ficheros ausentes o no consultados no aparecen
 * (interpretados después como «sin licencia acreditada» → sin imagen).
 */
async function checkCommonsLicenses(
  fileTitles: readonly string[],
): Promise<{ ok: boolean; licenses: Map<string, CommonsLicense> }> {
  const licenses = new Map<string, CommonsLicense>()
  const unique = [...new Set(fileTitles.map((t) => t.replace(/^File:/i, '').trim()).filter((t) => t !== ''))]
  if (unique.length === 0) return { ok: true, licenses }

  let allOk = true
  for (let i = 0; i < unique.length; i += LICENSE_BATCH) {
    const chunk = unique.slice(i, i + LICENSE_BATCH)
    const titles = chunk.map((t) => `File:${t}`).join('|')
    const url = `${COMMONS_API}?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(titles)}`
    const outcome = await getJson<CommonsQueryResponse>(url)
    if (!outcome.ok) {
      allOk = false
      continue
    }
    for (const page of outcome.value.query?.pages ?? []) {
      if (page.missing === true) continue
      const title = (page.title ?? '').replace(/^File:/i, '')
      const meta = page.imageinfo?.[0]?.extmetadata
      if (!title || !meta) continue
      const shortName = meta.LicenseShortName?.value ?? meta.License?.value
      licenses.set(title, { free: isFreeLicense(shortName), license: shortName ?? undefined })
    }
  }
  return { ok: allOk, licenses }
}

function licenseFor(
  licenses: Map<string, CommonsLicense>,
  fileTitle: string | null | undefined,
): { free: boolean; license?: string } {
  if (!fileTitle) return { free: false }
  const found = licenses.get(fileTitle.replace(/^File:/i, ''))
  if (!found) return { free: false }
  return found
}

// ============================================================================
// Artículo de Wikipedia
// ============================================================================

interface SummaryCandidate {
  summary: SummaryResponse
  requestedTitle: string
}

/** TÍtulo real del artículo (sigue redirecciones): `summary.title`. */
function articleTitle(summary: SummaryResponse): string {
  return (summary.title ?? '').trim()
}

function articleUrl(summary: SummaryResponse): string | null {
  const url = summary.content_urls?.desktop?.page
  if (typeof url === 'string' && url !== '') return url
  const title = articleTitle(summary)
  if (title === '') return null
  return `https://es.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function articleText(summary: SummaryResponse): string {
  const description = summary.description ?? ''
  const extract = summary.extract || stripHtml(summary.extract_html || '')
  return `${description} ${extract}`.replace(/\s+/g, ' ').trim()
}

const TERRITORY_RE = /\b(municipio|concejo|ciudad|villa|localidad|pueblo|entidad local|distrito municipal)\b/i
const SPAIN_SIGNAL_RE = /espana|espanol|comunidad autonomica|comunidad autonoma|autonomica|peninsula iberica/i

/** Calificadores que indican que el artículo NO es el municipio español. */
const FOREIGN_QUALIFIER_RE =
  /m[eé]xico|chile|argentin|colombi|per[uú]|bolivi|ecuador|venezuel|guinea|brasil|portugal|francia|italia|canad[aá]|estados unidos|filipin|desambigu/i

function qualifierInsideParens(title: string): string {
  const match = /\(([^)]*)\)/.exec(title)
  return match === null ? '' : norm(match[1])
}

type ValidationVerdict = { accepted: true; reason: string } | { accepted: false; reason: string }

/**
 * Valida que el artículo ES el municipio pedido.
 *   · veto absoluto si P300 (código INE) existe y no coincide;
 *   · el texto debe describir un territorio (municipio/concejo/ciudad/…);
 *   · y acreditar España (señal textual), la provincia, o un título ya
 *     desambiguado con la provincia.
 */
function validateArticle(
  summary: SummaryResponse,
  province: string,
  ineCode: string,
  entity: WbEntity | null,
  requestedTitle: string,
): ValidationVerdict {
  const title = articleTitle(summary)
  const qualifier = qualifierInsideParens(title)
  if (qualifier !== '' && FOREIGN_QUALIFIER_RE.test(qualifier)) {
    return { accepted: false, reason: `calificador_extranjero:${qualifier}` }
  }

  const text = norm(articleText(summary))
  if (text === '') return { accepted: false, reason: 'sin_resumen' }
  if (!TERRITORY_RE.test(text)) return { accepted: false, reason: 'no_es_termino_territorial' }

  // P300 solo veta/acepta cuando es un código INE municipal (5 dígitos):
  // hay entidades con P300 no numérico (p. ej. «ES-CE» para Ceuta) que no
  // deben descartar un artículo correcto.
  const p300 = claimString(entity, 'P300')
  const p300Ine = p300 !== undefined && /^\d{5}$/.test(p300) ? p300.trim() : null
  if (p300Ine !== null && p300Ine !== ineCode.trim()) {
    return { accepted: false, reason: `p300_no_coincide:${p300Ine}` }
  }
  if (p300Ine !== null) return { accepted: true, reason: 'p300_ine' }

  const provinceNorm = norm(province)
  if (provinceNorm !== '' && text.includes(provinceNorm)) return { accepted: true, reason: 'provincia_en_texto' }
  if (SPAIN_SIGNAL_RE.test(text)) return { accepted: true, reason: 'senal_de_espana' }
  if (requestedTitle.includes('(')) return { accepted: true, reason: 'titulo_desambiguado' }
  return { accepted: false, reason: 'sin_confirmacion_territorial' }
}

/** Candidatos de título: nombre literal, variantes bilingües y con provincia. */
function candidateTitles(municipalityName: string, province: string): string[] {
  const raw = municipalityName.trim()
  const out: string[] = [raw]
  const parts = raw.includes('/') ? raw.split('/').map((p) => p.trim()).filter((p) => p !== '') : []
  for (const part of parts) out.push(part)
  if (province.trim() !== '') {
    out.push(`${raw} (${province.trim()})`)
    for (const part of parts) out.push(`${part} (${province.trim()})`)
  }
  const unique: string[] = []
  const seen = new Set<string>()
  for (const title of out) {
    if (title === '' || seen.has(title)) continue
    seen.add(title)
    unique.push(title)
  }
  return unique
}

async function fetchSummary(title: string): Promise<Outcome<SummaryCandidate>> {
  const outcome = await getJson<SummaryResponse>(`${SUMMARY_URL}${encodeURIComponent(title)}`)
  if (!outcome.ok) return outcome
  return { ok: true, value: { summary: outcome.value, requestedTitle: title } }
}

async function fetchEntity(title: string): Promise<{ entity: WbEntity | null; failed: boolean }> {
  const url = `${WIKIDATA_API}?action=wbgetentities&format=json&props=claims%7Clabels%7Cdescriptions&sites=eswiki&titles=${encodeURIComponent(title)}`
  const outcome = await getJson<WbGetEntitiesResponse>(url)
  if (!outcome.ok) return { entity: null, failed: !outcome.notFound }
  const entities = Object.values(outcome.value.entities ?? {})
  const found = entities.find((e) => e?.id !== undefined && e.missing === undefined)
  return { entity: found ?? null, failed: false }
}

function buildWikidata(entity: WbEntity, licenses: Map<string, CommonsLicense>): WikidataEnrichment {
  const qid = entity.id ?? ''
  const mainImageFile = claimString(entity, 'P18')
  const imageLicense = licenseFor(licenses, mainImageFile)
  const wd: WikidataEnrichment = { qid }
  const website = claimString(entity, 'P856')
  if (website !== undefined && /^https?:\/\//i.test(website)) wd.officialWebsite = website
  const coords = claimCoordinate(entity, 'P625')
  if (coords !== undefined) wd.coordinates = coords
  const founded = claimYear(entity, 'P571')
  if (founded !== undefined) wd.founded = founded
  const ineCode = claimString(entity, 'P300')
  if (ineCode !== undefined) wd.ineCode = ineCode
  const geoNames = claimString(entity, 'P1566')
  if (geoNames !== undefined) wd.geoNamesId = geoNames
  if (mainImageFile !== undefined && imageLicense.free) {
    wd.mainImage = mainImageFile
    if (imageLicense.license !== undefined) wd.mainImageLicense = imageLicense.license
  }
  return wd
}

// ============================================================================
// Bienes patrimoniales (WDQS)
// ============================================================================

interface HeritageLookup {
  ok: boolean
  sites: HeritageSite[]
  imageFiles: string[]
}

function wikidataEntityUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`
}

async function fetchHeritageSites(qid: string): Promise<HeritageLookup> {
  if (qid === '') return { ok: false, sites: [], imageFiles: [] }
  const sparql = [
    'SELECT ?item ?itemLabel ?heritageLabel ?image WHERE {',
    `  ?item wdt:P131 wd:${qid}.`,
    '  ?item wdt:P1435 ?heritage.',
    '  OPTIONAL { ?item wdt:P18 ?image. }',
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }',
    `} LIMIT ${HERITAGE_LIMIT}`,
  ].join(' ')
  const url = `${WDQS_URL}?format=json&query=${encodeURIComponent(sparql)}`
  // WDQS es lento y espasmódico con ciudades grandes: un único reintento con
  // presupuesto ampliado; si vuelve a fallar, lista vacía (nunca lanza).
  let outcome = await getJson<SparqlResponse>(url, WDQS_TIMEOUT_MS)
  if (!outcome.ok) outcome = await getJson<SparqlResponse>(url, WDQS_RETRY_TIMEOUT_MS)
  if (!outcome.ok) return { ok: false, sites: [], imageFiles: [] }

  const sites: HeritageSite[] = []
  const imageFiles: string[] = []
  const seen = new Set<string>()
  for (const binding of outcome.value.results?.bindings ?? []) {
    const entityUrl = binding.item?.value ?? ''
    const qidMatch = /(Q\d+)$/.exec(entityUrl)
    if (qidMatch === null) continue
    const itemQid = qidMatch[1]
    if (seen.has(itemQid)) continue
    seen.add(itemQid)
    const title = binding.itemLabel?.value ?? itemQid
    const heritageType = binding.heritageLabel?.value ?? 'Protección patrimonial'
    const imageFile = commonsFileFromFilePath(binding.image?.value ?? '')
    sites.push({
      title,
      qid: itemQid,
      heritageType,
      url: wikidataEntityUrl(itemQid),
      ...(imageFile !== null ? { image: imageFile } : {}),
    })
    if (imageFile !== null) imageFiles.push(imageFile)
  }
  return { ok: true, sites, imageFiles }
}

/** `http://commons.wikimedia.org/wiki/Special:FilePath/X.jpg` → `X.jpg`. */
function commonsFileFromFilePath(url: string): string | null {
  if (url === '') return null
  try {
    const pathname = new URL(url).pathname
    const match = /Special:FilePath\/(.+)$/.exec(pathname)
    if (match === null) return null
    const decoded = decodeURIComponent(match[1]).replace(/_/g, ' ').trim()
    return decoded === '' ? null : decoded
  } catch {
    return null
  }
}

// ============================================================================
// API principal
// ============================================================================

/**
 * Enriquecimiento completo del municipio: resumen de Wikipedia, datos Wikidata
 * y bienes con P1435. Nunca lanza; degrada a `not_found` / `partial` / `error`.
 */
export async function getWikipediaMunicipalityData(
  municipalityName: string,
  province: string,
  ineCode: string,
): Promise<WikipediaEnrichment> {
  const retrievedAt = new Date().toISOString()
  const empty: WikipediaEnrichment = {
    municipalityName,
    ineCode,
    wikipedia: null,
    wikidata: null,
    heritageSites: [],
    status: 'not_found',
    retrievedAt,
  }

  try {
    let networkFailure = false
    let accepted: SummaryCandidate | null = null
    let entity: WbEntity | null = null

    for (const candidate of candidateTitles(municipalityName, province)) {
      const outcome = await fetchSummary(candidate)
      if (!outcome.ok) {
        if (!outcome.notFound) networkFailure = true
        continue
      }
      const { summary } = outcome.value
      if (articleTitle(summary) === '') {
        networkFailure = true
        continue
      }
      const lookup = await fetchEntity(articleTitle(summary))
      if (lookup.failed) networkFailure = true
      const verdict = validateArticle(summary, province, ineCode, lookup.entity, outcome.value.requestedTitle)
      if (verdict.accepted) {
        accepted = outcome.value
        entity = lookup.entity
        break
      }
    }

    if (accepted === null) {
      return { ...empty, status: networkFailure ? 'error' : 'not_found' }
    }

    const { summary } = accepted
    const title = articleTitle(summary)
    const url = articleUrl(summary)

    // Bienes patrimoniales (fracaso tolerado → lista vacía).
    const qid = entity?.id ?? ''
    const heritage = await fetchHeritageSites(qid)
    const wdOk = entity !== null

    // Licencias: miniatura del resumen + P18 + imágenes de bienes, en un solo lote.
    const thumbFile = commonsFileFromThumbUrl(summary.thumbnail?.source ?? summary.originalimage?.source ?? '')
    const files: string[] = []
    if (thumbFile !== null) files.push(thumbFile)
    const p18 = claimString(entity, 'P18')
    if (p18 !== undefined) files.push(p18)
    files.push(...heritage.imageFiles)
    const licenseLookup = await checkCommonsLicenses(files)
    const licenses = licenseLookup.licenses

    const wikipedia: WikipediaArticle = {
      title,
      pageId: summary.pageid ?? 0,
      summary: toPlainText(summary.extract || summary.extract_html || summary.description || '', 1000),
      url: url ?? `https://es.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      license: 'CC BY-SA 4.0',
      attribution: 'Wikipedia, La Enciclopedia Libre',
    }
    if (summary.description !== undefined && summary.description.trim() !== '') {
      wikipedia.description = summary.description.trim()
    }
    if (summary.revision !== undefined && summary.revision !== '') wikipedia.lastRevision = summary.revision

    const thumbLicense = licenseFor(licenses, thumbFile)
    const thumbSource = summary.thumbnail?.source ?? summary.originalimage?.source
    if (thumbSource !== undefined && thumbSource !== '' && thumbLicense.free) {
      const width = summary.thumbnail?.width ?? summary.originalimage?.width ?? 0
      const height = summary.thumbnail?.height ?? summary.originalimage?.height ?? 0
      if (width > 0 && height > 0) {
        wikipedia.thumbnail = {
          url: thumbSource,
          width,
          height,
          ...(thumbLicense.license !== undefined ? { license: thumbLicense.license } : {}),
        }
      }
    }

    const wikidata = wdOk && entity !== null ? buildWikidata(entity, licenses) : null

    const heritageSites: HeritageSite[] = heritage.sites.map((site) => {
      const imageLicense = licenseFor(licenses, site.image)
      if (site.image === undefined || !imageLicense.free) {
        return { title: site.title, qid: site.qid, heritageType: site.heritageType, url: site.url }
      }
      return {
        ...site,
        ...(imageLicense.license !== undefined ? { imageLicense: imageLicense.license } : {}),
      }
    })

    const status: WikipediaEnrichment['status'] = wdOk && heritage.ok ? 'found' : 'partial'
    return {
      municipalityName,
      ineCode,
      wikipedia,
      wikidata,
      heritageSites,
      status,
      retrievedAt,
    }
  } catch {
    return { ...empty, status: 'error' }
  }
}

/**
 * Solo Wikidata para un título de es.wikipedia (devuelve null si no hay
 * entidad accesible o la API falla). Reutilizado por el validador y por
 * consumidores externos.
 */
export async function getWikidataEnrichment(title: string): Promise<WikidataEnrichment | null> {
  try {
    const lookup = await fetchEntity(title)
    if (lookup.entity === null) return null
    const p18 = claimString(lookup.entity, 'P18')
    const licenseLookup = await checkCommonsLicenses(p18 !== undefined ? [p18] : [])
    return buildWikidata(lookup.entity, licenseLookup.licenses)
  } catch {
    return null
  }
}

/**
 * Lectura del JSON cacheado en R2 (URL pública, sin credenciales). Nunca
 * lanza: 404, timeout o JSON no válido → null.
 */
export async function readWikipediaEnrichment(ineCode: string): Promise<WikipediaEnrichment | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), R2_READ_TIMEOUT_MS)
    try {
      const url = `${r2PublicBase()}/${wikipediaEnrichmentKey(ineCode)}`
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: controller.signal,
      })
      if (res.status !== 200) return null
      const json = (await res.json()) as WikipediaEnrichment
      if (!json || typeof json !== 'object') return null
      if (typeof json.status !== 'string') return null
      if (!['found', 'not_found', 'partial', 'error'].includes(json.status)) return null
      if (typeof json.ineCode === 'string' && json.ineCode.trim() !== ineCode.trim()) return null
      if (!Array.isArray(json.heritageSites)) json.heritageSites = []
      return json
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}
