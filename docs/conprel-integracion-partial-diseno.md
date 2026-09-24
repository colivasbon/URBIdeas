# Diseño de integración CONPREL — serie `partial` (simulación, sin carga)

**Fecha:** 2026-09-23 · **Estado:** DISEÑO PARA APROBACIÓN — **no se ha cargado ni publicado nada**
**Contexto:** salida **B** de `docs/presupuestos-municipales-fuente-decision.md` (cobertura estructuralmente parcial) · Fase 4 (hardening B1–B4) ajena a este documento.

Este documento recoge: (1) clave única y regla de duplicados, (2) contratos separados de presupuesto 2025 definitivo y liquidación 2024 definitiva, (3) semántica `partial`/ND, (4) simulación de parser+envelopes en local, (5) textos de ficha/XLSX, (6) plan de auditoría, (7) verificaciones abiertas y (8) checklist de aprobación previa a cualquier carga.

---

## 1. Clave única y regla de duplicados

| Elemento | Regla | Evidencia |
|---|---|---|
| Fila de entidad | `codente` (INE-5 + tipo + sufijo), p. ej. `28079AA000` | Único: **0 duplicados** en `tb_inventario` AA+ZZ de PPTO-2025 y LIQ-2024 (GROUP BY/HAVING, 2026-09-23) |
| Fila económica | **`(idente, cdcta, tipreig)`** | **0 duplicados** en `tb_economica` de ambas familias (misma fecha) |
| Join municipal | `LEFT(LEFT(codente,5)) → INE-5`, filtro tipo `AA` (+ `ZZ` en 51001/52001) | 100 % de prefijos ∈ catálogo (matriz §11.2 del documento de decisión) |
| Grupos de entidad | `tb_economica.id` = agrupación (corporación+dependientes); `idente` = entidad concreta. **El importe municipal usa `idente` del inventario AA/ZZ, nunca el `id` de grupo** | Madrid: `id=17037` con `idente`s 165/166/17039/17041/23593 = dependientes |

**Consolidación de dependientes: NO implementada (decisión explícita).**
La metodología de este diseño (regla de arriba) fija el `idente` municipal
como única fuente del importe publicado. No existe aprobación SA1 de una
regla que sume dependientes (`ZV/ZO/DD` ni `id` de grupo) al municipal; sin
ella, consolidar produciría doble cómputo (dependiente ya agregado en la
corporación o duplicado). El loader `scripts/load-conprel.ts` publica SOLO
el idente AA/ZZ y la suite `verify-conprel-loader` prueba la **ausencia de
doble cómputo** (valores de dependientes jamás aparecen ni suman). Si SA1
aprueba una regla de consolidación, se implementará entonces, con tests de
no-duplicación equivalentes.

**Precisión de las 7 filas (familias, contadas como «filas municipales» en el dry-run previo):**
el predicado laxo del dry-run (`tipo ∉ {AV,MM}` para prefijos 51/52) contabilizaba **7 organismos dependientes `ZV/ZO` de Ceuta y Melilla** (51001ZO001, 51001ZV003, 51001ZV005, 51001ZV006, 51001ZO003, 52001ZO001, 52001ZV004) además del municipal `ZZ000`. Con el predicado estricto `AA|ZZ` de la matriz: **7.352−7 = 7.345** (ppto) y **6.868−7 = 6.861** (liq) = municipios-distinto-ficha, **sin códigos repetidos**. No son duplicados de código: son **registros de tipo distinto**.

**Regla determinista si en el futuro apareciera un `codente` repetido en AA+ZZ:** (1) `estado='C'` (vigente) antes que `'E'`; (2) menor `nsec`; (3) orden lexicográfico de `codente` como desempate; (4) registrar el descarte en `metadata.duplicados_descartados` del run. Hoy la rama (4) no aplica (0 casos).

## 2. Contrato — Presupuestos 2025 (definitivo)

