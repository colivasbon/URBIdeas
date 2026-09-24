# Backlog — Hardening de revalidación (Cambio 8 EXCLUIDO, fase 3)

> Estado: **parcialmente implementado** en la rama `feat/conprel-integral`
> (B1 y B3; pendiente de despliegue + QA de producción). B2 y B4 siguen como
> **propuestas para decisión** (no implementados). Motivo histórico de la
> exclusión en fase 3: no mezclar TTL de R2, contratos de secretos y rate
> limiting con la estabilización actual (la invalidación selectiva ya funciona
> en producción).

## B1 — Reducir `Cache-Control` del objeto R2 — IMPLEMENTADO ✅

| Campo | Valor |
|---|---|
| Estado | **Implementado en rama `feat/conprel-integral` (pendiente de despliegue + QA)**. |
| Amenaza que mitiga | `putMunicipioJson` publicaba `Cache-Control: public, max-age=86400`; tras invalidar la Data Cache (tag), un refetch al origen podía recibir copia de borde/CDN de hasta 24 h. |
| Implementado | `src/lib/socideas-r2.ts` (`putMunicipioJson`): `public, max-age=300, must-revalidate` + comentario de motivo (invalidación por tag + ventana de borde ≤5 min). NO se tocó el TTL de `unstable_cache` (3600) ni las tags. |
| Evidencia de pruebas | `npx tsc -p tsconfig.json --noEmit` → 0 errores (baseline). `npx tsx scripts/verify-revalidate.ts` → OK (contrato de revalidación intacto). Lectura pública R2 no autenticada y sin cambio de clave/envelope. |
| Compatibilidad | Lectura pública R2 no autenticada; sin cambio de clave ni de envelope. Aumenta ligeramente los MISS al origen (5 min en vez de 24 h). |
| Rollback | Restaurar `max-age=86400` en `putMunicipioJson` (`git revert` del commit B1). |
| QA pendiente (tras despliegue) | Comprobar header `cache-control` en un GET al origen R2 sobre un objeto recién escrito; E2E local `verify-cache-invalidation-e2e.ts`; muestra `verify-revalidate-muestra.ts`. |

## B2 — Separar `SOCIDEAS_REVALIDATE_TOKEN` del fallback `SOCIDEAS_SYNC_TOKEN` — PROPUESTA (decisión pendiente)

| Campo | Valor |
|---|---|
| Estado | **Propuesta para decisión.** NO implementado. Contexto nuevo: el token dedicado `SOCIDEAS_REVALIDATE_TOKEN` **YA existe en Production**. |
| Amenaza que mitiga | El endpoint y la clienta aceptan hoy `SOCIDEAS_REVALIDATE_TOKEN \|\| SOCIDEAS_SYNC_TOKEN` (`route.ts` y `socideas-revalidate.ts`): un token de sync filtrado habilita invalidación masiva (hasta 2.000 tags/petición). |
| Diseño propuesto | Quitar el fallback `\|\| SOCIDEAS_SYNC_TOKEN` en `src/app/api/socideas/revalidate/route.ts` y `src/lib/socideas-revalidate.ts` (route + lib). Rotar `SOCIDEAS_SYNC_TOKEN` después para invalidar cualquier copia filtrada. Actualizar `verify-revalidate.ts` (línea del token de integración) y `.env.example` (solo nombres). |
| Efectos exactos | (1) Cualquier llamador que siga enviando SOLO `SOCIDEAS_SYNC_TOKEN` a `/api/socideas/revalidate` recibirá **401** → su revalidación quedará como degradación auditada (`data_sync_runs` estado `error`/`partial`), R2 intacto. (2) Los loaders/script que envían `SOCIDEAS_REVALIDATE_TOKEN` (ya presente en Production) no notan cambio. (3) `POST /api/socideas/sync/[codigoINE]` y `sync-economia` siguen usando `SOCIDEAS_SYNC_TOKEN` en `x-sync-token` — **no se tocan** (otro canal). (4) La rotación de SYNC obliga a actualizar env de sync (Vercel + quien ejecute loaders) en la misma ventana. |
| Compatibilidad | Confirmar antes (grep en repositorio + env de Production) que ningún loader/entorno sigue llamando a la ruta de revalidación solo con SYNC. |
| Coste | 2–4 líneas + matriz endpoint + actualización de `.env.example` (solo nombres) + rotación de secreto en plataforma. |
| Plan de pruebas | Matriz 405/401/400/200 con cada token por separado; `verify-revalidate --integration`; muestra de 10 en producción con `SOCIDEAS_REVALIDATE_TOKEN` únicamente. |
| Rollback | Restaurar el `\|\|` en route + lib (`git revert`). Si ya se rotó SYNC: volver a publicar el valor anterior solo si se conservó en el gestor de secretos (preferible: emitir uno nuevo y reactualizar env). |

