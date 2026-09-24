# Backlog — Hardening de revalidación (Cambio 8 EXCLUIDO, fase 3)

> Estado: **B1 y B3 implementados** (verificados en producción y en rama). **B2
> implementado en `feat/ops-runbook`** (sin rotar secretos; ventana de rotación
> documentada abajo). **B4 sigue pendiente** de permiso humano en Vercel
> (403 del conector). Motivo histórico de la exclusión en fase 3: no mezclar
> TTL de R2, contratos de secretos y rate limiting con la estabilización
> actual (la invalidación selectiva ya funciona en producción).

## B1 — Reducir `Cache-Control` del objeto R2 — IMPLEMENTADO ✅

| Campo | Valor |
|---|---|
| Estado | **Implementado y verificado en producción** (re-put idéntico `28079` → `Cache-Control: 300`). Objetos no re-put siguen `86400` hasta el próximo put. |
| Amenaza que mitiga | `putMunicipioJson` publicaba `Cache-Control: public, max-age=86400`; tras invalidar la Data Cache (tag), un refetch al origen podía recibir copia de borde/CDN de hasta 24 h. |
| Implementado | `src/lib/socideas-r2.ts` (`putMunicipioJson`): `public, max-age=300, must-revalidate` + comentario de motivo (invalidación por tag + ventana de borde ≤5 min). NO se tocó el TTL de `unstable_cache` (3600) ni las tags. |
| Evidencia de pruebas | `npx tsc -p tsconfig.json --noEmit` → 0 errores (baseline). `npx tsx scripts/verify-revalidate.ts` → OK (contrato de revalidación intacto). Lectura pública R2 no autenticada y sin cambio de clave/envelope. |
| Compatibilidad | Lectura pública R2 no autenticada; sin cambio de clave ni de envelope. Aumenta ligeramente los MISS al origen (5 min en vez de 24 h). |
| Rollback | Restaurar `max-age=86400` en `putMunicipioJson` (`git revert` del commit B1). |
| QA pendiente (tras despliegue) | Comprobar header `cache-control` en un GET al origen R2 sobre un objeto recién escrito; E2E local `verify-cache-invalidation-e2e.ts`; muestra `verify-revalidate-muestra.ts`. |
| Dictamen | **Suficiente** — ver `docs/analisis-b1-b3-rate-limit-suficiencia.md`. |

## B2 — Separar `SOCIDEAS_REVALIDATE_TOKEN` del fallback `SOCIDEAS_SYNC_TOKEN` — IMPLEMENTADO ✅ (rotación pendiente)

| Campo | Valor |
|---|---|
| Estado | **Implementado en `feat/ops-runbook`** (route + lib + suites). **Secretos NO rotados** en esta misión. El token dedicado `SOCIDEAS_REVALIDATE_TOKEN` ya existía en Production. |
| Amenaza que mitiga | El endpoint y la clienta aceptaban `SOCIDEAS_REVALIDATE_TOKEN \|\| SOCIDEAS_SYNC_TOKEN`: un token de sync filtrado habilitaba invalidación masiva (hasta 2.000 tags/petición). |
| Implementado | `src/app/api/socideas/revalidate/route.ts`: `expected = process.env.SOCIDEAS_REVALIDATE_TOKEN` **sin** `\|\| SOCIDEAS_SYNC_TOKEN`. `src/lib/socideas-revalidate.ts` (`revalidateMunicipios`): token de cliente solo `SOCIDEAS_REVALIDATE_TOKEN`. `scripts/verify-revalidate.ts` e `verify-revalidate-muestra.ts`: sin fallback SYNC. `.env.example`: nombres de `SOCIDEAS_REVALIDATE_TOKEN` + `SOCIDEAS_REVALIDATE_BASE_URL`. |
| Contrato resultante | Sin `SOCIDEAS_REVALIDATE_TOKEN` en env → **503**. Con dedicado configurado: valor correcto → auth OK; **valor SYNC o ausente → 401**. `POST /sync` y `/sync-economia` **no se tocan** (siguen con `x-sync-token`). |
| Evidencia de pruebas | `tsc --noEmit` → 0. `npx tsx scripts/verify-revalidate.ts` → OK, matriz B2 sobre el **handler real**: solo-REVALIDATE pasa auth (400 body); SYNC → 401; ambos en env → SYNC 401 / REVALIDATE OK; solo SYNC en env → 503; GET → 405. Muestra producción con solo REVALIDATE (QA misión). |
| Compatibilidad | Loaders con `SOCIDEAS_REVALIDATE_TOKEN` en `.env.local`/entorno: sin cambio. Cualquier llamador que enviara SOLO SYNC a `/revalidate` → 401 → degradación auditada (`data_sync_runs`), R2 intacto. |
| Plan de pruebas loaders | (1) `npx tsx scripts/verify-revalidate.ts` (unit + B2 handler). (2) `--integration http://127.0.0.1:3111` con `SOCIDEAS_REVALIDATE_TOKEN` exportada. (3) `npx tsx scripts/verify-revalidate-muestra.ts` en producción (token dedicado). (4) Smoke de un loader write-inerte: dry-run CONPREL no requiere token de revalidación. |
| Rollback | Restaurar el `\|\|` en route + lib (`git revert`). Si ya se rotó SYNC: emitir valor nuevo y reactualizar env (preferible a reutilizar el anterior). |

### Ventana de rotación de `SOCIDEAS_SYNC_TOKEN` (DOCUMENTADA — NO EJECUTAR en esta misión)