| Campo | Valor |
|---|---|
| Fuente | Ministerio de Hacienda · CONPREL · `TipoDato=Presupuestos&Ejercicio=2025&TipoPublicacion=Access` (URL en §7; manifest con sha256 del cuerpo) |
| Fichero | `Presupuestos2025.accdb` (31.507.889 B zip / 294.670.336 B accdb, corte ~15-dic-2025) |
| Tablas | `tb_inventario`, `tb_economica`, `tb_cuentasEconomica` (702 conceptos), `tb_funcional`, catálogos |
| Magnitud | **`tb_economica.importe` = presupuesto de la publicación definitiva** del ejercicio |
| Evidencia de fase | Workbook hermano `EP2025C00.xlsx` con `cdImporte: P`, `cdFase: U`, familia `TipoPublicacion=Definitiva`; plazo de comunicación «10 de diciembre del 2025» (hoja *Relación*); patrón de importes redondos (p. ej. Adra personal 12.309.025) vs ejecución con céntimos; consistencia suma-Access AA cap.1-I = 22.096.623 miles € ≈ **97,8 %** de la columna «Ayuntamientos» del workbook (22.588.414 miles €) — resto por alcance (ZZ, grupos, tratamiento de no firmantes) |
| Fase etiquetada | **Definitiva de la publicación CONPREL del ejercicio**. *Residual R-MET-1:* el glosario del código `cdFase=U` viene de la nota metodológica (PDF 809) cuyo texto aún no se ha extraído; no se usará ninguna otra etiqueta (nunca «inicial» ni «avance») hasta verificar R-MET-1 |
| Unidad | euros (`importe` con coma decimal, sin separador de miles en Access → parser ES) |
| Periodo | ejercicio **2025** · `tableId` propuesto `CONPREL-PPTO-2025` |
| Conceptos | Cuentas EHA por `cdcta`+`tipreig` (I=ingresos, G=gastos), jerarquía cap.→grupo→artículo; catálogo oficial en `tb_cuentasEconomica` |
| Cobertura propia | **7.345/8.132 = 90,3 %** (definitivo; avance 2026 NO se usa como cobertura) |
| Clave | `(idente, cdcta, tipreig)` · join municipal `LEFT(codente,5)` |

## 3. Contrato — Liquidaciones 2024 (definitiva)

| Campo | Valor |
|---|---|
| Fuente | CONPREL · `TipoDato=Liquidaciones&Ejercicio=2024&TipoPublicacion=Access` |
| Fichero | `Liquidaciones2024.accdb` (52.555.360 B zip / 445.128.704 B accdb) |
| **Esquema (diferente del ppto)** | `tb_economica(id, idente, tipreig, cdcta, **imported, importer, importel, importec**)` — **no existe columna `importe`** |
| Magnitudes (validadas por match numérico exacto contra `EL2025CT.xlsx` hoja *Andalucía-Entidades*, Albanchez 04004/idente 631) | `imported` = **presupuesto (definitivo)** (235.600,00 redondo; ≥ reconocido) · `importer` = **reconocidos** — I→«Derechos liquidados» 211.693,90 **exacto**, G→«Obligaciones reconocidas netas» 299.527,85 **exacto** · `importel` = **liquidado** (I 170.562,79 ≤ derechos; G = obligaciones) · `importec` = **ejercicio corriente** (0 en la muestra de cierre) |
| Unidad | euros (coma decimal) |
| Periodo | ejercicio **2024** · `tableId` propuesto `CONPREL-LIQ-2024` |
| Conceptos | misma clasificación EHA; las 4 magnitudes conviven por cuenta |
| Cobertura propia | **6.861/8.132 = 84,4 %** (definitivo; avance 2025 NO) |
| Clave | `(idente, cdcta, tipreig)` — 0 duplicados (LIQ-2024 y LIQ-2025-av) |

**Presupuesto ≠ liquidación:** familias, ficheros, esquemas y coberturas separados; jamás una tabla mixta. **Ejercicio corriente ≠ cerrados** y **definitivo ≠ avance**.

## 4. Semántica `partial` y ND

