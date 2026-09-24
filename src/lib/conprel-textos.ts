// Textos contractuales CONPREL — módulo puro SIN imports del catálogo
// (evita el ciclo catalog → presentation → availability → catalog).
// Fuente: docs/conprel-producto-textos.md §4 (inserción en ficha/XLSX).

/** (a) Aviso de serie `partial`. */
export const CONPREL_NOTA_SERIE =
  'Serie CONPREL · partial. Presupuestos 2025 (definitivo): 7.345 de 8.132 municipios (90,3 %). ' +
  'Liquidaciones 2024 (definitiva): 6.861 de 8.132 (84,4 %). Cada familia tiene cobertura propia; ' +
  'los avances no se publican como cobertura. Fuente: Ministerio de Hacienda (CONPREL).'

/** (b) Nota ND municipal. */
export const CONPREL_NOTA_ND =
  'ND = no consta registro municipal en el fichero consultado. Nunca equivale a 0 y no se imputa causa ' +
  '(p. ej. régimen foral) sin prueba caso a caso.'

/** (e) Anti-comparación. */
export const CONPREL_NOTA_ANTI_COMPARACION =
  'Presupuesto, liquidación y avance son ficheros y ejercicios distintos: no se calcula ejecución ' +
  'cruzando familias ni se presentan avances como definitivos. ND ≠ 0.'

/** Ausencia de fila: texto aprobado (NUNCA «el ayuntamiento no remitió»). */
export const CONPREL_AUSENCIA_TEXTO =
  'No consta registro municipal en el fichero consultado.'

/** Bloque con flag ON pero sin dataset cargado (ni R2 ni mock). */
export const CONPREL_NO_PUBLICADO_TEXTO =
  'Bloque CONPREL preparado, no publicado: los datos de la serie aún no se han cargado. ' +
  'No se muestra ningún valor ni ausencia municipal hasta la carga validada.'

/** Pie (d) por familia. */
export const CONPREL_PIE_PPTO =
  'Presupuesto = importe de la publicación definitiva CONPREL (ejercicio 2025). Etiqueta de fase ' +
  'pendiente de verificación V1: no usar «inicial».'

export const CONPREL_PIE_LIQ =
  'Reconocidos = derechos liquidados (I) / obligaciones reconocidas netas (G) · Liquidado = ' +
  'recaudación o pagos líquidos del ejercicio. Presupuesto de la publicación ≠ liquidación.'

/** Cobertura baseline congelada (denominador 8.132 del catálogo SOCideas).
 *  Las cifras van ya formateadas en español: no depender de ICU/locale del runtime. */
export const CONPREL_DENOMINADOR = 8132
export const CONPREL_DENOMINADOR_TEXTO = '8.132'

export const CONPREL_COBERTURA_PCT = { ppto: '90,3', liq: '84,4' } as const
export const CONPREL_COBERTURA_PRESENTES = { ppto: 7345, liq: 6861 } as const
export const CONPREL_COBERTURA_PRESENTES_TEXTO = { ppto: '7.345', liq: '6.861' } as const

/** Fila extra hoja 08 «Fuentes oficiales utilizadas» (§5). */
export const CONPREL_FUENTE_08_OPERACION =
  'Presupuestos y liquidaciones EELL · PPTO-2025: partial 90,3 %; LIQ-2024: partial 84,4 %; ND≠0'
export const CONPREL_FUENTE_08_PERIODO = 'PPTO 2025 def · LIQ 2024 def'

/** Fila de glosario hoja 08 (§4c). */
export const CONPREL_GLOSARIO_ESTADO = 'partial (CONPREL)'
export const CONPREL_GLOSARIO_TEXTO =
  'cobertura parcial nacional por familia/ejercicio (presupuestos 90,3 % · liquidaciones 84,4 %); ' +
  'ausencia municipal = ND, no 0; avances excluidos de la cobertura.'
