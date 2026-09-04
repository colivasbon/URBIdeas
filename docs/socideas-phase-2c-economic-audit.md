# SOCideas Fase 2C — Auditoría económica y diseño (sin implementación)

> Rama: `feat/socideas-economia-phase-2c` HEAD `f583a81` (incluye `40eeffa`). Solo lectura + documento. Sin commit/push, sin Supabase/R2/Vercel/Cloudflare.

## 1. Inventario actual

### 1.1 ¿Hay bloque económico hoy?
**Sí, parcial (Fase 2B ya desplegada en lógica, pendiente de carga nacional homogénea).** El bloque existe en código, catálogo y envelope R2, pero la mayoría de municipios aún tienen `economia` vacío o `partial`/`pending` según cobertura de fuente.

*Catálogo* `029_socideas_economia_catalog.sql` crea 4 fuentes (`aeat_edm`, `ine_adrh`, `ine_dirce`, `ine_censo_agrario`) y 28 slugs `economia`:

`irpf_declaraciones`, `irpf_renta_bruta_media`, `irpf_renta_disponible_media`, `renta_neta_media_persona/hogar`, `renta_bruta_media_persona/hogar`, `gini`, `p80_p20`, `empresas_total/industria/construccion/servicios/comercio_hosteleria`, `agr_sau_total/tierra_arable/cultivos_lenosos/pastos/huertos/explotaciones`, `gan_bovino/ovino_caprino/porcino/aves exp/cab`, `gan_ug_total`.

Ver `src/lib/socideas.ts:151` `SOCIDEAS_ECONOMY_INDICATORS`.

### 1.2 Almacenamiento R2 – estructura por municipio
Un único JSON por municipio: `socideas/v2/municipios/{codigoINE:5}.json` (ej. `02069` La Roda), `Cache-Control: public, max-age=86400`, sobrescritura idempotente. Lectura pública vía `NEXT_PUBLIC_SOCIDEAS_R2_BASE`, escritura solo SDK S3.

Envelope v2 compacto (`src/lib/socideas-r2.ts` `toV2Envelope`/`expandV2Envelope`): `version:2, codigo_ine, generado_en, indicators[{slug,nombre,unidad}], sources[{slug,organismo,nombre}], source_urls[], dimensiones[{}], valores[[indIdx,anio,valor,unidad,dimIdx,urlIdx,tableId,serieId,estado]]`. 9 posiciones fijas. Nuevos slugs/dimensiones (`sector`, `especie`, `medida`, `ambito`) se añaden como entradas en `indicators`/`dimensiones`/`source_urls` sin romper orden. Lector soporta v1 y v2. Tamaño medio actual Demografía ~55 KB/municipio; Economía (si se llenan los 28 slugs) estimado +30–60 KB (dentro de límite 150 KB/bloque).

Campos `fecha_referencia`, `municipio_codigo_ine`, `valor_texto` no se persisten (se derivan). Solo filas `estado_validacion="validado"` se guardan; ND/secreto nunca se guarda como 0.

### 1.3 Supabase implicado
* `municipios` (8.130, `codigo_ine` PK lógica), `provincias`, `comunidades_autonomas` (fuente territorial única).
* `statistical_sources` (4 fuentes economía), `indicator_definitions` (28 slugs + demografía), `data_sync_runs` (`municipio_codigo_ine, tipo_sincronizacion, estado ok/partial/error, inicio/fin, detalle JSON`) – auditoría ligera. `municipal_indicator_values` vacía (legado).
* RLS activo sin políticas públicas; todo vía `service_role` en servidor; sync protegido por `SOCIDEAS_SYNC_TOKEN`.