- **`partial` a nivel de serie** (por familia+ejercicio): texto en §5 de textos. Nunca `available` (criterio 6 del documento de decisión).
- **ND a nivel municipal ausente:** el municipio sin fila AA/ZZ **no recibe tupla** en el envelope (ausencia de fila = ND en UI). **Jamás se escribe 0** por ausencia.
- **Ceros de la fuente:** un `0,00` publicado en una fila existente es **cero real de la fuente** y se conserva como `0` (distinto de ND). Distinguir en UI: «0 publicado» ≠ «ND».
- **Causas:** solo hechos medidos (p. ej. «Álava: 0 municipios en el definitivo 2025»). Las hipótesis de causa se rotulan `H1/H2…` **no demostradas** (p. ej. H1 remisión tardía — compatible con los 15 AA del avance 2026; H2 no remisión en ese corte). **Prohibido** etiquetar un municipio individual como «ausente por régimen foral» salvo demostración caso a caso. Los 510 ausentes en los 4 ficheros son «ausentes en la ventana 2024–2026», **no** «excluidos permanentemente».
- Ceuta/Melilla (`ZZ001`…): presentes en la matriz; el hueco `ZV/ZO` de sus dependientes no cuenta como municipal.

## 5. Textos propuestos (ficha + hoja 08 XLSX)

**Ficha (bajo el bloque correspondiente):**
> **Serie CONPREL · partial.** Presupuestos 2025 (definitivo): 7.345 de 8.132 municipios (90,3 %). Liquidaciones 2024 (definitiva): 6.861 de 8.132 (84,4 %). Los municipios sin remisión en el fichero se muestran como ND: nunca como 0 y sin imputación. Cada familia tiene cobertura propia; los avances no se publican como cobertura. Presupuesto y liquidación no se mezclan. Fuente: Ministerio de Hacienda (CONPREL).

**Hoja 08 «Estados de cobertura» (línea nueva):**
> `partial` (CONPREL): cobertura parcial nacional por familia/ejercicio (presupuestos 90,3 % · liquidaciones 84,4 %); ausencia municipal = ND, no 0; avances excluidos de la cobertura.

Si se aprueba la carga, estas dos piezas se añaden **sin tocar** los textos contractuales AEAT/ADRH existentes.

## 6. Simulación ejecutada (evidencia)

**Comando:** `npx tsx scripts/simular-conprel-envelopes.ts` → **SIMULACIÓN OK** (EXIT 0) · informe `tmp/conprel-sim/sim-report-*.json` · envelopes locales `tmp/conprel-sim/*.json` (**cero** escrituras R2/Supabase).

| Métrica | Resultado |
|---|---|
| Muestra | 63 INE · eco ppto 11.131 filas · eco liq 10.467 filas |
| Join inventario | ppto **63/63** · liq **54/63** (9 ausentes liq: 02009–02050, Albacete — huecos reales de la familia liq) |
| Entidades con filas económicas | 63/63 y 54/54 · sin filas: **0** |
| Filas de capítulo usadas | 870 (ppto) + 780 (liq) |
| Envelopes combinados | **63/63** construidos · sin envelope R2: 0 |
| Tamaño | mín 20.010 B · **máx 89.483 B < 150 KB** · delta máx +13.784 B |
| Preservación de slugs | **0 slugs perdidos** en 63 envelopes |
| Nulos parseados | importe ppto nulos 0 · magnitudes liq nulas 0 |
| Valores simulados | 3.990 (slugs provisionales `conprel_sim_*`, `estado='simulado'`, `tableId` CONPREL-PPTO-2025 / CONPREL-LIQ-2024, `dimensiones.familia` separadas) |

Los nombres `conprel_sim_*` son **provisionales de simulación**; los slugs definitivos se fijan en esta tabla solo tras aprobación (§8), con revisión de `sourceSlugForTable` (`^CONPREL` → fuente `hacienda_conprel`).

## 7. Plan de auditoría (`data_sync_runs` + manifest + caché)

Al habilitarse (tras aprobación) la carga real debe:

