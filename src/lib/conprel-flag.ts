// Flag de publicación de la UI CONPREL — única fuente de verdad.
//
// OFF por defecto: los indicadores CONPREL NO se publican hasta datos
// validados + autorización (gate de docs/conprel-integracion-partial-diseno.md §9).
// El flag es doble llave junto al gate de carga: activar la UI sin datos
// cargados muestra «bloque preparado, no publicado», nunca cifras inventadas.
//
// Activación: NEXT_PUBLIC_CONPREL_UI=true en el entorno (ver docs/conprel-ui-flag.md).
// Lectura en cada llamada (no en carga de módulo) para que los tests/scripts
// puedan alternar el flag con process.env.

/** UI CONPREL visible en ficha y XLSX. false salvo activación explícita. */
export function isConprelUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CONPREL_UI === 'true'
}

/**
 * Envelope mock de desarrollo/QA con fixtures de
 * docs/conprel-producto-textos.md §6 (S1–S4). SOLO desarrollo local:
 * nunca activar en producción. Requiere además NEXT_PUBLIC_CONPREL_UI=true
 * para pintar la sección.
 */
export function isConprelMockEnabled(): boolean {
  return process.env.SOCIDEAS_CONPREL_MOCK === 'true'
}
