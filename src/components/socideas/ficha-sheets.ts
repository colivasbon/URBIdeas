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
    descripcion: "Participación y reparto de concejales en las elecciones municipales.",
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
    descripcion: "Inventario cultural y registros turísticos oficiales.",
    estado: "pendiente",
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
    descripcion: "Directorio asociativo desde registros oficiales.",
    estado: "pendiente",
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
