# CONPREL — Cobertura y metodología de producto (textos y diseño)

**Fecha:** 2026-09-23 · **Rama:** `feat/conprel-integral` · **Estado:** DISEÑO PARA APROBACIÓN
**Alcance:** solo este fichero. Sin UI, sin git, sin secretos, sin build, sin carga.
**Baseline inamovible:** PPTO-2025 def **7.345/8.132 = 90,3 %** · LIQ-2024 def **6.861/8.132 = 84,4 %** · avances **nunca** rellenan definitivos ni cobertura · solo tipos `AA|ZZ` municipales · join **solo por código** (`LEFT(codente,5)`; nombres = diagnóstico) · Ceuta 51001 / Melilla 52001 con `ZZ` · avisos AEAT foral y renta `blocked_source` **intactos** (no se tocan).

Fuentes leídas: `docs/presupuestos-municipales-fuente-decision.md` §11 · `docs/conprel-integracion-partial-diseno.md` §4–§5 · `scripts/qa-fixtures.ts` · `src/lib/socideas-indicator-catalog.ts` · `src/lib/socideas-availability.ts` · `src/components/socideas/EconomiaFicha.tsx` · `SourceMethodologyNotice.tsx` · `src/lib/socideas-xlsx.ts` (hoja 08) · `src/components/socideas/ficha-sheets.ts` · `tmp/conprel-coverage/*-{presentes,ausencias}.csv`.

---

## 1. Definición operativa: `partial` y ND

| Concepto | Definición operativa |
|---|---|
| **`partial` (serie)** | Estado a nivel de **familia + ejercicio + corte** (`PPTO-2025 definitivo`, `LIQ-2024 definitiva`), no global ni por municipio. Hereda del catálogo `IndicatorAvailability = 'partial'` (`socideas-availability.ts`). Nunca `available` (criterio 6 en ❌; salida B). |
| **ND (municipio)** | **«No consta registro municipal en el fichero consultado»** = el prefijo `LEFT(codente,5)` no tiene fila `AA|ZZ` en `tb_inventario` de ese fichero. **Prohibido** redactar «no remitió», «incumple», «sin datos» como causa. |
| **ND ≠ 0** | Ausencia = sin tupla en el envelope → UI/XLSX pintan `ND` (badge Crisopa). Un `0,00` **publicado** en fila existente es cero real de la fuente y se conserva como `0` (§4 del diseño partial). |
| **Causa foral individual** | **Prohibida sin prueba caso a caso.** «Régimen foral» solo como cobertura **nacional de la serie AEAT** (ya existente) o como hipótesis `H*` **no demostrada** en dossier. Para CONPREL: Álava 0/51 y Navarra ~14 % son **hechos medidos** a nivel provincial; nunca se etiqueta un municipio concreto (p. ej. Vitoria 01059, Milagro 31169) como «ausente por foral». |
| **Denominador** | 8.132 municipios del catálogo SOCideas (incluye Ceuta/Melilla). Numerador propio por familia/fichero. Avances (PPTO-2026, LIQ-2025-av) **excluidos** de cobertura y de numerador. |

## 2. Tabla de exposición por serie (familias separadas)

| Familia | Fichero / corte | Magnitud principal | Numerador | Denominador | Cobertura | Avance |
|---|---|---|---|---|---|---|
| **PPTO-2025** | `Presupuestos2025.accdb` · definitivo publicación (corte ~15-dic-2025) | `tb_economica.importe` (presupuesto de la publicación) | 7.345 mun. `AA\|ZZ` distinct | 8.132 | **90,3 %** | PPTO-2026 av (75,5 %) **excluido**: nunca rellena ni sustituye |
| **LIQ-2024** | `Liquidaciones2024.accdb` · definitiva | `imported` (ppto def) · `importer` (reconocidos) · `importel` (liquidado) | 6.861 mun. `AA\|ZZ` distinct | 8.132 | **84,4 %** | LIQ-2025 av (69,1 %) **excluido** |

