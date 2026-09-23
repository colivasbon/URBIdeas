# Backlog — Hardening de revalidación (Cambio 8 EXCLUIDO, fase 3)

> Estado: **backlog**. No implementar hasta una misión posterior que lo autorice explícitamente.
> Motivo de exclusión: no mezclar TTL de R2, contratos de secretos y rate limiting con la estabilización actual (la invalidación selectiva ya funciona en producción).

## B1 — Reducir `Cache-Control` del objeto R2

| Campo | Valor |
|---|---|
| Amenaza que mitiga | `putMunicipioJson` publica `Cache-Control: public, max-age=86400`; tras invalidar la Data Cache (tag), un refetch al origen podría recibir copia de borde/CDN de hasta 24 h. |
| Diseño propuesto | Cambiar a `max-age=300, must-revalidate` (o `no-cache`) en `src/lib/socideas-r2.ts` (`putMunicipioJson`). Los read-backs de scripts ya usan cache-buster `?v=`. |
| Compatibilidad | Lectura pública R2 no autenticada; sin cambio de clave ni de envelope. Aumenta ligeramente los MISS al origen. |
| Coste | 1 línea + QA de lectura. |
| Plan de pruebas | E2E local `verify-cache-invalidation-e2e.ts`; muestra `verify-revalidate-muestra.ts`; comprobar header en un GET al origen R2. |
| Rollback | Restaurar `max-age=86400` en `putMunicipioJson` (`git revert`). |

## B2 — Separar `SOCIDEAS_REVALIDATE_TOKEN` del fallback `SOCIDEAS_SYNC_TOKEN`

| Campo | Valor |
|---|---|
| Amenaza que mitiga | El endpoint acepta hoy `SOCIDEAS_REVALIDATE_TOKEN \|\| SOCIDEAS_SYNC_TOKEN`: un token de sync filtrado habilita invalidación masiva (hasta 2.000 tags/petición). |
| Diseño propuesto | Endpoint y clienta solo con `SOCIDEAS_REVALIDATE_TOKEN` (ya existe en Production); retirar el fallback. Rotar `SOCIDEAS_SYNC_TOKEN` si se desea alinearlo. |
| Compatibilidad | Requiere confirmar que ningún loader/entorno sigue llamando solo con SYNC_TOKEN. |
| Coste | 2 líneas + matriz endpoint + actualización de `.env.example` (solo nombres). |
| Plan de pruebas | Matriz 405/401/400/200 con cada token; verify-revalidate; muestra de 10 en producción. |
| Rollback | Restaurar el `||` en route + lib (`git revert`). |

## B3 — Rate limit del endpoint `/api/socideas/revalidate`

| Campo | Valor |
|---|---|
| Amenaza que mitiga | Con token válido, bucles de petición → purga de caché masiva (disponibilidad, no confidencialidad). |
| Diseño propuesta | Cuota por IP/token (p. ej. WAF de Vercel o contador en el route) + techo de INEs/minuto; respuesta 429 documentada. |
| Compatibilidad | Los loaders actuales hacen 1 petición por lote (≤200 INE): una cuota de p. ej. 30 req/min no los afecta. |
| Coste | Medio (política + tests). |
| Plan de pruebas | Unit de la cuota; prueba de agotamiento → 429; QA de loaders con dry-run. |
| Rollback | Desactivar la regla (env/flag) sin tocar el contrato del body. |

## B4 — Acceso del conector Vercel a Runtime Errors/Logs (limitación conocida)

| Campo | Valor |
|---|---|
| Amenaza que mitiga | Cierre de observabilidad: en la fase 3 no pudo contrastarse «0 errores runtime» de forma independiente porque el conector Vercel devolvió **403 Forbidden** al consultar errores agrupados del proyecto. El despliegue READY, SHA y comprobaciones de QA sí se corroboraron por ese canal. |
| Estado | **Limitación de permisos del conector** (no contradice el QA entregado; queda registrado como salvedad del cierre de fase 3, 2026-09-22). |
| Diseño propuesto | Habilitar al conector permiso de **solo lectura** de Runtime Errors/Logs del proyecto `urb-ideas` en Vercel (sin compartir tokens manualmente; vía configuración del conector/integración). |
| Coste | Bajo (configuración de plataforma, sin código). |
| Plan de pruebas | Tras habilitar: consultar errores desde ventana posterior a `da880ca` y confirmar 0 o listar clusters; contrastar con QA. |
| Rollback | Revocar el permiso de lectura en el conector. |

## Criterio de apertura de este backlog

Poder abrir la implementación exige una misión tipo «Fase 4 — hardening» con aporte explícito, QA completo (lint/tsc/tests/build/SSR 750/XLSX 30/cobertura 14) y decisión consciente de no regresar a purgas globales ni TTL a 0.
