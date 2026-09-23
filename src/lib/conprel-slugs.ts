// Slugs CONPREL definitivos — ÚNICO punto de definición (misión Agente B).
//
// Campo `verificacion` = estado de la evidencia de la magnitud. El orquestador
// lo consume para reflejar el informe del Agente A (paralelo): si alguna
// magnitud queda EXCLUIDA/PENDIENTE, se ajusta AQUÍ (slug/verificacion), nunca
// en el loader.
//
// Reglas de denominación (diseño §2-3 + encargo):
//  - NO usar «inicial»/«definitivo» en el slug mientras la fase cdFase no esté
//    glosada (V1 abierta: PDF metodológico pendiente).
//  - LIQ importer/importel tienen match numérico verificado (V2 cerrado).
//  - importec = pendiente (0 en muestra de cierre).
//  - PPTO importe = pendiente de glosario de fase.
//  - Cada magnitud es un slug; el concepto EHA viaja en dimensiones
//    {cdcta, tipreig} (capítulo I/G), no en el slug.

import type { ConprelFamilia } from './conprel-contracts'

export type ConprelVerificacionEstado = 'verificado' | 'patron' | 'pendiente'

export interface ConprelSlugDef {
  /** Slug definitivo en el envelope v2. */
  slug: string
  familia: ConprelFamilia
  /** Columna de tb_economica de la que procede el valor. */
  columna: string
  /** Nombre visible del indicador. */
  nombre: string
  unidad: string
  /** Estado de evidencia (contrato con el informe del Agente A). */
  verificacion: ConprelVerificacionEstado
  /** Texto libre de evidencia/cambio. El orquestador lo lee. */
  evidencia: string
  /** Si la fase/semanántica se resuelve, cómo debe evolucionar el slug. */
  cambioPendiente: string | null
}

export const CONPREL_SLUGS_PPTO: readonly ConprelSlugDef[] = [
  {
    slug: 'conprel_ppto_importe',
    familia: 'ppto',
    columna: 'importe',
    nombre: 'Importe presupuestario declarado (cdFase=U)',
    unidad: 'euros',
    verificacion: 'pendiente',
    evidencia:
      'Agente A: cdFase=U y cdImporte=P SIN definición primaria (PDF 809/814 extraídos sin mención; ' +
      'portal solo expone TipoPublicacion; 7 vías de búsqueda sin definición). Etiqueta honesta: ' +
      'importe_ppto_declarado_faseU — NO usar «inicial» ni «definitivo». Evidencia indirecta: ' +
      'workbook EP2025C00 cdImporte=P/cdFase=U, plazo 10-dic-2025, suma Access ≈97,82% columna ' +
      'Ayuntamientos (gap cuantificado: no firmantes 128 AA + elevación). VERIFICADA SOLO CARGA ' +
      'INTERNA hasta cerrar V1.',
    cambioPendiente:
      'Si se obtiene glosario primario de U: renombrar (p.ej. conprel_ppto_importe_definitivo) y ' +
      'subir verificacion. Si no: mantener y NO publicar como serie principal sin nota V1.',
  },
]

export const CONPREL_SLUGS_LIQ: readonly ConprelSlugDef[] = [
  {
    slug: 'conprel_liq_reconocidos_importe',
    familia: 'liq',
    columna: 'importer',
    nombre: 'Derechos liquidados / obligaciones reconocidas netas',
    unidad: 'euros',
    verificacion: 'verificado',
    evidencia:
      'Agente A (PDF metodología 809 L436 «derechos u obligaciones reconocidas»): match Δ=0 EXACTO ' +
      'vs EL2025CT en 7 municipios × I y G (Albanchez, Albacete, Madrid, Valladolid, Bilbao 48020, ' +
      'Cartagena, Cendea de Olza) + Ceuta I/G exacto. VERIFICADA PUBLICACIÓN.',
    cambioPendiente: null,
  },
  {
    slug: 'conprel_liq_prevision_definitivos_importe',
    familia: 'liq',
    columna: 'imported',
    nombre: 'Presupuesto: previsión o créditos definitivos',
    unidad: 'euros',
    verificacion: 'verificado',
    evidencia:
      'Agente A (PDF 809 L435 «previsión o créditos definitivos del ejercicio corriente»): Ceuta ' +
      'cap1-G Access=115086,36481 miles = EL «Previsión Definitiva» EXACTO y ≠ «Presupuesto Inicial» ' +
      '110693,14223 (prueba de campo). Ratios Andalucía LIQ2024/2025 coherentes. ' +
      'VERIFICADA PUBLICACIÓN — es definitivo/previsión, NO inicial.',
    cambioPendiente: null,
  },
  {
    slug: 'conprel_liq_recaudacion_corriente_importe',
    familia: 'liq',
    columna: 'importel',
    nombre: 'Recaudación o pagos líquidos — ejercicio corriente',
    unidad: 'euros',
    verificacion: 'verificado',
    evidencia:
      'Agente A (PDF 809 L437 «recaudación o pagos líquidos… ejercicio corriente»): Ceuta I1 ' +
      'Access=9229,49629 miles = EL «Recaudación Líquida Ejercicio corriente» EXACTO; G1 ' +
      '108733,7153 EXACTO; ratios Andalucía coherentes. VERIFICADA PUBLICACIÓN. ' +
      '(Corrige la hipótesis previa «liquidado» del diseño §3.)',
    cambioPendiente: null,
  },
  {
    slug: 'conprel_liq_recaudacion_cerrados_importe',
    familia: 'liq',
    columna: 'importec',
    nombre: 'Recaudación o pagos líquidos — ejercicios cerrados',
    unidad: 'euros',
    verificacion: 'verificado',
    evidencia:
      'Agente A (PDF 809 L438 «ejercicios cerrados»): Ceuta I1=2263,35627 y G1=0,65628 miles = EL ' +
      'EXACTO. Ceros masivos (~74% filas) = ausencia real de ejercicios cerrados, 0 NULLs ' +
      '(ceros reales conservados como 0). VERIFICADA PUBLICACIÓN. ' +
      '(Corrige la hipótesis previa «ejercicio corriente» del diseño §3.)',
    cambioPendiente: null,
  },
]

export const CONPREL_SLUGS: readonly ConprelSlugDef[] = [
  ...CONPREL_SLUGS_PPTO,
  ...CONPREL_SLUGS_LIQ,
]

const byColumnaFamilia = new Map(CONPREL_SLUGS.map((s) => [`${s.familia}:${s.columna}`, s]))

export function conprelSlugFor(familia: ConprelFamilia, columna: string): ConprelSlugDef {
  const def = byColumnaFamilia.get(`${familia}:${columna}`)
  if (!def) throw new Error(`CONPREL: sin slug definido para familia=${familia} columna=${columna}`)
  return def
}

export function conprelSlugsForFamilia(familia: ConprelFamilia): ConprelSlugDef[] {
  return CONPREL_SLUGS.filter((s) => s.familia === familia)
}

/** Estado de tupla del envelope derivado de la verificación de la magnitud. */
export function conprelEstadoTupla(def: ConprelSlugDef): string {
  return def.verificacion === 'verificado' || def.verificacion === 'patron' ? 'validado' : 'pendiente'
}