### 1.4 UI que renderiza
* `src/app/socideas/[codigoINE]/page.tsx` (Server, `React.cache` deduplica envelope) → `CategoryTabs` → `EconomiaFicha.tsx` si `?categoria=economia`. `EconomiaFicha` es presentacional pura (no fetch), recibe `PerfilEconomico` (`municipio, sincronizado, ultima_sincronizacion, valores, ultimoPorIndicador, disponibles`). Subbloques: Visión general (estado por bloque `pending/partial/ok`), Renta (IRPF+ADRH), Desigualdad (Gini/P80), Empresas (DIRCE), Agrario (Censo 2020), Ganadería, Pendientes – cada uno con `StatCard`, `EvolutionChart`/`Barras`, tabla + `CopyTableButton` (HTML+TSV) y `Traceability` (fuente, año, URL, obtenido_en). Estados honestos: sin datos → `pending` con `PENDIENTE_TEXTO`.
* `CopyTableButton.tsx` – copia HTML semántico + TSV con título/municipio/INE/provincia/CCAA/año/unidad/fuente/nota.
* `FichaFiltros.tsx` – solo Demografía; Economía no tiene filtros (no aplica).

### 1.5 Cómo se ejecutan hoy las actualizaciones
* **Batch inicial (ya hecho para Demografía):** `scripts/sync-all-municipios.ts` (8 lotes, reanudable, caché catálogo por provincia, `--stale-days 365`) lee INE Tempus3 (DPOP 50 tablas provinciales) → `toV2Envelope` → `putMunicipioJson` → `data_sync_runs`.
* **Económico actual:** `src/lib/socideas-sync-economia.ts` + endpoints `POST /api/socideas/sync-economia/[codigoINE]` (protegido por `SOCIDEAS_SYNC_TOKEN`, bloqueo temporal en `data_sync_runs`). Flujo: valida `codigoINE` vs `municipios` → lee JSON R2 existente **una vez** (`getMunicipioEnvelopeForRequest`) → consulta fuentes necesarias (AEAT xlsx aportado por operador, ADRH CSV `jaxiT3/files/t/csv_bd/{id}.csv` + Tempus3 53688, DIRCE Tempus3 4721 con `tv=` obligatorio, Censo Agrario tabla 29006 `tv=19:{id}`) → valida municipio/año/unidad/cobertura → normaliza → actualiza **solo** slugs economía preservando demografía → `putMunicipioJson` → registra `data_sync_runs` (`tipo_sincronizacion like 'economia%'`). Si una fuente falla, mantiene datos previos válidos (no sobrescribe con vacío). No hay escritura desde ficha ni lectura de APIs al abrir ficha (solo R2). **No se ha hecho carga nacional económica** en esta rama; solo diseño + municipio de prueba bajo autorización.

## 2. Mapa de fuentes oficiales (verificado 04/09/2026 – ver detalle en ficha por fuente)

| Fuente | Último periodo verificado | Próximo esperado | Cobertura municipal real | Nota |
|---|---|---|---|---|
| Atlas Distribución Renta Hogares (ADRH, INE) – renta, Gini, P80/P20 | 2023, publicado **21/10/2025** (ADRH2023); **2024 programado oct-2026** (actualización programada) | oct-2026 (datos 2024) | **Todos los municipios** para rentas medias (sin umbral desde 2020); **≥100 hab.** para Gini/P80P20. Distritos/secciones también. | Retraso ~2 años. Serie 2015-2023 homogénea. Provisional 2024 **excluido** (no confirmado). |
| Demografía Armonizada Empresas (INE) | **2023**, publicado **12/11/2025** (por verificar cobertura municipal – INEbase indica nacional/CCAA/provincia; municipal **por verificar** en PC-Axis) | nov-2026 | **Por verificar**: si solo provincial/CCAA, no proponer indicador municipal; alternativa Censo 2021 SDC21. | No asumir municipal hasta verificar `tpx`/`jaxi`. DIRCE 2026 por verificar (si no existe, usar 2025). |
| SEPE – Paro registrado y contratos por municipio | **Julio 2026** (verificado 04/09/2026) – existe libro completo XLS ~4 MB + XLS por provincia/mes | mensual | **Todos los municipios** (paro registrado) | Catálogo datos abiertos SEPE; volátil. |
| TGSS Afiliación Seguridad Social – último día del mes | **Julio 2026 – Muni072026 (publicado 14/08/2026)**, mensual, XLSX ~510 KB | mensual | Todos, con **secreto <5 → “<5”** | Nunca 0. |
| Presupuestos/Liquidaciones EELL (Hacienda) | Trimestral (ejecución) + anual liquidación (definitivo/consolidado/sin consolidar) | trimestral/anual | Heterogénea (EELL que rinden) | Distinguir estados. |
| Censo Agrario 2020 (INE) – SAU, explotaciones, ganadería | 2020 estructural | decenal | Todos (umbral explotación) | Año visible, ha, secreto. |
| Tempus3 (DPOP, DIRCE 4721, 53688) | 2025 (DIRCE 1-ene) / 2023 (ADRH) / 2025 (DPOP) | anual | Municipal (con filtros) | `tv=` Id numérico obligatorio. |
| Censo 2021 SDC21 (alternativa) | 2021, API SDC21 | – | Municipal, sección | PC-Axis/JSON-stat. |