- Coberturas **independientes**: no se hereda una de la otra (Getxo en ppto sí / liq no; 05188 Poveda inverso).
- 0 códigos duplicados con predicado estricto `AA|ZZ` (7 dependientes `ZV/ZO` Ceuta/Melilla no cuentan).
- `tableId` propuestos: `CONPREL-PPTO-2025` · `CONPREL-LIQ-2024` (raíz `^CONPREL` → fuente `hacienda_conprel`).

## 3. Cuatro estados de ausencia en el cruce PPTO × LIQ

Ningún estado usa `0`, causa foral inventada ni «no remitió».

| # | Estado | Definición | Texto de **ficha** (corto) | Texto de **XLSX** (celda `ND` / pie) |
|---|---|---|---|---|
| S1 | **presente-PPTO + ausente-LIQ** | Fila `AA\|ZZ` en PPTO-2025; sin fila en LIQ-2024 | «Presupuestos 2025: dato publicado. Liquidaciones 2024: ND — no consta registro municipal en el fichero consultado.» | Ppto: valor € · estado `presente`. Liq: `ND` · estado `ausente_fichero_liq2024` (badge Crisopa; **no 0**). |
| S2 | **ausente-PPTO + presente-LIQ** | Inverso de S1 | «Presupuestos 2025: ND — no consta registro municipal en el fichero consultado. Liquidaciones 2024: dato publicado.» | Ppto: `ND` · `ausente_fichero_ppto2025`. Liq: valor € · `presente`. |
| S3 | **ausente-ambos** | Sin fila en ninguno de los dos definitivos | «ND en presupuestos 2025 y liquidaciones 2024: no consta registro municipal en los ficheros consultados.» | Ambas familias: `ND` · `ausente_ambos_definitivos`. **Prohibido** 0 y causa individual. |
| S4 | **presente-ambos** | Fila en ambos definitivos | (sin aviso de ausencia; manda el aviso de serie §4a y el pie de familia §4d.) | Valor € en ambas familias · estado `presente`. |

- Estados derivados solo de presencia de fila en cada fichero (matriz `tmp/conprel-coverage/`), jamás de comparación de importes.
- S1 ≈ 673 mun. · S2 ≈ 189 mun. · S3 = 510 ausentes en los 4 ficheros + puntuales · S4 = intersección (~6.672, no se publica este recuento en ficha salvo que lo pida el orquestador).

## 4. Textos CORTOS exactos (≤ ~40 líneas útiles en total para la ficha)

Solo se **definen** aquí; inserción indicada, **sin implementar**.

**(a) Aviso de serie `partial`** — *inserción: `src/components/socideas/EconomiaFicha.tsx`, bloque `<SourceMethodologyNotice>` / nota `role="note"` bajo «Visión general» (junto a L335), activado por entradas de catálogo nuevas; no reemplaza el `cobertura.push` «Presupuesto municipal… without_coverage» (L292) hasta aprobación.*

> **Serie CONPREL · partial.** Presupuestos 2025 (definitivo): 7.345 de 8.132 municipios (90,3 %). Liquidaciones 2024 (definitiva): 6.861 de 8.132 (84,4 %). Cada familia tiene cobertura propia; los avances no se publican como cobertura. Fuente: Ministerio de Hacienda (CONPREL).

**(b) Nota ND municipal** — *inserción: pie de tablas CONPREL (`DataTableShell footnote` en bloques nuevos de Economía) + `coverageNotes` de las entradas de catálogo CONPREL; patrón `SourceMethodologyNotice.tsx`.*

> ND = no consta registro municipal en el fichero consultado. Nunca equivale a 0 y no se imputa causa (p. ej. régimen foral) sin prueba caso a caso.

**(c) Línea de hoja 08 «Estados de cobertura»** — *inserción: `COVERAGE_STATUS_GLOSSARY` en `src/lib/socideas-indicator-catalog.ts` (render en `socideas-xlsx.ts` §08, L851); una fila más del glosario, sin tocar textos AEAT/ADRH existentes.*

> `partial` (CONPREL): cobertura parcial nacional por familia/ejercicio (presupuestos 90,3 % · liquidaciones 84,4 %); ausencia municipal = ND, no 0; avances excluidos de la cobertura.

