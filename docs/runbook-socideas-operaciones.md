# Runbook — Operaciones SOCideas (URBIdeas)

**Alcance:** carga CONPREL, revalidación, verificación R2/producción, degradación y restauración.  
**Entorno:** producción `https://urb-ideas.vercel.app` · bucket R2 `socideas-data` · prefijo `socideas/v2/municipios/{INE}.json`.  
**Secretos:** solo en `.env.local` / plataforma (`platform.env`). **Nunca** imprimir ni commitear. La ruta de revalidación usa **solo** `SOCIDEAS_REVALIDATE_TOKEN` (B2); `SOCIDEAS_SYNC_TOKEN` solo abre `/sync` y `/sync-economia`.

---

## 1. Dry-run CONPREL (por defecto)

```bash
# Muestra 14 (seguro; defecto si no hay flags de alcance)
npx tsx scripts/load-conprel.ts --muestra

# Familias / alcance
npx tsx scripts/load-conprel.ts --familia=ppto
npx tsx scripts/load-conprel.ts --all-ppto
npx tsx scripts/load-conprel.ts --all-liq
npx tsx scripts/load-conprel.ts --provincias=28,41,46

# Diagnósticos
npx tsx scripts/load-conprel.ts --colisiones --ausentes --familia=ppto
npx tsx scripts/load-conprel.ts --size-full --all-ppto --all-liq
```

- **No escribe** R2 ni Supabase en dry-run (`resolveWriteGate`).
- Informe: `tmp/conprel-loader-dryrun-<runId>.json`.
- Exit 1 si `>150KB` o `slugsPerdidos`.
- Requiere `.env.local` (Supabase solo lectura para catálogo; R2 público para envelopes).

## 2. Comprobar manifest de fuentes

Tras cada arranque (también dry-run) el loader escribe:

`tmp/conprel-manifest-<runId>.json`

Comprobar:

- `estado`: `preparado` → `extraido`
- por familia: `zipSha256`, bytes, URL oficial, recuentos (`municipales`, `ecoCapitulos`, `negativos`, `duplicados=0`)
- `duplicados` debe ser `[]` (si no, el parser bloquea: exit 3/4)

```powershell
Get-ChildItem tmp\conprel-manifest-*.json | Sort-Object LastWriteTime | Select-Object -Last 1
Get-Content (Get-ChildItem tmp\conprel-manifest-*.json | Sort-Object LastWriteTime | Select-Object -Last 1) -Raw | ConvertFrom-Json | Select-Object estado, recuentos
```

## 3. Iniciar un lote aprobado (gate + flags + backup)

**Requisitos previos** (checklist diseño §9 + aprobación del lote):

1. Dry-run limpio (sin `>150KB`, sin `slugsPerdidos`).
2. Aprobación explícita del operador para escritura.
3. **Backup local de los envelopes a tocar** (patrón `fix-tgss`):  
   `tmp/backup/{INE}.json` con el JSON actual de R2 **antes** del put. El loader CONPREL aún no hace backup automático en `modoEscritura`.

```powershell
# Gate doble (ambos obligatorios; sin ellos → dry-run o abort exit 2)
$env:SOCIDEAS_CONPREL_WRITE = 'autorizado'
npx tsx scripts/load-conprel.ts --muestra --familia=ppto --confirm-r2-write
# Al terminar, limpiar la env de escritura del shell
Remove-Item Env:SOCIDEAS_CONPREL_WRITE
```

Flags de escritura: **solo** `--confirm-r2-write` exacto + `SOCIDEAS_CONPREL_WRITE=autorizado`.  
`--dry-run` explícito + cualquiera de los dos → **abort**.

Pipeline por INE (write mode): merge → gate 150 KB → `putMunicipioJson` → read-back → al final `revalidateAfterWrites` + filas `data_sync_runs`.

## 4. Verificar R2

```powershell
$ine = '28079'
$base = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'  # o SOCIDEAS_R2_PUBLIC_BASE
$r = Invoke-WebRequest "$base/socideas/v2/municipios/$ine.json?v=$(Get-Random)" -UseBasicParsing
$r.StatusCode
$r.Headers['Cache-Control']   # objetos re-put: public, max-age=300, must-revalidate (B1)
($r.Content | ConvertFrom-Json).codigo_ine   # debe ser $ine
```

Read-back del loader: si falla, el INE **no** entra en `writtenInes` (no se revalida).

## 5. Revalidar

Solo si hay `SOCIDEAS_REVALIDATE_BASE_URL` + `SOCIDEAS_REVALIDATE_TOKEN` en el entorno del loader (o `.env.local`).