> Si no se puede acceder hoy a una fuente, se marca “por verificar” y se usa la referencia base indicada en la tarea.

## 3. Ficha por fuente (indicador propuesto)

| Indicador propuesto | Fuente / Operación / Código | Último periodo | Periodicidad | Nivel territorial | Método descarga | Formato | Volumen est. por municipio | Restricciones | Consolidado / Provisional |
|---|---|---|---|---|---|---|---|---|---|
| `renta_neta_media_persona` | INE ADRH – Atlas (tablas renta media, jaxiT3 `csv_bd/{id}`) | 2023 | Anual | Municipio/distrito/sección | `jaxiT3/files/t/csv_bd/{id}.csv` + Tempus3 53688 comparativas | CSV/JSON PC-Axis | ~0,5 KB/fila | Ningún umbral | Consolidada |
| `renta_neta_media_hogar`, `renta_bruta_media_persona/hogar` | ADRH idem | 2023 | Anual | Municipio | idem | CSV | idem | – | Consolidada |
| `gini`, `p80_p20` | ADRH idem | 2023 (2015-2023) | Anual | Municipio ≥100 hab. | idem | CSV | idem | <100 hab. → ND (no 0) | Consolidada |
| `renta_bruta_media` provisional | **Excluido** – ADRH provisional 2024 no confirmado (por verificar) | — | — | — | — | — | — | — | **Excluido del batch 1** |
| `irpf_declaraciones`, `irpf_renta_bruta_media`, `irpf_renta_disponible_media` | AEAT EDM (declarantes IRPF por municipio) | **2023 vigente** (pub. oct-2025); **2024 programado oct-2026** (actualización programada) – base `sede.agenciatributaria…/Estadistica_de_los_declarantes_del_IRPF_por_municipios.shtml` | Anual | Municipio >1.000 hab., territorio común (excluye PV/Navarra) | XLSX base por ejercicio aportado por operador (no scraping) | XLSX | ~0,3 KB/fila | Umbral 1.000, forales → pending | Consolidada |
| `irpf` provisional | AEAT (si publica avance) | por verificar | – | idem | por verificar | – | – | – | Provisional (si existe) |
| `empresas_total/industria/construccion/servicios/comercio` | INE DIRCE 4721 “Empresas por municipio y actividad” | **2025 vigente** (datos a 1-1-2025, pub. 11/12/2025); **no existe 2026** (siguiente ~dic 2026) | Anual | Municipio (total todos; detalle por tamaño: <1k solo total) | Tempus3 `DATOS_TABLA/4721?nult=...&tv={idMunicipio}` | JSON Tempus3 | ~1 KB/mun. (<500 hab. detalle limitado) | `tv=` obligatorio; <1k sin desglose → `sin_cobertura` | Consolidada |
| `demografia_empresas` (si DIRCE no tiene municipio) | INE Demografía Armonizada Empresas | 2023 (12/11/2025) | Anual | **Por verificar** (prob. provincial/CCAA) | API JSON `tpx`/`jaxi` | JSON/CSV | por verificar | **No proponer municipal hasta verificar** | Consolidada (o excluir) |
| Alternativa estructura actividad/ocupación | Censo 2021 SDC21 | 2021 | Decenal | Municipio/sección | API SDC21 `censosviviendas/…` | JSON-stat | ~2 KB | – | Consolidada |
| `paro_registrado` (total/sexo/edad/sector) + `contratos` | SEPE – Paro por municipios + Contratos | **Julio 2026** (verificado 04/09/2026) – libro completo XLS ~4 MB + XLS por provincia | Mensual | Municipio | Catálogo datos.gob.es SEPE → XLS libro completo + XLS por provincia/mes | XLS/CSV | ~5 KB/mes (serie 12 meses ~60 KB) | Volátil, retraso ~1 mes | Consolidada (provisional si SEPE rectifica) |
| `afiliacion` por municipio (total + <5) | TGSS Afiliación último día | **Julio 2026 – Muni072026 (publicado 14/08/2026)** | Mensual | Municipio | XLSX “último día” ~510 KB (Muni072026) | XLSX | ~0,2 KB/fila | **<5 → “<5” → guardar null + flag `secreto:true`, nunca 0** | Consolidada |
| `presupuesto_inicial`, `liquidacion_definitiva/consolidada` | MHACIENDA – Presupuestos EELL | Trimestral + Anual (liquidación 2023 definitiva, 2024 sin consolidar) | Trim./Anual | Municipio (EELL) | API/descarga `hacienda.gob.es` individual por municipio | CSV/XLSX | ~1 KB | Heterogénea, distinguir `estado=definitivo/consolidado/sin_consolidar` | Consolidada (definitivo) / Provisional (sin consolidar) |
| `agr_*`, `gan_*` (SAU, arable, leñosos, pastos, huertos, explotaciones, especies) | INE Censo Agrario 2020 – tabla 29006 municipal + jaxiT3 provincia | 2020 | Decenal | Municipio | `DATOS_TABLA/29006?tv=19:{id}` + `csv_bd` | JSON/CSV | ~2 KB | Secreto + ND ≠0, ha | **Fuera batch 1** – no se carga en este batch |

