// Colores de candidatura para el mapa categórico. Los asigna el LOADER.
//
// 1) Colores de marca: la misma tabla que usa la ficha municipal
//    (src/components/socideas/HemicycleRepresentation.tsx, ACRONYM_STYLES y
//    NAME_STYLES). Se replica aquí porque ese módulo no la exporta; si cambia
//    allí, debe cambiar aquí (ver test core-colors).
// 2) Si la candidatura no casa por siglas ni por nombre, se prueba con la
//    candidatura cabecera de acumulación nacional/autonómica/provincial del
//    fichero 03 (p. ej. PSE-EE (PSOE) acumula en PSOE).
// 3) Resto: paleta determinista indexada por un hash (FNV-1a) de las siglas
//    normalizadas.
// Contraste: todo color publicado se lleva, conservando el tono, a una
// luminancia relativa en [0,175 ; 0,26], lo que da ≥ 3:1 frente al lienzo
// claro (#F1F1F1 y #FFFFFF) y frente al oscuro (#1A2420 y #242E29).
// Dentro de un municipio no se repite color: la segunda candidatura con el
// mismo color (orden por id) toma el siguiente libre de la paleta.

import type { Candidacy } from '../../../src/lib/socideas-secciones-political'

const ACRONYM_STYLES: Array<[string, string]> = [
  ['IU', '#B0102B'],
  ['PODEMOS', '#6B2C91'],
  ['SUMAR', '#E6007E'],
  ['MASMADRID', '#0DA35B'],
  ['BILDU', '#B5CF18'],
  ['BNG', '#6CB4E4'],
  ['COMPROMIS', '#E9822A'],
  ['ERC', '#F5B800'],
  ['PSOE', '#E30613'],
  ['PSC', '#E30613'],
  ['JXCAT', '#00C3B2'],
  ['JUNTS', '#00C3B2'],
  ['PNV', '#0B7A3B'],
  ['EAJ', '#0B7A3B'],
  ['CC', '#FFD100'],
  ['CS', '#EB6109'],
  ['PP', '#1D84CE'],
  ['VOX', '#63BE21'],
]

const NAME_STYLES: Array<[string, string]> = [
  ['IZQUIERDAUNIDA', '#B0102B'],
  ['PODEMOS', '#6B2C91'],
  ['SUMAR', '#E6007E'],
  ['MASMADRID', '#0DA35B'],
  ['BILDU', '#B5CF18'],
  ['GALLEGO', '#6CB4E4'],
  ['COMPROMIS', '#E9822A'],
  ['ESQUERRAREPUBLICANA', '#F5B800'],
  ['SOCIALISTAOBRERO', '#E30613'],
  ['SOCIALISTASDECATALUNYA', '#E30613'],
  ['JUNTS', '#00C3B2'],
  ['NACIONALISTAVASCO', '#0B7A3B'],
  ['COALICIONCANARIA', '#FFD100'],
  ['CIUDADANOS', '#EB6109'],
  ['PARTIDOPOPULAR', '#1D84CE'],
  ['VOX', '#63BE21'],
]

/** Paleta base: 12 tonos repartidos × 2 saturaciones (24 colores), generada
 *  en HSL y ajustada después a la banda de luminancia. Tonos separados ≥ 20°
 *  para que sigan distinguiéndose tras el ajuste. */
const PALETTE_HUES = [8, 30, 48, 75, 110, 150, 178, 200, 222, 250, 280, 315]
const PALETTE_SATURATIONS = [0.72, 0.4]

export function normKey(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function brandColor(acronym: string, name: string): string | null {
  const ac = normKey(acronym)
  const nm = normKey(name)
  const hit =
    ACRONYM_STYLES.find(([k]) => ac === k || (ac.length > 2 && ac.startsWith(k))) ??
    NAME_STYLES.find(([k]) => nm.includes(k))
  return hit ? hit[1] : null
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

// ── Contraste ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

export function relativeLuminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const LUMINANCE_BAND = { min: 0.175, max: 0.26 } as const
export const CONTRAST_BACKGROUNDS = ['#F1F1F1', '#FFFFFF', '#1A2420', '#242E29'] as const

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return [h / 6, s, l]
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255]
}

/** Lleva un color a la banda de luminancia conservando tono y saturación. */
export function fitContrastBand(hex: string): string {
  const lum = relativeLuminance(hex)
  if (lum >= LUMINANCE_BAND.min && lum <= LUMINANCE_BAND.max) return hex.toUpperCase()
  const [h, s] = rgbToHsl(hexToRgb(hex))
  const target = (LUMINANCE_BAND.min + LUMINANCE_BAND.max) / 2
  let lo = 0, hi = 1, best = hex
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const c = rgbToHex(hslToRgb([h, s, mid]))
    const L = relativeLuminance(c)
    best = c
    if (L < target) lo = mid
    else hi = mid
  }
  return best.toUpperCase()
}

const PALETTE: string[] = PALETTE_SATURATIONS.flatMap((sat) =>
  PALETTE_HUES.map((h) => fitContrastBand(rgbToHex(hslToRgb([h / 360, sat, 0.45])))),
)

export function paletteColor(key: string): string {
  return PALETTE[fnv1a(normKey(key)) % PALETTE.length] as string
}

/** Asigna colores a todas las candidaturas de la convocatoria (determinista). */
export function assignColors(cands: Candidacy[]): Candidacy[] {
  const byCode = new Map(cands.map((c) => [c.sourceCode, c]))
  return cands.map((c) => {
    const heads = [c.aggregationCodes?.national, c.aggregationCodes?.autonomic, c.aggregationCodes?.provincial]
      .filter((x): x is string => !!x && x !== c.sourceCode)
      .map((code) => byCode.get(code) ?? null)
    // Orden: siglas propias → candidatura cabecera de acumulación → nombre propio → paleta.
    let color: string | null = null
    const byAcronym = brandColor(c.acronym, '')
    if (byAcronym) color = fitContrastBand(byAcronym)
    if (!color) {
      for (const h of heads) {
        if (!h) continue
        const b = brandColor(h.acronym, h.name)
        if (b) {
          color = fitContrastBand(b)
          break
        }
      }
    }
    if (!color) {
      const byName = brandColor('', c.name)
      if (byName) color = fitContrastBand(byName)
    }
    if (!color) color = paletteColor(c.acronym || c.name || c.id)
    return { ...c, color }
  })
}

/** Evita colores repetidos dentro de un municipio (orden estable por id). */
export function dedupeColors(cands: Candidacy[]): Candidacy[] {
  const used = new Set<string>()
  const sorted = [...cands].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const out = new Map<string, Candidacy>()
  for (const c of sorted) {
    let color = c.color ?? paletteColor(c.acronym || c.id)
    if (used.has(color)) {
      const start = fnv1a(normKey(c.acronym || c.id)) % PALETTE.length
      for (let i = 1; i <= PALETTE.length; i++) {
        const cand = PALETTE[(start + i) % PALETTE.length] as string
        if (!used.has(cand)) {
          color = cand
          break
        }
      }
    }
    used.add(color)
    out.set(c.id, { ...c, color })
  }
  return cands.map((c) => out.get(c.id) as Candidacy)
}

export const COLOR_PALETTE = PALETTE