- Los loaders ya lo hacen al final del run (`revalidateAfterWrites` → lotes de ≤200 INE).
- Manual / QA:

```bash
npx tsx scripts/verify-revalidate.ts
# Producción (10 municipios; usa solo SOCIDEAS_REVALIDATE_TOKEN):
npx tsx scripts/verify-revalidate-muestra.ts
# o: npm run qa:revalidacion
```

- Endpoint: `POST /api/socideas/revalidate` + cabecera `x-revalidate-token`.
- Respuestas: 200 · 400 body · **401** token incorrecto/SYNC · **429** rate (B3) · **503** sin token dedicado configurado · 405 método.
- Rate: 60 req/min y 5000 INE/min **por instancia** (best-effort). En 429, esperar `Retry-After` (la clienta ya backoff).

## 6. Detectar carga parcial

| Señal | Dónde |
|---|---|
| Dry-run `sinR2`, `sinEco`, `>150KB`, `slugsPerdidos` | consola + `tmp/conprel-loader-dryrun-*.json` |
| `written < candidatos` en write mode | consola `Escritura completada: N municipios` |
| Revalidación degradada | consola `REVALIDACIÓN DEGRADADA` + `data_sync_runs` estado `partial`/`error`, `metadata.degradado=true` |
| Run de carga | Supabase `data_sync_runs`: `tipo_sincronizacion` (`conprel_ppto_2025` / `conprel_liq_2024` / `revalidacion_tags`), `estado`, `metadata` |
| Muestra UI | `npx tsx scripts/qa-cobertura-muestra.ts` (14 INE) |

Regla: **nunca** un 200 vacío engañoso en revalidación (payload sin INE válido → 400; fallo total → auditoría `error`).

## 7. Restaurar un run

1. Identificar el lote: `runId` (manifest + `data_sync_runs.metadata.run_id`).
2. Restaurar envelopes desde `tmp/backup/{INE}.json` (o snapshot previo) escribiendo de nuevo en R2 (`PutObject` con el mismo key / patrón `fix-tgss` + `--write` inverso manual).
3. Revalidar solo los INE restaurados (mismo endpoint, token dedicado).
4. Insertar/comprobar fila de auditoría en `data_sync_runs` del restore.
5. Si el defecto está en el código del loader: `git revert` del commit; no hay migraciones destructivas en este flujo.

## 8. Comprobar producción (SSR / XLSX / cobertura)

```bash
# SSR 250 + XLSX 30 (solo lectura)
npx tsx scripts/qa-produccion.ts --ssr 250 --xlsx 30
# o: npm run qa:produccion

# Cobertura metodológica 14
npx tsx scripts/qa-cobertura-muestra.ts
# o: npm run qa:cobertura
```

Criterios mínimos: sin 500 / “Application error”; XLSX abre con 9 hojas; ND ≠ 0; muestras de texto CONPREL/AEAT según corresponda; revalidación de muestra en verde.

---

## Degradación de revalidación (no destruye datos correctos)

**Garantía (código):** `revalidateAfterWrites` / `revalidateMunicipios` **nunca** revierten ni reescriben R2.

1. Escritura R2 fallida o `writtenCount=0` → `shouldRevalidate=false` → **no** se llama a revalidación (`null`).
2. Endpoint caído/401/429/timeout → `RevalidationSummary.degradado=true`, `invalidados`/`errores` contados, **sin throw** hacia el loader.
3. `buildRevalidationAuditRow` → `data_sync_runs.estado` ∈ `ok|partial|error` (nunca éxito silencioso) + `metadata.degradado`.
4. Efecto práctico: puede quedar caché **vieja** hasta TTL/reintento; los **datos R2 buenos permanecen**. Reparar: reintentar revalidación con el token dedicado (§5).

Detalle unitario: `npx tsx scripts/verify-revalidate.ts` (secciones Degradación + `revalidateAfterWrites`).

---

## B4 — Observabilidad Vercel (pendiente humano)

MCP Runtime Errors/Logs → **403** (permiso del conector). Ver paso exacto en `docs/backlog-hardening-revalidacion.md` §B4. Mientras tanto: probes HTTP, `qa:produccion`, logs estructurados locales y estado de deployments.

## Referencias

- Backlog hardening: `docs/backlog-hardening-revalidacion.md`
- Dictamen rate limit: `docs/analisis-b1-b3-rate-limit-suficiencia.md`
- Diseño CONPREL: `docs/conprel-integracion-partial-diseno.md` §7–§9
- Fuente presupuestos: `docs/presupuestos-municipales-fuente-decision.md`