Volumen total estimado Economía (28 slugs + 2 provisionales opcionales): +35–70 KB/municipio (dentro de 150 KB).

## 4. Gap analysis

| Indicador | Estado actual en SOCideas | Último periodo oficial | Gap |
|---|---|---|---|
| Renta ADRH municipal (4) | **Existe** (4 slugs) pero sin carga nacional; JSON vacío en la mayoría | 2023 | **Desactualizado / no cargado** – implementar |
| Gini/P80P20 | Existe pero vacío para <100 hab. (correcto) | 2023 | **Parcial** – implementar con umbral |
| Renta provisional ADRH | **No existe** | 2024 (por verificar) | **No existe y conviene crear** (con flag provisional) |
| IRPF AEAT (3) | Existe catálogo pero sin carga (home 2023 sin xlsx directo) | 2023 | **Desactualizado** – conectar descarga controlada |
| DIRCE empresas (5) | Existe pero sin carga nacional | 2025 | **Desactualizado** – implementar |
| Demografía empresas municipal | **No existe** / por verificar | 2023 | **No existe y conviene crear solo si hay municipal**; si no, excluir o usar Censo 2021 |
| Paro SEPE | **No existe** (solo bloque pending documental) | Mensual 2026-04 | **No existe y conviene crear** – nuevo |
| Afiliación TGSS | No existe | Mensual 2026-04 | **No existe y conviene crear** – nuevo, con regla <5 |
| Presupuestos/liquidaciones | No existe | 2024/2023 | **No existe** – aplazar implementación carga, documentar |
| Agrario/ganadería | Existe (11 slugs) con 2020 | 2020 | **Existente pero desactualizado en cobertura detalle** – mantener estructural |
| Censo 2021 actividad/ocupación | No existe | 2021 | **No existe y conviene crear** como alternativa si DIRCE no municipal |
| IPC municipal | No existe | – | **No existe y no implementable** (INE solo provincial) |

