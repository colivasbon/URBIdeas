# Informe QA adversarial SOCideas — Subagente 6

> **Fecha:** 2026-09-24 · **Rama:** `feat/qa-conprel` · **Worktree:** `wt-qa`
> **SHA baseline (producción READY `urb-ideas.vercel.app`):** `2b79ffe3fbaa1e4434e90db56b0b827814e82d16`
> (verificado vía API Vercel: deployment `dpl_5717eJp5dnXWxhHnjBzWEZdZWKpC`, `githubCommitSha=2b79ffe…`, `state=READY`, `target=production`)
> **Suite:** `scripts/qa-adversarial-socideas.ts` · **Typecheck scripts:** `scripts/tsconfig.qa-adv.json` → 0 errores
> **Restricciones respetadas:** sin escritura R2/Supabase; sin impresión de secretos; producción solo lectura + pruebas acotadas (1 POST revalidate de 3 INEs con `--revalidar`; 2 probes inertes 405/401).

---

## ANTES vs DESPUÉS de despliegue

| Fase | Contra qué corrió | Resultado |
|---|---|---|
| **BEFORE-fix (unit/estático/local)** | Código del worktree en `2b79ffe` + suite nueva, `--local-only` | **64 PASS · 8 FAIL · 3 defectos** (ver «Defectos encontrados») |
| **AFTER-fix (unit/estático/local)** | Mismo baseline + 4 fixes aplicados en `feat/qa-conprel` (NO desplegados) | **72 PASS · 0 FAIL · 0 defectos** |
| **AFTER-fix (producción read-only + acotado)** | Producción real = `2b79ffe` (¡los fixes NO están en prod!); SSR/R2/XLSX/revalidate-3 | **116 PASS · 0 FAIL · 0 defectos** |

**Importante:** las comprobaciones de producción validan el estado desplegado en `2b79ffe` (que NO incluye los fixes de este informe). Los fixes solo viven en `feat/qa-conprel`; tras merge+despliegue deberá reejecutarse:

```
npx tsx scripts/qa-adversarial-socideas.ts --revalidar
```

para confirmar AFTER-deploy. Los checks estáticos A7/A8/A14 de la suite leen el código del worktree (por eso pasan tras el fix aunque prod aún no lo lleve).

---

## Qué se probó (15 puntos de misión → áreas A1–A15)