## B3 — Rate limit del endpoint `/api/socideas/revalidate` — IMPLEMENTADO ✅

| Campo | Valor |
|---|---|
| Estado | **Implementado en rama `feat/conprel-integral` (pendiente de despliegue + QA)**. |
| Amenaza que mitiga | Con token válido, bucles de petición → purga de caché masiva (disponibilidad, no confidencialidad). |
| Implementado | `src/app/api/socideas/revalidate/route.ts`: contador deslizante 60 s **en memoria** por IP (`x-forwarded-for`): máx **60 peticiones autenticadas/min** y techo acumulado de **10.000 INEs/min** (antes 5.000; catálogo completo ≈8.132 INE = 41 lotes de ≤200 — con 5.000 el lote 26 recibía 429 y la revalidación quedaba degradada; defecto Q6-A14 del QA Subagente 6). Respuesta **429** + header `Retry-After`, mensaje genérico sin secretos; log `outcome=rate_limited` con `limit` y `retry_after_s` (sin IP ni token). Orden preservado: GET→405, sin token→401 (**auth ANTES del rate limit**, sin sondeo), payload inválido→400, lote>2000→400, válido→200. Solo peticiones autenticadas consumen cupo; el techo de INEs se carga solo tras payload válido. **Serverless: best-effort por instancia** (Map propio por aislamiento; no es quota distribuido — documentado en el código). |
| Evidencia de pruebas | `npx tsc -p tsconfig.json --noEmit` → 0 errores. `npx tsx scripts/verify-revalidate.ts` → OK (matriz de contrato intacta). Probes contra producción (build actual sin B3): GET→405, POST sin token→401. Unitario del contador: funciones exportadas `consumeRateRequest`/`consumeRateInes` (agotamiento a los 60/10000, liberación por ventana; 41×200 INE caben). |
| Compatibilidad | Los loaders actuales hacen 1 petición por lote (≤200 INE): 60 req/min cubren 41 lotes; 10000 INE/min cubren el catálogo completo sin 429. |
| Rollback | (code) quitar el bloque B3 del route (`git revert`); no toca el contrato del body ni el de 401/400/200. |
| QA pendiente (tras despliegue) | 61 POST autenticados en <60 s → 429 en el 61.ª con `Retry-After`; superar 10000 INEs válidos/min → 429; sin token → sigue siendo 401 (no 429); carga normal de un loader → 200. |

## B4 — Acceso del conector Vercel a Runtime Errors/Logs (limitación conocida) — PROPUESTA (decisión pendiente)

| Campo | Valor |
|---|---|
| Estado | **Propuesta para decisión. NO implementado.** Permiso de lectura Runtime Errors/Logs del conector Vercel **pendiente** (403 documentado; sin tokens manuales). |
| Amenaza que mitiga | Cierre de observabilidad: en la fase 3 no pudo contrastarse «0 errores runtime» de forma independiente porque el conector Vercel devolvió **403 Forbidden** al consultar errores agrupados del proyecto. El despliegue READY, SHA y comprobaciones de QA sí se corroboraron por ese canal. |
| Registro | Limitación de permisos del conector (no contradice el QA entregado; salvedad del cierre de fase 3, 2026-09-22). |
| Diseño propuesto | Habilitar al conector permiso de **solo lectura** de Runtime Errors/Logs del proyecto `urb-ideas` en Vercel (sin compartir tokens manualmente; vía configuración del conector/integración). |
| Efectos exactos | (1) El conector podrá consultar errores agrupados y logs de runtime con el rol de solo lectura de la integración; ningún token nuevo se materializa en el repo ni en respuestas. (2) Sin permiso: toda consulta a Runtime Errors/Logs sigue devolviendo 403 — el QA observacional se apoya en logs estructurados locales (`SOCIDEAS_*`), probes HTTP y estado de deployments. |
| Coste | Bajo (configuración de plataforma, sin código). |
| Plan de pruebas | Tras habilitar: consultar errores desde ventana posterior a `da880ca` y confirmar 0 o listar clusters; contrastar con QA. |
| Rollback | Revocar el permiso de lectura en el conector (la observación vuelve a 403, sin efecto en runtime). |

## Criterio de apertura de este backlog (histórico)

Poder abrir la implementación exige una misión tipo «Fase 4 — hardening» con aporte explícito, QA completo (lint/tsc/tests/build/SSR 750/XLSX 30/cobertura 14) y decisión consciente de no regresar a purgas globales ni TTL a 0. **Cumplido parcialmente:** B1 y B3 implementados en `feat/conprel-integral` con tsc/tests baseline OK; el despliegue y el QA post-despliegue quedan en manos del orquestador.