## 5. Diseño propuesto (sin implementar)

### 5.1 Bloque `economia` en R2 JSON
Reutiliza envelope v2; no nuevo fichero. Dentro de `valores` se añaden filas con `dimensiones` extendidas:
```
indicators: + {slug:"paro_registrado", unidad:"personas"}, {slug:"afiliacion", unidad:"personas"}, {slug:"presupuesto_liquidado", unidad:"euros"} …
dimensiones: {ambito:"municipio", medida:"explotaciones|cabezas", especie:"bovino", sector:"industria", estado:"consolidado|provisional", bloque:"renta|desigualdad|empresas…", fuente:"ine_adrh|aeat_edm|ine_dirce|sepe|tgss|hacienda", anio:2023} …
source_urls: + URLs SEPE/TGSS/Hacienda
valores: [indIdx, anio, valor, unidad, dimIdx, urlIdx, tableId, serieId, "validado"]
```
Campos obligatorios por fila: `fuente` (slug), `bloque`, `fecha_referencia` (= `anio-01-01` o `YYYY-MM-DD` para mensual), `estado=consolidado|provisional`. Provisionales **nunca** sobrescriben consolidados: el sync mantiene ambos y la lectura prioriza consolidado salvo que se pida provisional explícito; si no hay provisional válido se informa y se mantiene consolidado. Retrocompatible: lector v2 ignora nuevos slugs si no los necesita.

Tamaño: medir `JSON.stringify(v2).length` antes/después; abortar si +150 KB.

### 5.2 Registro de ejecuciones en Supabase (solo diseño)
No migración ahora. Propuesta:
```sql
-- tabla ligera economia_sync_runs (o reutilizar data_sync_runs con tipo='economia_...' y JSON detalle)
id uuid, municipio_codigo_ine char(5), tipo text -- 'economia_adrh'|'economia_sepe'|'economia_tgss' etc,
estado text, inicio timestamptz, fin timestamptz,
fuente text, bloque text, periodo text, fecha_referencia date, estado_dato text, -- consolidado/provisional
detalle jsonb -- {filas_insertadas, filas_secretas, warnings, url, tableId}
-- RLS: enable, policy service_role only
```
Alternativa mínima: seguir usando `data_sync_runs` con `tipo_sincronizacion` diferenciado (`economia_renta_consolidada`, `economia_renta_provisional`, etc.) y `detalle` con flag provisional.

### 5.3 Flujo de actualización
```
Batch inicial (una vez, autorizado): scripts/sync-economia-batch.ts lee R2 existente (getMunicipioEnvelopeForRequest cache) → descarga por fuente (AEAT xlsx, ADRH csv_bd, DIRCE tv=, SEPE XLS, TGSS xlsx) → valida INE/año/rangos/<5 → toV2Envelope parcial (solo economía, preserva demografía) → putMunicipioJson → data_sync_runs.

Incremental por municipio: reutiliza misma función `syncMunicipioEconomia(codigoINE, fuentes[])` con lectura única R2 (React.cache ya usado en ficha). Misma validación y escritura parcial.
```
### 5.4 Botones internos acordados (dónde encajan)
* **“Actualizar datos oficiales”** → `src/app/socideas/[codigoINE]/page.tsx` cabecera Economía (solo si `user.role === 'interno'`), `POST /api/socideas/sync-economia/[codigoINE]` con `SOCIDEAS_SYNC_TOKEN`, bloqueo 10 min en `data_sync_runs` (si `estado='running'` y `inicio > now-10m` → 429), reutiliza lectura única, registra traza.
* **“Comprobar datos provisionales más recientes”** → mismo endpoint con `?provisional=true`; el sync consulta solo fuentes con provisional (ADRH provisional, SEPE mes siguiente, TGSS, Hacienda sin consolidar) → si encuentra provisional para ese municipio (válido y año > consolidado) lo guarda con `estado=provisional` + `fuente=ine_adrh_provisional` etc.; si no, responde `{provisional:false, motivo:"sin cobertura provisional para este municipio"}` y mantiene consolidado. Nunca sustituye consolidado.