Objetivo: invalidar cualquier copia del SYNC que pudiera haberse filtrado **ya no** abre `/revalidate` (B2), pero sigue abriendo `/sync*`.

| Paso | Acción | Dónde |
|---|---|---|
| R0 | Confirmar B2 desplegado y `verify-revalidate` en verde en producción | rama + deploy |
| R1 | Inventario de consumidores de SYNC: Vercel env `SOCIDEAS_SYNC_TOKEN` (si existe), `.env.local` de operadores, CI, notas internas | grep repo + Vercel Project → Settings → Environment Variables |
| R2 | Generar valor nuevo: `openssl rand -hex 32` (no imprimir en chat) | terminal local del operador |
| R3 | **Ventana corta:** publicar el nuevo valor en **todos** los consumidores de `/sync*` (Vercel + quien ejecute sync) **en la misma ventana** | Vercel Dashboard + `.env.local` |
| R4 | Invalidar el valor anterior (borrar del gestor/Vercel; no reutilizar) | Vercel |
| R5 | Smoke: `POST /api/socideas/sync-economia/{INE}?dryRun=true` con `x-sync-token` nuevo → no-401; `POST /api/socideas/revalidate` con SYNC → sigue 401 | probes |
| R6 | Registrar fecha y `run_id`/ticket en esta tabla | docs |

**Separación de ventanas:** no rotar REVALIDATE y SYNC a la vez sin checklist; REVALIDATE ya es el único válido en `/revalidate`. **Esta misión no rota ningún secreto ni cambia env de producción.**

## B3 — Rate limit del endpoint `/api/socideas/revalidate` — IMPLEMENTADO ✅

| Campo | Valor |
|---|---|
| Estado | **Implementado** (código en rama; producción verificada con 429 en ~petición 58 + Retry-After; tráfico normal 10×200 OK). |
| Amenaza que mitiga | Con token válido, bucle de petición → purga de caché masiva (disponibilidad, no confidencialidad). |
| Implementado | `src/app/api/socideas/revalidate/route.ts`: contador deslizante 60 s **en memoria** por IP (`x-forwarded-for`): máx **60 peticiones autenticadas/min** y techo acumulado de **5.000 INEs/min**. Respuesta **429** + `Retry-After`; auth **siempre antes** del rate. **Serverless: best-effort por instancia**. |
| Dictamen suficiencia | **SUFICIENTE para el volumen actual y el riesgo de bucle** (amplificación multi-instancia residual documentada; impacto solo caché). Alternativas distribuidas **no** introducidas — ver `docs/analisis-b1-b3-rate-limit-suficiencia.md`. |
| Evidencia de pruebas | `tsc` → 0. `verify-revalidate.ts` → OK (incluye unit 60/61 y 5000/5001). Producción: 429 + Retry-After; 10×200 OK. |
| Compatibilidad | Loaders: 1 petición/lote ≤200 INE → muy por debajo de 60/min. |
| Rollback | Quitar el bloque B3 del route (`git revert`). |
| QA pendiente (tras despliegue) | 61 POST autenticados <60 s → 429; >5000 INEs → 429; sin token → 401 (no 429); loader → 200. |

## B4 — Acceso del conector Vercel a Runtime Errors/Logs — PENDIENTE (humano)

| Campo | Valor |
|---|---|
| Estado | **Pendiente. NO resuelto por API/MCP en 2026-09-24:** `get_runtime_errors` → `403 Forbidden`; `get_runtime_logs` → `403 Forbidden` (`You don't have permission to access this resource`). No se pidieron tokens por chat ni se cambiaron permisos de producción. |
| Amenaza que mitiga | Cierre de observabilidad independiente («0 errores runtime»). |
| Paso exacto para un humano (Vercel Dashboard) | 1) Abrir **vercel.com** → equipo/owner del proyecto **`urb-ideas`**. 2) **Settings → Tokens** (o **Settings → Integrations** si el MCP se autentica por OAuth/integración). 3a) Si es **token de acceso:** crear/seleccionar un token del **mismo equipo** con lectura de proyecto y logs (scope de lectura; no reutilizar un token con solo despliegue o de otro equipo). 3b) Si es **integración/MCP OAuth:** reautorizar la conexión y conceder permisos de **solo lectura** de **Observability / Logs / Errors** para el proyecto `urb-ideas`. 4) Verificar en UI: **Observe → Errors** y **Observe → Logs** del proyecto cargan sin 403. 5) Reintentar la consulta del conector (`get_runtime_errors` / `get_runtime_logs`); debe dejar de devolver 403. |
| Efectos | El conector podrá consultar errores/logs con solo lectura; ningún token nuevo se materializa en el repo ni en respuestas de chat. |
| Sin permiso | QA observacional se apoya en logs estructurados (`SOCIDEAS_*`), probes HTTP, `qa:produccion` y estado de deployments. |
| Rollback | Revocar el permiso/scope en el conector (vuelve a 403; sin efecto en runtime). |
| Plan de pruebas (tras habilitar) | Consultar errores desde ventana posterior al último deploy; contrastar 0 clusters o listarlos; cruzar con QA. |

## Criterio de apertura de este backlog (histórico)

Poder abrir la implementación exige una misión tipo «Fase 4 — hardening» con aporte explícito, QA completo (lint/tsc/tests/build/SSR 750/XLSX 30/cobertura 14) y decisión consciente de no regresar a purgas globales ni TTL a 0. **Cumplido:** B1 y B3 (código + QA); B2 implementado en `feat/ops-runbook` con tests locales; rotación de SYNC y B4 quedan como pasos humanos documentados.