1. **Manifest por run** en `tmp/conprel-manifest-<runId>.json`: URL de descarga, fecha, bytes, **sha256 del cuerpo crudo** del ZIP **y de los CSV del loader**, familia, ejercicio, fase (`definitiva_publicacion`), **corte exacto** (mtime del ZIP en ISO 8601 + `preparadoEn`), recuentos (entidades AA+ZZ, filas eco, capítulos), duplicados descartados (hoy 0), muestra de joins.
2. **`data_sync_runs`**: `tipo_sincronizacion='conprel_ppto_2025'|'conprel_liq_2024'`, `bloque='economia'`, `periodo='2025'|'2024'`, `fuente='hacienda_conprel'`, `estado ok|partial|error`, `registros_leidos/actualizados`, `error_message`, `metadata={runId, sha256, bytes, fase, corte, entidades, municipios_escritos, cobertura_pct, join_regla:'LEFT(codente,5)', duplicados_descartados, slugs_preservados, bytes_max, lote, lote_total, backup{dir,ok,bytes,r2,limite}, revalidation{...}, degradacion, audit_supabase}`. Además una fila `*_revalidacion` cuando haya revalidación. El `estado` refleja éxito/fallo del run; `metadata.cobertura_pct` la cobertura; `metadata.degradacion` marca omisiones (sin Supabase, revalidación degradada, backup espejo R2 ausente).
3. **Orden inalterado:** dry-run → **backup durable por run** (`tmp/conprel-backups/<runId>/` con `index.json` de bytes+sha256 por INE; aborta el run si el backup falla) → escritura R2 (merge aditivo, <150 KB) → read-back → `revalidateAfterWrites` batch **solo con INE escritos** → fila de revalidación/degradación (`buildRevalidationAuditRow`) + fila del run. Fallo de revalidación ⇒ degradación auditada, R2 intacto.
4. **Rollback:** por run, restore de envelopes desde el backup local (patrón fix-tgss) vía `scripts/conprel-restore.ts` (valida sha256 y «reproduce el put» solo en destino aislado `tmp/conprel-restore-sim/<runId>/`; nunca escribe el R2 oficial) + `git revert` del loader; sin migraciones destructivas. El espejo R2 del backup (`socideas/backups/conprel/<runId>/`) es opcional y solo con credenciales + gate doble (ver `CONPREL_BACKUP_LIMITE_DOC` en `src/lib/conprel-backup.ts`).

### 7.1 Carga inicial por lotes

La primera escritura real se hace en tandas: `--lote=N --lote-total=M`
particiona de forma **determinista** el conjunto de INEs ordenado en M
tramos casi iguales (`src/lib/conprel-lotes.ts`). Secuencia recomendada:
(1) lote 1 en modo escritura con backup+read-back+revalidación,
(2) `conprel-restore` de muestra para verificar hashes,
(3) lotes 2..M, (4) dry-run `--size-full` final. Cada lote deja su propia
fila en `data_sync_runs` con `metadata.lote`/`lote_total`.

## 8. Puntos de verificación abiertos

| ID | Punto | Estado |
|---|---|---|
| V1 | Glosario `cdFase=U` / `cdImporte=P` en la nota metodológica (PDF 809/814) | **Abierto** (extractor de texto PDF pendiente). Etiqueta actual: «definitiva de la publicación» con evidencia indirecta (§2) |
| V2 | Semántica columnas LIQ (`d/r/l/c`) | **Cerrado** — match exacto Albanchez vs EL2025CT (§3) |
| V3 | Consistencia suma-Access vs workbook (97,8 %) | **Abierto (no bloqueante)** — acotar alcance (ZZ/grupos/no firmantes) antes de publicar agregados nacionales; la carga municipal usa solo AA+ZZ por `idente` |
| V4 | Cobertura de la familia LIQ en Albacete (9 sin inventario en la muestra) | Enmarcado dentro de `partial`; lista en CSV de ausencias |

## 9. Checklist de aprobación previa a carga (gate)

- [ ] Aprobación explícita de este documento (diseño + textos + auditoría).
- [ ] V1 resuelto **o** aceptación formal de la etiqueta «definitiva de la publicación CONPREL» sin usar «inicial/avance».
- [ ] Loader con `--dry-run` por defecto, `--confirm-r2-write`, manifest sha256, merge aditivo, gate 150 KB, read-back, revalidación batch (patrón AEAT/estándar).
- [ ] QA: cobertura 14 (fixtures) + SSR/XLSX con los textos §5 + muestra ≥30 con ND≠0.
- [ ] Sin escritura previa a ese gate. **Fase 4 (B1–B4) sigue separada.**

---

*Documento de diseño · solo lectura · ninguna cifra de este ciclo se ha publicado en R2, Supabase ni UI.*