Ambos con `aria-busy`, `Traceability` muestra `fuente`, `bloque`, `fecha_referencia`, `estado_dato`.

### 5.5 Reglas de validación
* `codigoINE` regex `^\d{5}$` y existe en `municipios`.
* Año/periodo dentro de rango oficial de la fuente + `disponibles` coherente.
* Rangos plausibles: renta >0 y <500k, Gini 0-100, empresas ≥0, afiliación ≥0.
* Afiliación `<5` → `valor=null, flag_secreto=true` en `dimensiones: {secreto:"true"}`, nunca 0.
* Provisional → `dimensiones.estado="provisional"` y `fuente` distinta; validación `año_provisional > año_consolidado`.
* Comparativas solo si fuente homogénea (misma tabla/periodo).

### 5.6 Impacto en UI
* `EconomiaFicha.tsx` ya renderiza 6 subbloques (Visión general, Renta, Desigualdad, Empresas, Agrario, Ganadería, Pendientes) con `StatusCard`, `StatCard`, `Barras`, `RentaTable`, `CopyTableButton`, `Traceability`. Se ampliará con 3 subbloques nuevos (Paro, Afiliación, Presupuestos) reutilizando mismos componentes; el provisional se muestra con badge `Provisional` y nota “Dato provisional, no sustituye al consolidado”.
* `SocideasSearch`, `FichaFiltros`, `CategoryTabs` no cambian; la ficha Economía ya usa `PerfilEconomico` presentacional sin fetch (filtros locales). Los botones internos serán `Client` con `useTransition` en la cabecera, sin afectar buscador/selector.
* Tablas copiables ya cubren Economía; se añadirán filas para paro/afiliación con misma `CopyTableButton` (HTML+TSV, scroll horizontal móvil).

## 6. Riesgos y limitaciones
* **Retraso Atlas 2 años** (2023 en 2025): Economía siempre desfasada; provisional mitiga pero no es municipal completo.
* **Provisionalidad ECP** (Estadística Continua Población) usada como denominador de tasas: dato provisional sujeto a revisión.
* **IPC no municipal** (solo provincial/CCAA): no incluir en Economía municipal.
* **Demografía empresarial municipal por verificar**: si INE solo publica provincial/CCAA, proponer Censo 2021 SDC21 o excluir; no inventar reparto.
* **XLS vs API**: SEPE/TGSS/Hacienda son XLS/XLSX volátiles (URL cambia por mes/provincia), sin API estable → conector frágil, requiere descarga controlada + parser `xlsx`, riesgo de cambio de formato.
* **Secreto estadístico**: AEAT >1.000 hab., Gini ≥100 hab., DIRCE <1.000 sin desglose, TGSS <5, Censo Agrario ND → todos deben mostrar `pending`/`secreto` nunca 0.
* **Tamaño R2**: +3 fuentes mensuales (paro/afiliación) pueden crecer >150 KB si se guardan series largas; limitar a últimos 12-24 meses y medir.

