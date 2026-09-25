import type { SocideasSheetId } from "@/lib/socideas-export";

/**
 * Catálogo de hojas de la ficha municipal. Refleja 1:1 las hojas del libro XLSX
 * (`SOCIDEAS_SHEET_IDS`, fuente de verdad en `src/lib/socideas-export.ts`): la
 * navegación de la ficha y el libro descargable hablan el mismo idioma.
 *
 * Solo metadatos de presentación (sin datos, sin cálculos): la disponibilidad
 * real de cada hoja la declara la propia sección al renderizar.
 */
export type FichaSheetKey =
  | "proyecto"
  | "demografia"
  | "politico"
  | "economia"
  | "sociocultural"
  | "patrimonio"
  | "infraestructura"
  | "asociaciones"
  | "fuentes";

/** Estado editorial de la hoja (estático): con datos, parcial o pendiente. */
export type FichaSheetEstado = "datos" | "parcial" | "pendiente";

export interface FichaSheetMeta {
  key: FichaSheetKey;
  id: SocideasSheetId;
  /** Número de hoja del libro ("00"…"08"). */
  code: string;
  label: string;
  descripcion: string;
  estado: FichaSheetEstado;
}

export const FICHA_SHEETS: readonly FichaSheetMeta[] = [
  {
    key: "proyecto",
    id: "00_PROYECTO",
    code: "00",
    label: "Proyecto y portada",
    descripcion:
      "Qué es este libro, qué hojas lo componen y con qué criterio metodológico se publican sus datos.",
    estado: "datos",
  },
  {
    key: "demografia",
    id: "01_PERFIL_DEMOGRÁFICO",
    code: "01",
    label: "Perfil demográfico",
    descripcion:
      "Población, composición, evolución, estructura por edad y sexo, nacionalidad, arraigo y movilidad.",
    estado: "datos",
  },
  {
    key: "politico",
    id: "02_CONTEXTO_POLÍTICO",
    code: "02",
    label: "Contexto político",
    descripcion:
      "Elecciones municipales y resultados de la circunscripción provincial (autonómicas, Congreso y Senado, siempre separados).",
    estado: "parcial",
  },
  {
    key: "economia",
    id: "03_CONTEXTO_ECONÓMICO",
    code: "03",
    label: "Contexto económico",
    descripcion:
      "Renta, desigualdad, tejido empresarial, sector agrario, ganadería y mercado de trabajo.",
    estado: "datos",
  },
  {
    key: "sociocultural",
    id: "04_CONTEXTO_SOCIOCULTURAL",
    code: "04",
    label: "Contexto sociocultural",
    descripcion: "Nivel educativo (Censo 2021) y servicios municipales.",
    estado: "parcial",
  },
  {
    key: "patrimonio",
    id: "05_PATRIMONIO_Y_TURISMO",
    code: "05",
    label: "Patrimonio y turismo",
    descripcion:
      "Resumen de Wikipedia con atribución CC BY-SA, bienes patrimoniales de Wikidata y Grupo de Acción Local (GAL).",
    estado: "parcial",
  },
  {
    key: "infraestructura",
    id: "06_INFRAESTRUCTURA_Y_RECURSOS",
    code: "06",
    label: "Infraestructura y recursos",
    descripcion: "Infraestructura, transporte, conectividad y transición energética.",
    estado: "pendiente",
  },
  {
    key: "asociaciones",
    id: "07_ASOCIACIONES",
    code: "07",
    label: "Asociaciones",
    descripcion:
      "Directorio asociativo desde registros autonómicos de datos abiertos, con aviso de verificación.",
    estado: "parcial",
  },
  {
    key: "fuentes",
    id: "08_CRITERIOS_Y_FUENTES",
    code: "08",
    label: "Criterios y fuentes",
    descripcion: "Criterios de lectura y registro centralizado de fuentes.",
    estado: "datos",
  },
] as const;

/**
 * Resuelve la hoja activa a partir de los search params, conservando la
 * compatibilidad con el parámetro histórico `categoria`:
 *   `?categoria=economia` → 03 · `?categoria=demografia` (o nada) → 01.
 * `?hoja=` tiene prioridad cuando apunta a una hoja válida.
 */
export function resolveFichaSheet(
  hoja?: string | null,
  categoria?: string | null,
): FichaSheetKey {
  if (hoja && FICHA_SHEETS.some((s) => s.key === hoja)) return hoja as FichaSheetKey;
  if (categoria === "economia") return "economia";
  return "demografia";
}

export function fichaSheetByKey(key: FichaSheetKey): FichaSheetMeta {
  return FICHA_SHEETS.find((s) => s.key === key) ?? FICHA_SHEETS[1];
}

/* ============================================================
   Indicadores de estado por hoja (v2.3 "mejoras generales")
   Cuatro glifos fijos, cada uno con su texto accesible. El glifo es
   SIEMPRE decorativo (aria-hidden en el componente que lo pinta); el
   texto es la fuente de verdad para lectores de pantalla y tooltip.
   ============================================================ */

export type EstadoGlyph = "ok" | "stale" | "pronto" | "no-disponible";

export interface GlyphMeta {
  /** Glifo visible (decorativo: nunca se expone solo a lectores de pantalla). */
  glifo: string;
  /** Texto accesible/tooltip: qué significa el glifo, en castellano llano. */
  texto: string;
}

export const SHEET_GLYPH: Record<EstadoGlyph, GlyphMeta> = {
  ok: { glifo: "✓", texto: "Datos disponibles y recientes" },
  stale: { glifo: "~", texto: "Datos disponibles pero pueden estar desactualizados" },
  pronto: { glifo: "⏳", texto: "Próximamente" },
  "no-disponible": { glifo: "—", texto: "No disponible para este municipio" },
};

/** Overrides por municipio: p. ej. `{ patrimonio: "no-disponible" }`. */
export type EstadoGlyphOverrides = Partial<Record<FichaSheetKey, EstadoGlyph>>;

/** Estado editorial estático → glifo por defecto (la frescura real se declara fuera). */
const ESTADO_GLYPH: Record<FichaSheetEstado, EstadoGlyph> = {
  datos: "ok",
  parcial: "stale",
  pendiente: "pronto",
};

/**
 * Glifo de una hoja: el override por municipio manda (para marcar «—» cuando
 * la fuente no cubre el territorio), y en su defecto se deriva del estado
 * editorial estático. Sin datos inventados: solo etiqueta lo ya declarado.
 */
export function sheetGlyphFor(
  sheet: FichaSheetMeta | FichaSheetKey,
  overrides?: EstadoGlyphOverrides,
): EstadoGlyph {
  const key = typeof sheet === "string" ? sheet : sheet.key;
  const override = overrides?.[key];
  if (override) return override;
  const meta = typeof sheet === "string" ? fichaSheetByKey(sheet) : sheet;
  return ESTADO_GLYPH[meta.estado];
}