**(d) Pie de tabla por familia** — *inserción: campo `note` de `ExportTable` (hoja 03 `03_CONTEXTO_ECONÓMICO` → `writeDataBlock` en `socideas-xlsx.ts` L435) y `ideas-note` bajo cada bloque en `EconomiaFicha.tsx`. Etiquetas honestas: las de diseño aún pendientes (V1) van marcadas.*

- **PPTO:** Presupuesto = importe de la publicación definitiva CONPREL (ejercicio 2025). Etiqueta de fase pendiente de verificación V1: no usar «inicial».
- **LIQ:** Reconocidos = derechos liquidados (I) / obligaciones reconocidas netas (G) · Liquidado = liquidación del ejercicio. Presupuesto de la publicación ≠ liquidación.
- (Pendiente de diseño, sin cerrar: si la tabla LIQ expone `imported`, etiquetarlo «presupuesto (definitivo) [LIQ]», **jamás** mezclarlo con la columna PPTO.)

**(e) Anti-comparación** — *inserción: misma nota `role="note"` del bloque CONPREL en `EconomiaFicha.tsx` + `methodologyNotes` de las entradas de catálogo; espejo en `note` del XLSX.*

> Presupuesto, liquidación y avance son ficheros y ejercicios distintos: no se calcula ejecución cruzando familias ni se presentan avances como definitivos. ND ≠ 0.

## 5. Diseño de columnas XLSX familiares + fila extra hoja 08

**Tabla por familia** (un `ExportTable` por familia, hoja 03 apilada; columnas en este orden):

| Ejercicio | cdcta EHA | Concepto cuenta | Magnitud | Valor € | Estado |
|---|---|---|---|---|---|
| 2025 | `I-111` | Personal · servicios básicos… (`tb_cuentasEconomica`) | presupuesto_publicacion | `#,##0 "€"` o `ND` | `presente` \| `ausente_fichero_*` \| `ausente_ambos_definitivos` |
| 2024 | `G-221` | … | reconocidos \| liquidado \| presupuesto_liq | idem | idem |

- `magnitud` ∈ {`presupuesto_publicacion` (PPTO), `presupuesto_liq`/`reconocidos`/`liquidado` (LIQ)} — **nunca** una misma fila cruza familias.
- `Valor €`: numérico solo si hay fila; si no → celda texto `ND` (`numeric: null`, badge Crisopa ya soportado en `isBadgeText`).
- `Estado`: enum corto del §3 (no prosa; la prosa vive en pie/hoja 08).
- Capítulos a exponer en ficha/QA: cap. 1 ingresos y cap. 2 gastos (restringir tras dry-run real; tope 150 KB intacto).

**Fila extra de hoja 08** (además de (c) en glosario): nueva fila en «Fuentes oficiales utilizadas» vía `pushFuente` de `buildSheetCatalog` (`socideas-xlsx.ts` ~L1116):

| Área | Fuente principal | Operación / tabla | Último período |
|---|---|---|---|
| Contexto económico | Ministerio de Hacienda (CONPREL) | Presupuestos y liquidaciones EELL · PPTO-2025: partial 90,3 %; LIQ-2024: partial 84,4 %; ND≠0 | PPTO 2025 def · LIQ 2024 def |

## 6. Fixtures de usuario propuestos para QA futuro

Extensión **propuesta** de `scripts/qa-fixtures.ts` (no se edita aquí). Estados verificados contra `tmp/conprel-coverage/*-{presentes,ausencias}.csv` (predicado `AA|ZZ`):

