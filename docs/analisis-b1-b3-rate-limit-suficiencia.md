# Análisis B1/B3 — Suficiencia del rate limit por instancia

**Fecha:** 2026-09-24 · **Rama:** `feat/ops-runbook` · **Estado:** dictamen (sin cambio de límites en producción)

## Contexto de riesgo

Riesgo evaluado: **bucle de revalidación masiva** — un fallo de cliente o un token filtrado que dispare `POST /api/socideas/revalidate` de forma repetida y vacíe la Data Cache (purga de tags `socideas-muni-*`), provocando stampede SSR/R2. No es un riesgo de confidencialidad ni de corrupción de datos R2.

Restricción de la misión: no introducir servicio nuevo por reflejo (KV/DO solo si hace falta).

## B1 — `Cache-Control` del objeto R2

| Aspecto | Valor |
|---|---|
| Código | `src/lib/socideas-r2.ts` → `putMunicipioJson`: `public, max-age=300, must-revalidate` |
| Producción | Verificado con re-put idéntico de `28079` → `Cache-Control: 300` |
| Objetos no re-put | Siguen con `86400` hasta el próximo put (ventana residual conocida) |
| TTL Data Cache | `unstable_cache` 3600 + tags sin cambios |

**Dictamen B1: SUFICIENTE.** Tras un put + revalidación por tag, el peor caso de copia de borde es ≤5 min (must-revalidate). El caso 86400 residual solo aplica a objetos que no se re-escriben en un run; los loaders siempre `putMunicipioJson` antes de `revalidateAfterWrites`, de modo que los objetos tocados en un run quedan a 300 s.

## B3 — Rate limit en `/api/socideas/revalidate`

Implementación actual (`route.ts`):

- Ventana deslizante 60 s **en memoria, por instancia serverless** (`Map` por IP de `x-forwarded-for`).
- Máx **60 peticiones autenticadas/min** e **5.000 INEs/min** acumulados.
- **Auth antes del rate** (`x-revalidate-token`): sin token válido no hay sondeo ni consumo de cupo.
- 429 + `Retry-After`; log sin IP ni secretos.
- La clienta (`postBatch`) reintenta 5xx/429 con backoff exponencial (base 500 ms), no en bucle cerrado.

### Volumen actual (carga legítima)

| Escenario | Peticiones | INEs |
|---|---|---|
| Lote loader (`REVALIDATE_BATCH_SIZE=200`) | 1 / lote | ≤200 |
| Nacional ~8.132 INE, serial | ~41 / run | 8.132 |
| Muestra QA 10 | 1 | 10 |

Los 60 req/min y 5.000 INE/min dejan **holgura** para un run nacional serial (~41 lotes). Un bucle legítimo mal escrito topa a los 60 req/min **por instancia** en <1 min y recibe 429 con Retry-After.

### Amplificación multi-instancia (residual conocida)

Cada instancia serverless mantiene su propio `Map`. En el peor caso con *N* instancias calientes el techo agregado es `N×60` req/min y `N×5000` INE/min. Para esta ruta (tráfico de operador/loader, no anónimo) *N* suele ser baja; no hay cuota global distribuida.

**Impacto si se supera el techo agregado:** solo invalidación de tags → caída de caché y carga en origen (disponibilidad). **R2 y `data_sync_runs` no se tocan** con `revalidateTag`.

### Factores que reducen la necesidad de un límite distribuido

1. **Auth obligatoria** (B2 además acota el blast radius de un SYNC filtrado).
2. **Daño acotado a caché**, no a datos.
3. **Volumen operativo** muy por debajo de los umbrales por instancia.
4. **Sin servicio de cuota externo** hoy: KV/DO añadiría dependencia, env y fallo nuevo.

## Dictamen conjunto

| Ítem | Suficiente para el riesgo actual (bucle masivo)? |
|---|---|
| B1 | **Sí** — ventana de borde ≤5 min en objetos re-put; residual 24 h solo en no re-put. |
| B3 | **Sí, para el volumen actual y el perfil de llamador autenticado único.** El límite por instancia frena bucles concentrados; la amplificación multi-instancia es residual y su impacto es solo caché. |

**No se introduce** Durable Object, KV ni otro servicio de cuota en esta misión.

### Contingencia (si escalara el riesgo)

Activar solo si: (a) evidencia de loops multi-instancia en producción, o (b) compromiso del token con abuso observable. Opciones por orden de coste:

1. **Endurecer umbrales** en el mismo `Map` (p. ej. 20 req/min + 2.000 INEs/min) — sigue sin servicio nuevo; revalidar que un run nacional serial no rompa (41 lotes < 20/min requiere pausa entre lotes o subir solo el techo de INEs).
2. **Techo de INEs por run** (contador por `run_id` en el body) — más complejo, aún en memoria.
3. **Cuota distribuida** (KV con TTL de 60 s o Durable Object) — solo si el techo por instancia se demuestra insuficiente; implica servicio nuevo y review de coste/latencia.

### Evidencia en esta rama

- `npx tsc -p tsconfig.json --noEmit` → 0.
- `npx tsx scripts/verify-revalidate.ts` → OK (incluye tests unitarios de `consumeRateRequest`/`consumeRateInes` y la matriz B2 sobre el handler real).

Ver también: `docs/backlog-hardening-revalidacion.md` (B1/B3), `docs/runbook-socideas-operaciones.md` (operación).