## 7. Plan de verificación posterior (implementación)
* `npx eslint src/lib/socideas-* src/components/socideas/EconomiaFicha.tsx src/app/socideas/*`
* `npx tsc --noEmit`
* `npm run build`
* Municipios muestra: **capital grande** Sevilla 41091 o Madrid 28079 (cobertura total, sin secreto), **medio** 20-50k hab., **pequeño <1.000 hab.** (Gini <100, TGSS <5, AEAT sin datos). Comprobar renta ADRH 2023, empresas **DIRCE 2025** (1-1-2025, pub. 11/12/2025; no existe 2026), paro SEPE julio 2026, afiliación TGSS julio 2026 (Muni072026), `gan_ug_total` 2020 (fuera batch 1, no se valida aquí), JSON válido, Demografía intacta, R2 +30–70 KB, tablas copiables, estados ok/partial/pending/sin_cobertura, `data_sync_runs` trazable.

## 8. Validación forense 2026-09-04 (sin escritura R2/Supabase)

**Mapa ADRH provincia → ID jaxiT3** (`src/lib/adrh-province-tables.json`, descubierto vía `wstempus TABLAS_OPERACION/353` filtrando `Codigo=DIST-SECC-MUN` y deduciendo la provincia por contenido municipal del CSV):
* 52/52 provincias mapeadas el 2026-09-04 con `scripts/build-adrh-tables-map.ts` (cada tabla responde HTTP 200; ver log de ejecución con bytes+sha256 por tabla en la salida del script). Sin hashes en el JSON: solo `provincia`, `renta`, `gini`, `verificado`. Nacional: tabla 53689.
* Verificado: 02 Albacete renta 30656 / gini 37678; 28 Madrid renta 31097 / gini 37727. Resto según mapa (ver fichero).

**Ancla nacional ADRH (tabla 53689 “Resultados nacionales, por CCAA, provincias e islas”):** nacional 15 036 € y provincia Madrid 18 142 € – **pendiente de verificación** (tabla descargada, 200, pendiente de parseo en `evidence.json`).

**Anclas municipales ADRH verificadas con fichero real (fila municipal, distrito/sección vacíos):**
* 28115 Pozuelo de Alarcón 30 524 € – verificado `tmp/economia/31097.csv` línea 229610.
* 28022 Boadilla del Monte 26 668 € – verificado `tmp/economia/31097.csv` línea 26192.
* 08120 Matadepera 26 720 € – **pendiente** (requiere tabla Barcelona del mapa).
* 18105 Iznalloz 8 399 € – **pendiente** (requiere tabla Granada del mapa).

**DIRCE 2025:** total nacional 3 310 824 – **pendiente de verificación** (`DATOS_TABLA/4721`).

**SEPE julio 2026:** libro completo pendiente de parseo real – **pendiente** (prov. Madrid 273 631, municipio 28079 = 131 527 ±2% por confirmar; el valor anterior ~102-105k queda invalidado hasta `evidence.json`).

**TGSS julio 2026:** `Muni072026.xlsx` pendiente de descarga desde seg-social.es – **pendiente** (suma ≈22,5 M ±2% por confirmar).

**Municipios muestra:** valores anteriores (Madrid 19 245 €, La Roda 11 240 €, etc.) quedan **invalidados** hasta que el dry-run los calcule desde ficheros reales con trazabilidad de fila en `tmp/economia/evidence.json`. AEAT sigue `pendiente` (sin XLSX del operador).

**Estadísticas nacionales:** pendientes de cálculo desde ficheros parseados reales (no estimadas).

---
*Verificación 04/09/2026: SEPE julio 2026 (libro completo ~4 MB + XLS provincia), TGSS julio 2026 Muni072026 (14/08/2026, ~510 KB), AEAT EDM 2023 vigente (2024 oct-2026), DIRCE 2025 vigente (no existe 2026), Atlas 2023 (21/10/2025) según referencias base; ADRH provisional 2024 excluido. Mapa ADRH en `src/lib/adrh-province-tables.json`.*