| # | Misión | Área | Cómo | Resultado |
|---|---|---|---|---|
| 1 | Magnitudes/slugs mal etiquetados | A1 | Estático sobre `conprel-slugs.ts` + contratos: unicidad, columna∈contrato, semántica slug↔nombre↔columna, regla «sin inicial/definitivo en ppto», verificación↔estado, sin slugs obsoletos en `src/` | **PASS** (15 checks) |
| 2 | Doble cómputo por grupo `id` | A2 | Unit: fixture con 2 municipales + grupo compartiendo `id`; join real por `idente` (Madrid=[100]); simulación del algoritmo robo por `id` (300≠100) prueba que el test corta la clase; `InvMunicipal` sin campo `id` (garantía estructural); CSV real: 0 pares con `id` compartido | **PASS** |
| 3 | Inclusión accidental ZV/ZO | A3 | Matriz `esMunicipalCodente` (8 casos AA/ZZ/ZV/ZO/DD/MM/minúsculas/corto); fixtures con eco marcada de dependientes jamás publicada; CSV real: 7345 munis solo AA/ZZ, 7 ZV/ZO excluidas | **PASS** |
| 4 | Ausencia convertida en cero | A4 | Campo vacío → 0 tuplas; sin fila → `municipiosSinFilas`; merge de lote vacío = no-op (valor previo intacto); estático: `modoEscritura` salta si `tuplas==0` | **PASS** |
| 5 | Cero real convertido en ND | A5 | `0,00`×4 → 4 tuplas valor 0; round-trip merge+JSON conserva `0` (no `null`); contadores parser `ceros=4 nulos=0` | **PASS** |
| 6 | Duplicados y cambios de esquema | A6 | 4 duplicados → `ConprelBloqueoError`; 5 mutaciones de cabecera (fantasma/ausente/renombrada/orden/delimitador-coma) → `ConprelParseError`; BOM+cabecera correcta OK | **PASS** |
| 7 | Backup no restaurable | A7 | SA2 no mergeado → **dependencia marcada**; diseño probado con fixtures propias (sha256 backup→corrupción→restore byte-idéntico); estático del loader exigía backup previo al put | **PASS tras fix** (antes FAIL → defecto Q6-A7) |
| 8 | Envelope >150 KB | A8 | `CONPREL_MAX_ENVELOPE_BYTES==153600`; frontera `cabeEnvelope` 153599/153600/153601; alineación sizeFull↔write-gate; producción: 14 envelopes de muestra ≤150 KB | **PASS tras fix** (antes FAIL → defecto Q6-A8) |
| 9 | Pérdida de slugs tras merge | A9 | Merge ppto no pierde irpf/population/liq (`slugsPerdidos=[]`); tuplas LIQ intactas; idempotencia ×2; estático: loader filtra `familia === fam` | **PASS** |
| 10 | Caché sirve datos viejos | A10 | Estático B1 `max-age=300` + tags `socideas-muni-<ine>` iguales lectura/revalidación + auth antes de tasa en `POST`; producción R2↔SSR (Albacete/Madrid/Sevilla); **`--revalidar`**: 1 POST acotado 3 INEs → 200 invalidados=3, SSR post OK | **PASS** |
| 11 | Ficha y XLSX discrepan | A11 | 3 vías R2↔SSR↔XLSX para Albacete y Madrid (`irpf_declaraciones` exacto en las tres) | **PASS** |
| 12 | SSR puntuales | A12 | Madrid 28079, Bilbao 48020 (no 48013), Santiago 15078 (no 27044), Pamplona 31201, Vitoria 01059, **01201 → EmptyState honesto** (no ficha fantasma), Getxo 48044, Ceuta 51001, Melilla 52001 — 200 + nombre + sin error | **PASS** (+INFO soft-404) |
| 13 | Regresión no-CONPREL | A13 | R2 Madrid: `aeat_edm` + slugs IRPF/población/elecciones/SEPE/TGSS + **0 `conprel_*` publicados**; R2 laterales ine-layers (educación/agrario) y demographics (migraciones); SSR hojas demografía/economía/sociocultural con needles; 14 envelopes de cobertura OK | **PASS** |
| 14 | Rate limit bloquea revalidación legítima | A14 | Unit de `consumeRateRequest`/`consumeRateInes` (61ª→429+Retry-After, ventana deslizante); **loader full 41×200=8200 INEs** — antes bloqueado en lote 26 → defecto Q6-A14; producción: solo GET→405 y POST token-inválido→401 (inertes, pre-tasa) | **PASS tras fix** (antes FAIL) |
| 15 | Secretos expuestos | A15 | `git log -p -n400 --all` con 7 patrones (JWT/AWS/GH/Slack/sb_secret/PEM/token-literal) → 0 hits; scan `scripts/src/docs`; `.env.example` solo placeholders; `git ls-files` sin `.env`; `tmp/` sin tokens; `platform.env` **fuera del repo** (solo nombres de clave listados, valores no leídos); `git status` limpio | **PASS** |

---

## Defectos encontrados (run BEFORE-fix) y fixes aplicados

### Q6-A7 — ALTO — Loader CONPREL sin backup local previo al put

- **Defecto:** `modoEscritura` en `scripts/load-conprel.ts` hacía `merge → put → read-back` sin escribir copia local del envelope previo, aunque `docs/conprel-integracion-partial-diseno.md` §7.4 condiciona el rollback a «restore desde el backup local previo (patrón fix-tgss)». Un run de escritura defectuoso no era restaurable.
- **Fix (bajo riesgo, solo rama de escritura gateada):** antes de `mergeConprelTuplas`, se escribe `tmp/conprel-backup/<runId>/<ine>.json` con el envelope en memoria pre-merge (`fs`/`path` ya importados). No toca R2/Supabase ni el dry-run.
- **Verificado:** check estático A7 `backup → merge → await put` **PASS**; `verify-conprel-loader` 60/60 OK; `tsc` 0.

### Q6-A8 — BAJO — Frontera 150 KB inconsistente sizeFull vs write-gate

- **Defecto:** `sizeFull` marcaba «over» con `bytes > 150*1024` mientras `cabeEnvelope` (write) acepta solo `bytes < 150*1024`: un envelope de exactamente 153600 B pasaba el reporte del dry-run y era rechazado en el write (o viceversa según redondeo).
- **Fix:** `sizeFull` usa `bytes >= CONPREL_MAX_ENVELOPE_BYTES` (misma constante que el contrato; import añadido). Comportamiento: 153600 → over, coherente con `cabeEnvelope`.
- **Verificado:** check estático A8 **PASS**; frontera unit `cabeEnvelope` intacta; `tsc` 0.

### Q6-A14 — ALTO — Rate limit B3 (5000 INEs/min) bloqueaba revalidación legítima

