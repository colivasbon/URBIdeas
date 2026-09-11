// Herramienta interna de actualización de capas INE — SOLO SERVIDOR.
//
// Decisión de seguridad documentada: el repositorio NO dispone de un sistema
// real de autenticación/autorización de usuarios (solo existe el secreto
// compartido `SOCIDEAS_SYNC_TOKEN` para las rutas de sync). Por tanto:
//   - La interfaz del botón permanece oculta salvo entorno interno local.
//   - Ninguna escritura puede dispararse desde el navegador.
//   - `applyMunicipalUpdate` NO escribe: devuelve bloqueo explícito mientras no
//     exista una capa INE aprobada por preflight y una autorización real.
// Sin secretos, sin rutas R2, sin stack traces en la respuesta.

import {
  buildMunicipalUpdatePreview,
  readMunicipalIneLayers,
  UPDATE_BLOCKED_REASON,
  type MunicipalUpdatePreview,
} from './socideas-ine-layers'
import { readTemporaryMunicipalData } from './socideas-temporary-data'

export { APPROVED_LAYERS_FOR_LOAD, UPDATE_BLOCKED_REASON } from './socideas-ine-layers'
export type { LayerPreviewItem, MunicipalUpdatePreview } from './socideas-ine-layers'

/** Vista previa de solo lectura: qué hay, de qué período y si es definitivo. */
export async function previewMunicipalUpdate(codigoIne: string): Promise<MunicipalUpdatePreview> {
  const [layers, temporary] = await Promise.all([
    readMunicipalIneLayers(codigoIne).catch(() => null),
    readTemporaryMunicipalData(codigoIne).catch(() => null),
  ])
  return buildMunicipalUpdatePreview(
    codigoIne,
    layers,
    temporary ? { label: temporary.label, source: temporary.source, period: temporary.period } : null,
  )
}

export interface ApplyResult {
  written: false
  blocked: true
  reason: string
}

/**
 * Ejecuta (o intenta ejecutar) una actualización del municipio abierto.
 * En esta versión NUNCA escribe: sin capa aprobada y sin autorización real de
 * usuario, devuelve bloqueo explícito. El escritor real vive en el script CLI
 * `load-ine-layers-r2.ts`, que exige preflight validado y `--confirm-r2-write`.
 */
export async function applyMunicipalUpdate(codigoIne: string): Promise<ApplyResult> {
  const preview = await previewMunicipalUpdate(codigoIne)
  if (!preview.canWrite) {
    return { written: false, blocked: true, reason: UPDATE_BLOCKED_REASON }
  }
  return { written: false, blocked: true, reason: 'La escritura desde la interfaz no está habilitada en esta versión.' }
}