| ine | nombre | familiaEsperada | estadoEsperado | porQué |
|---|---|---|---|---|
| 28079 | Madrid | ambas | **presente-ambos (S4)** | Capital; en ambos presentes; valida join `28079AA000` e `idente` corporación vs dependientes |
| 02003 | Albacete | ambas | **presente-ambos (S4)** | Capital + muestra de 14; en ambos presentes (los huecos liq albaceteños son 02009–02050, no la capital) |
| 48020 | Bilbao | ambas | **presente-ambos (S4)** | INE real (48013=Barakaldo): regresión de etiquetado erróneo previo |
| 15078 | Santiago de Compostela | ambas | **presente-ambos (S4)** | Fixture `kind:'con_dato'`; forzoso de la muestra 100 |
| 31201 | Pamplona/Iruña | ambas | **presente-ambos (S4)** | Navarra: **sí** está entre los 39/38 presentes → prueba de que Navarra no es bloque uniformemente ausente |
| 01059 | Vitoria-Gasteiz | ambas | **ausente-ambos (S3)** | 0 filas con prefijo `01059` en los 4 ficheros (Álava 0/51 en def.); causa no demostrada → solo ND |
| 48044 | Getxo | ambas | **S1** presente-PPTO + ausente-LIQ | `48044AA000` en ppto 2025; sin fila en liq 2024 → no heredar cobertura entre familias |
| 51001 | Ceuta | ambas | **presente-ambos (S4)** | Tipo `ZZ` (no `AA`): valida predicado estricto; excluye dependientes `ZV/ZO` |
| 52001 | Melilla | ambas | **presente-ambos (S4)** | Ídem Ceuta; en avance liq 2025 puede ausentar (timing) — el fixture usa solo definitivos |
| 06161 | Zarza-Capilla (Badajoz) | ambas | **S1** presente-PPTO + ausente-LIQ | **Rural asimétrico** (elegido de CSVs; documentado §11.3): solo en ppto 2025 |
| 05188 | Poveda (Ávila) | ambas | **S2** ausente-PPTO + presente-LIQ | **Rural asimétrico inverso** (elegido de CSVs): en `liq2024-presentes` y `ppto2025-ausencias` → cubre el estado S2 que los casos documentados no cubrían |

*(Alternativa rural documentada si se prefiere duplicar dirección: 19191 Monasterio — mismo patrón S1 que 06161.)*

Checks QA asociados: S1/S2/S3 → celda `ND` y **jamás** `0`; S3 → ningún texto con «foral»/«no remitió»; S4 → sin aviso de ausencia municipal; XLSX hoja 08 contiene línea (c); textos AEAT foral y `blocked_source` sin diff.

## 7. Reglas de no-regresión (cualquier implementación CONPREL)

1. **AEAT foral intacto:** `AEAT_FORAL_NOTICE` y `avisoCoberturaAeatTerritorio` sin cambios; CONPREL no reutiliza esa causa para ausencias municipales.
2. **Renta bloqueada intacta:** `AEAT_BLOCKED_NOTICE` / `irpf_renta_*` `blocked_source` sin cambios; CONPREL no las «arregla» ni comparte slugs.
3. **AEAT ≠ ADRH:** `AEAT_VS_ADRH_COMPARABILITY` y `comparabilityGroup` sin mezcla; CONPREL entra con grupo propio (`comparabilityGroup` distinto, p. ej. `hacienda_conprel`).
4. **Foral:** ninguna ficha/XLSX/estado CONPREL asigna causa «régimen foral» a un municipio sin prueba; solo hechos provinciales medidos (Álava 0/51, Navarra ~14 %) o hipótesis `H*` rotuladas.
5. **ND ≠ 0:** ausencia → sin tupla → `ND`; `0` solo si la fuente publica `0,00` en fila existente; glosario `COVERAGE_STATUS_GLOSSARY` mantiene «Un ND no equivale a cero».
6. **Presupuesto ≠ liquidación:** familias, `tableId`, columnas y pies separados; cero tablas mixtas ni ejecución cruzada.
7. **Definitivo ≠ avance:** avances excluidos de cobertura, numerador y UI de serie; hash/fase por descarga en manifest.
8. **Join solo por código** + filtro `AA|ZZ`; nunca por nombre; nunca tipos `DD/MM/AV/AO/ZV/ZO` como municipio.
9. **Denominador congelado:** 8.132 · cifras 7.345/90,3 % y 6.861/84,4 % sin recalcular en UI.
10. **Sin `available` nacional** hasta criterio 6 en ✅ (salida B vigente).
11. **Hoja 08:** solo **añade** filas (glosario + fuente); no reescribe criterios de lectura ni filas AEAT/ADRH existentes.
12. **`ficha-sheets.ts`:** estado de la hoja 03 no cambia a «datos total»; si toca reflejar partial, solo metadato `estado: "parcial"` — decisión del orquestador.
13. **Sin carga:** R2/Supabase intactos hasta gate de `conprel-integracion-partial-diseno.md` §9.
14. **Secretos/build/UI:** ninguna implementación en este ciclo.