- **Defecto:** techo `RATE_MAX_INES_PER_MIN=5_000` con lotes de 200 → solo 25 lotes/min. Un run de catálogo completo (≈7345–8132 municipios = 37–41 lotes) recibía **429 en el lote 26**; `revalidateMunicipios` solo reintenta 3× con backoff ≤2 s (no espera `Retry-After` de 60 s) → `degradado=true` y parte de la caché municipal serviría datos viejos hasta TTL 1 h. Repro unit: `consumeRateInes` ×41 lotes → `okLotes=25/41`.
- **Fix (bajo riesgo, acotado):** `RATE_MAX_INES_PER_MIN` 5_000 → **10_000** (50 lotes de 200; sigue frenando bucles: techo de peticiones 60/min intacto, auth antes de tasa intacto). Comentario del route y `docs/backlog-hardening-revalidacion.md` actualizados.
- **Verificado:** check A14 `41×200 caben` **PASS**; 61ª petición sigue en 429; ventana deslizante OK; `verify-revalidate.ts` OK; `tsc` 0.

### Fix adicional (test adversarial destapó debilidad real)

### Q6-A6b — MEDIO — `assertHeader` comparaba con `join(',')` (delimitador coma falseaba el check)

- **Defecto:** `assertHeader` comparaba `actual.join(',') === esperadas.join(',')`; una cabecera en CSV con **delimitador coma** (una sola celda `idente,cdcta,…`) pasaba el check de esquema porque al unir con coma imitaba la cabecera esperada.
- **Fix:** comparación celda a celda (`length` + elemento a elemento) en `src/lib/conprel-parser.ts`.
- **Verificado:** caso «delimitador coma → PARSE ERROR» **PASS**; suite `verify-conprel-loader` 60/60.

### No fixeados (solo reporte, decisión de producto/plataforma)

| ID | Sev | Descripción |
|---|---|---|
| Q6-P1 | INFO | `/socideas/01201` (INE inexistente) responde **HTTP 200 + EmptyState** (soft-404) en lugar de `notFound()`→404. Honesto para el usuario; decisión de producto/SEO. No fixeado. |
| — | DEPENDENCIA | **SA2** (agente de backup externo) no está mergeado en el repo; el diseño se validó con fixtures (A7). Habilítalo o confirma que el backup inline del loader (Q6-A7 fix) es suficiente. |

---

## Checks que corrieron SOLO en local vs contra producción

| Tipo | Áreas | Medio |
|---|---|---|
| Unit/fixtures/estático (local, siempre) | A1–A9, A10-estático, A14-unit, A15 | CSVs sintéticos en `tmp/qa-adv-socideas/`, grep de `src/`+`scripts/`, import del contador B3 |
| Producción read-only | A10-SSR, A11, A12, A13, A14-probes | GET R2 público, GET SSR (`cache-control: no-cache`), GET XLSX (2 municipios), GET/POST `/api/socideas/revalidate` sin credenciales válidas |
| Producción acotada (flag) | A10 `--revalidar` | **1** POST batch con 3 INEs (`02003,28079,41091`) + 2 GET SSR post |
| No ejecutado | Escritura R2/Supabase, carga agresiva de rate-limit, `npm run build` + E2E local de caché, despliegue | Prohibido por misión / depende de orquestador |

---

## Comandos de reproducción

```bash
# Unit + estático (sin red)
npx tsx scripts/qa-adversarial-socideas.ts --local-only

# Completo (lectura prod) + revalidación acotada de 3 INEs
SOCIDEAS_REVALIDATE_TOKEN=… npx tsx scripts/qa-adversarial-socideas.ts --revalidar

# Typecheck del script (los scripts están fuera del tsconfig raíz)
npx tsc -p scripts/tsconfig.qa-adv.json

# Regresión de las suites existentes tras los fixes
npx tsx scripts/verify-conprel-loader.ts   # 60 OK
npx tsx scripts/verify-revalidate.ts       # OK
npx tsc -p tsconfig.json --noEmit          # 0 errores
npx eslint                                  # 30 problems (14 err, 16 warn) — baseline worktree intacto
```

JSON de la última corrida (116 PASS): `tmp/qa-adversarial-socideas-1790232949386.json` (gitignored).

---

## Resumen final

| | |
|---|---|
| **Suite** | `scripts/qa-adversarial-socideas.ts` — 15 áreas, 116 checks en modo completo |
| **Resultado AFTER-fix** | **116 PASS · 0 FAIL · 0 ENCONTRADO** (local 72/0/0; prod 116/0/0) |
| **Defectos corregidos en rama** | Q6-A7 (ALTO, backup), Q6-A14 (ALTO, rate limit 10k), Q6-A8 (BAJO, frontera 150KB), Q6-A6b (MEDIO, assertHeader) |
| **Reportados sin fix** | Q6-P1 soft-404 01201 (INFO/producto); SA2 (dependencia) |
| **Producción validada** | SHA `2b79ffe` READY — sin regresiones AEAT/ADRH/Educación/Agrario/Migraciones; 0 conprel_* publicados |
| **Post-despliegue pendiente** | Reejecutar la suite completa cuando `feat/qa-conprel` (o el merge que incluya estos fixes) llegue a production |