## 8. Mecanismo de publicación diferida (diseño, no implementación)

Objetivo: poder **aprobar textos y estados** sin que la UI pinte nada de CONPREL aún.

1. **Flag en el módulo catálogo** (única fuente de verdad, patrón existente de textos contractuales): en `src/lib/socideas-indicator-catalog.ts`, constante de serie p. ej. `CONPREL_SERIE_ENABLED = false` (a true solo tras aprobación del gate §9 del diseño partial). Las entradas `IndicatorCatalogEntry` CONPREL (slugs `conprel_*`, `coverageStatus: 'partial'`, `coverageNotes` = textos §4) pueden **redactarse ya** en el catálogo con el flag en `false`, siempre que:
   - `INDICATOR_CATALOG` **no** las exponga a `catalogCoverageEntries`/`SourceMethodologyNotice` mientras el flag esté en `false` (filtro en el punto de consulta, no en el componente);
   - ninguna constante de texto se importe en componentes hasta activación (las importaciones de valor tipo `AEAT_*` solo se añadan en la tanda de aprobación).
2. **Componentes intactos:** `EconomiaFicha.tsx` y `SourceMethodologyNotice.tsx` **no se editan** en este diferido; la activación futura es un diff mínimo: añadir slugs CONPREL a los `SourceMethodologyNotice`/`cobertura.push` existentes (reemplazando el `without_coverage` actual de «Presupuesto municipal…» solo cuando haya envelope con datos).
3. **XLSX:** fila extra de hoja 08 y `pushFuente` CONPREL condicionados al mismo flag (o a ausencia/presencia de bloques con `tableId` `^CONPREL` en la entrada del libro): sin bloques y sin flag → hoja 08 idéntica a hoy (QA de no-regresión: byte a byte en glosario y filas AEAT/ADRH).
4. **Envelope/R2:** sin escritura (gate §9). El flag no sustituye al gate: doble llave = aprobación de textos (flag) **y** aprobación de carga (checklist).
5. **QA de diferido:** test de humo «sin flag ⇒ ninguna cadena `CONPREL`/`partial` (CONPREL) visible en HTML de ficha ni en XLSX»; con flag ⇒ textos §4 exactos y reglas §7 verdes.

---

## Resumen — decisiones tomadas

- **`partial` por familia+ejercicio+corte**; ND = «no consta registro municipal en el fichero consultado»; causa foral individual prohibida sin prueba (§1).
- Familias expuestas **por separado** con cifras baseline congeladas y avances excluidos (§2).
- **4 estados de cruce** PPTO×LIQ (S1–S4) con texto de ficha y XLSX por estado; ningún estado usa 0 ni causa inventada (§3).
- Textos (a)–(e) **cortos y exactos** (≤40 líneas útiles) con puntos de inserción por ruta **sin implementar** (§4).
- XLSX: tabla por familia con columnas `ejercicio | cdcta | concepto | magnitud | valor € | estado` + fila extra de fuente en hoja 08 (§5).
- Fixtures: 9 fijos del enunciado + **06161** (S1, rural documentado) y **05188** (S2, rural inverso elegido de los CSV de cobertura) (§6).
- 14 reglas de no-regresión AEAT/ADRH/foral/bloqueada/ND≠0 (§7).
- Publicación diferida por **flag en el módulo catálogo** con componentes intactos y doble llave flag+gate (§8).

## Queda a criterio del orquestador

- Etiqueta final de fase PPTO (V1 glosario `cdFase=U`) y etiqueta de `imported` en tabla LIQ («presupuesto (definitivo) [LIQ]»).
- Qué capítulos EHA se exponen en ficha/XLSX y slugs definitivos (`conprel_*` vs `CONPREL-*` en `tableId` ya propuesto).
- Estado editorial de `ficha-sheets.ts` hoja 03 (`datos` vs `parcial`) al activar.
- Si publicar en ficha el recuento S4 o solo porcentajes de familia.
- Orden de la tanda de activación (flag → diff EconomiaFicha → carga) y quién firma el gate §9.
