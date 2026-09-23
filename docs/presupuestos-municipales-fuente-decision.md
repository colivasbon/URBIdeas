# Documento de decisión — Presupuestos y liquidaciones municipales

**Fecha:** 2026-09-22 (actualizado; evidencia de fase 3) · **Autor:** auditoría técnica SOCideas · **Estado final: PENDIENTE**
(Licencia verificable y descarga estructurada confirmadas; **faltan**: cobertura municipal suficiente demostrada y join INE-5 validado de extremo a extremo.)

Investigación de solo lectura. No se ha cargado ningún dato de presupuestos y no se ha escrito en R2 ni en Supabase. Descargas inspeccionadas solo en directorio temporal del sistema (fuera del repositorio).

---

## 1. Fuente propuesta y enlace oficial

**CONPREL — Consulta de Presupuestos y Liquidaciones de Entidades Locales**
Ministerio de Hacienda y Función Pública (SGFAL / OVEELL).

- Portal: https://serviciostelematicosext.hacienda.gob.es/sgfal/conprel
  (alias `/SGFAL/CONPREL`) — **HTTP 200** (2026-09-22).
- Endpoint de descarga real (GET, **sin autenticación**; replica el `window.location` del portal):
  `https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL/Consulta/DescargaFichero?...&TipoPublicacion=Access` → **HTTP 200** con `Content-Disposition: attachment`.
- Hub OVEELL: `ConsultaPresupuestosYLiquidaciones.aspx` — **timeout (HTTP 000)** en esta pasada; no usable como espejo.
- Landing presupuestos (app 2022+ requiere sesión Autoriza): https://www.hacienda.gob.es/es-ES/CDI/Paginas/InformacionPresupuestaria/InformacionCCLLs/Presupuestos_EELL.aspx — HTTP 200 (solo landing).

Producto relacionado (NO es presupuesto): **Deuda viva EELL**
- XLSX verificado HTTP 200, 732.340 B:
  https://www.hacienda.gob.es/cdi/sist%20financiacion%20y%20deuda/informacioneells/2025/deuda-viva-ayuntamientos-202512.xlsx

## 2. Evidencia de que es nacional y descargable

**Descarga estructurada confirmada el 2026-09-22 (sin login):**

| Fichero | HTTP | Bytes (zip) | Contenido |
|---|---|---|---|
| `Presupuestos2026.zip` (avance) | 200 | 27.041.295 | `Presupuestos2026_agosto.accdb` (251.813.888 B) |
| `Presupuestos2025.zip` (definitivo) | 200 | 31.507.889 | `Presupuestos2025.accdb` (294.670.336 B) |
| `Liquidaciones2024.zip` (definitivo) | 200 | 52.555.360 | `Liquidaciones2024.accdb` (445.128.704 B) |
| `Liquidaciones2025.zip` (avance) | 200 | 43.760.616 | Access avance |
| `EL2025CT.xlsx` (avance Excel) | 200 | 3.284.004 | Hojas CCAA + «-Entidades» |
| PDF Metodología ACCESS (`idFichero=809`) | 200 | 265.811 | Nota metodológica |
| PDF Nota metodológica general (`idFichero=814`) | 200 | 166.464 | Nota general |

Esquema Access (ACE OLEDB) inspeccionado localmente:

| Tabla | Columnas |
|---|---|
| `tb_inventario` | `codbdgel`, `codente`, `estado`, `id`, `idente`, `nombreente`, `nombreppal`, `nsec`, `poblacion` |
| `tb_economica` | `cdcta`, `id`, `idente`, `importe`, `tipreig` (I/G) |
| `tb_funcional` | `cdcta`, `cdfgr`, `id`, `idente`, `importe` |
| catálogos | `tb_cuentasEconomica`, `tb_cuentasProgramas`, `tb_Provincias`, `tb_CCAA`, `tb_economica_cons`, `tb_funcional_cons` |

Tipos de entidad en `codente` (posición 6-7) — PPTO 2025: `AA` 7.343 (ayuntamientos), `MM` 410 (mancomunidades), `AV` 367, `AE` 737, `AO` 154, `DD` 50 (diputaciones), `ZZ/ZV/ZO` (Ceuta/Melilla), etc. `estado`: `C` vigente / `E` baja.

Excel avance: columnas `Pr|Cor|Tipo|Nombre|Pobla|Estado Inf.|…`; grupos **«Derechos liquidados»** y **«Obligaciones reconocidas netas»**; `Tipo=A00` = ayuntamiento (p. ej. Madrid `Pr=28 Cor=079`).

## 3. Campos candidatos y definición oficial

Definiciones por la clasificación económica EHA/3565/2008 + PDFs metodológicos descargados (HTTP 200; extracción de texto de los PDF pendiente — streams comprimidos):

| Campo candidato | Definición contable (fase) | Dónde |
|---|---|---|
| Presupuesto inicial / modificado | Ejercicio + `TipoDato=Presupuestos` | Access `Presupuestos*.accdb` |
| Presupuesto definitivo | Definitivo tras modificaciones | Access (ejercicios definitivos) |
| Derechos reconocidos / recaudación | Liquidación: en Excel figuran como **«Derechos liquidados»** | `EL2025CT.xlsx` |
| Obligaciones reconocidas netas / pagos | Liquidación | `EL2025CT.xlsx` / `tb_economica` |
| Ejecución % | Derivado, con definición explícita | cálculo futuro |
| Deuda viva | **Producto distinto** (XLSX anual Hacienda) | fuera de CONPREL Access |

⚠️ Presupuesto ≠ liquidación. ⚠️ Avance ≠ definitivo (congelar versión/hash).

## 4. Identificador y estrategia de join

- **Confirmado en el Access:** `codente`/`codbdgel` = `NNNNN` (INE-5) + `TT` (tipo, 2 chars) + `SSS` — ej. `28079AA000` (Madrid), `41091AA000` (Sevilla). **No hay NIF ni DIR3** en `tb_inventario`; `idente`/`id` son IDs internos CONPREL.
- **Validado sistemáticamente el 2026-09-22** (dry-run `scripts/dry-run-conprel-100.ts`, solo lectura):
  - **PPTO-2025:** 7.352 filas municipales → **7.352/7.352 prefijos ∈ catálogo INE-5** (0 desconocidos); nombre concuerda en **7.302 (99,3 %)**; los 50 divergentes son **variantes de la misma entidad** (cambios oficiales de nombre tipo `Candín`→`Valle de Ancares`, orden bilingüe, grafías).
  - **LIQ-2024:** 6.868/6.868 prefijos ∈ catálogo; nombre **99,2 %** (52 variantes).
- Regla de join aprobada en principio: `LEFT(LEFT(codente,5)) → INE-5` con filtro de tipo (`AA`; en Ceuta/Melilla sus tipos municipales). **El join va por código, nunca por nombre** (el nombre solo se usó como diagnóstico).
- Corrección de un error previo de etiquetado (importante): **Bilbao = INE `48020`** (no 48013; `48013` = Barakaldo, `48044` = Getxo — concuerdan catálogo SOCideas y CONPREL). La presunta «ausencia de 48013 en presupuestos» era un efecto de esa etiqueta errónea: **Bilbao sí está** (`48020AA000` en ppto y liq).
- BDGEL (INE + NIF) sigue disponible como documentación oficial de correspondencias, pero **no ha hecho falta para el join por código** y no se usa como puente obligatorio hoy.
- Filtro obligatorio de tipo de entidad (excluir `DD`, `MM`, `AO`, `AV`, `ZO`…). **Nunca join por nombre.**

## 5. Cobertura observada (muestra de 100 + volúmenes)

Fecha medición: 2026-09-22 (dry-run solo lectura; informe `tmp/conprel-dryrun-100-*.json`).

**Muestra estratificada de 100** (códigos de capital **verificados contra el catálogo**: Burgos 09059, Cáceres 10037, Cádiz 11012, Granada 18087, Huelva 21041, Jaén 23050, Teruel 44216, Zaragoza 50297, Bilbao 48020, Toledo 45168…): 49 capitales + 10 forzosos (Santiago 15078, Cartagena, Ceuta, Melilla, Abengibre, A Pastoriza, Arrecife, Eivissa, Tudela, Getxo) + rurales `población<1000` hasta 100.

| Métrica (muestra 100) | PPTO-2025 | LIQ-2024 |
|---|---|---|
| Join por código (naive-hit) | **97/100** | **94/100** |
| Presencia diagnóstico por nombre | 95/100 | 92/100 |
| Ausentes naive | 3 (`01018`, `01059` Vitoria, `31169`) | 6 (`01018`, `01059`, `06161`, `19191`, `31169`, `48044` Getxo) |

**Volúmenes** (`tb_inventario`, unidades = entidades locales; **no** comparables 1:1 con las 8.132 filas del catálogo municipal SOCideas):

| Fichero | Entidades totales | Municipios tipo `AA` | Filas `tb_economica` |
|---|---|---|---|
| PPTO 2026 avance | 7.720 | 6.139 | ~961k |
| PPTO 2025 definitivo | 9.269 | **7.343–7.352** | 1.130.531 |
| LIQ 2024 definitivo | 8.986 | **6.859–6.868** | 1.190.208 |

**Huecos estructurales detectados (bloquean el criterio 6):**

- **Álava (provincia 01): 0 municipios `AA`** en PPTO-2025 (solo figura la Diputación Foral `01000DD000`). Provincia completa sin municipios.
- **Navarra (31): solo 39 municipios `AA`** de ~272.
- Ausencias puntuales en la muestra (Vitoria 01059 en ambos; Getxo 48044 en liquidaciones; Zigoitia,31169, etc.) pendientes de explicar (cumplimiento/suministro/variante).
- Bizkaia94 `AA` y Gipuzkoa76 `AA` **sí** presentes en presupuestos (el País Vasco no es un bloque uniformemente ausente).

Muestra completa y explicación de huecos: §10.

**Nota metodológica de contables (cabeceras oficiales, hoja «Nacional» de `EL2025CT.xlsx`):** `Presupuesto Inicial` · `Previsión Definitiva` (presupuesto) frente a `Derechos Reconocidos Netos` · `Recaudación Líquida Ejercicio corriente/Ejercicios cerrados` (liquidación/ejecución) — presupuesto, liquidación y ejecución son **columnas distintas**; `tb_cuentasEconomica` (702 conceptos) aporta el catálogo oficial de definiciones (capítulos Ingresos/Gastos EHA).

## 6. Mapa de riesgos y exclusiones

| Riesgo | Impacto | Mitigación | Estado |
|---|---|---|---|
| Ámbito subjetivo restringido (no todo el sector local) | Huecos | Publicar cobertura real; `partial` honesto | vigente |
| Unidades no municipales (`DD`, `MM`, `AO`…) | Filas no joinables | Filtro de tipo por `codente[6..7]` / `Tipo` | verificado en esquema |
| Consolidación corporación + dependientes | No comparable con cuentas no consolidadas | Etiqueta metodológica | vigente |
| Presupuesto vs liquidación | Series incompatibles | Columnas separadas | vigente |
| Avance vs definitivo | Cifras cambiantes | Fase + hash + fecha por descarga | vigente |
| Cumplimiento incompleto (Ley 2/2011 art. 36) | Ausencias reales | `missing`/`partial`, nunca 0 | vigente |
| Territorios forales | Cobertura distinta | `missing_by_design` sin imputación | vigente |
| Duplicados por mezclar niveles | Dobles conteos | Filtrar nivel | vigente |
| Cambios de código de entidad | Joins rotos | Validar por run + manifest | vigente |
| Ausencia de 48013 en presupuestos pese a existir en liquidaciones | Cobertura incompleta/inconsistente | Investigar suministro; no imputar | **ABIERTO** |
| Licencia de reutilización | Bloqueo legal | **Resuelto:** aviso legal Hacienda HTTP 200 (ver §11) | cerrado 2026-09-22 |

## 7. Diseño de parser

- Descarga reproducible: URL + fecha + bytes + SHA-256 del cuerpo crudo en manifest (patrón AEAT EDM).
- Origen: ZIP → `.accdb` (ACE OLEDB → CSV/Parquet local) o Excel de avance cuando sirva.
- Validaciones: columnas esperadas, tipos de entidad, rangos contables, conteos por tipo.
- `importe` con coma decimal textual en Access → parser ES.
- dry-run obligatorio antes de escritura. Nunca scraping de la app con sesión Autoriza.

## 8. Diseño de envelope v2

- Merge aditivo en `socideas/v2/municipios/{INE-5}.json`; slugs candidatos (nombres finales al ver datos reales): `presupuesto_ingresos_inicial`, `presupuesto_ingresos_definitivo`, `presupuesto_gastos_definitivo`, `derechos_reconocidos`, `obligaciones_reconocidas`, `ejecucion_ingresos_pct`, `ejecucion_gastos_pct`.
- Tupla v2 estándar + `dimensiones.ambito=municipio` + `dimensiones.fase=definitivo|avance`.
- `tableId` `CONPREL-<ejercicio>` → rama `^CONPREL` en `sourceSlugForTable` → fuente `hacienda_conprel`.
- Preservación de slugs + tope 150 KB. Deuda viva = slug/fuente propia.

## 9. Diseño de auditoría `data_sync_runs`

- `tipo_sincronizacion: 'conprel_presupuestos'`, `bloque: 'economia'`, `periodo: <ejercicio>`, `fuente: 'hacienda_conprel'`.
- `metadata`: `{ runId, url, sha256, bytes, fase, entidades_leidas, municipios_escritos, cobertura_muestra, descartadas_no_municipales, join_regla, errores[] }`.
- Revalidación selectiva `socideas-muni-<ine>` tras escritura (endpoint ya operativo).

## 10. Plan de dry-run de 100 municipios

1. Descargar Access/ZIP del último ejercicio **definitivo** (registrar URL/fecha/sha256 del cuerpo).
2. Extraer a CSV/Parquet local (fuera del repo).
3. Validar columna `codente`, tipos, estados C/E.
4. Aplicar join `LEFT(codente,5)` + filtro `AA` (y equivalentes Ceuta/Melilla); medir match.
5. Muestra estratificada de 100 INE-5 (incluye la muestra de 14 de QA + rurales + forales + insulares): % con fila de presupuesto y de liquidación; explicar 48013.
6. Simular merge R2 (slugs preservados, <150 KB) sin escribir.
7. Publicar resultados en §5/§11 de este documento.

## 11. Criterios de GO + resultado de la investigación de cobertura

### 11.1 Criterios (nueve)

| # | Criterio | Estado (2026-09-22) | Evidencia |
|---|---|---|---|
| 1 | Fuente oficial | ✅ | Ministerio de Hacienda · CONPREL SGFAL · `hacienda.gob.es` |
| 2 | Descarga estructurada nacional/API verificable | ✅ | ZIP→`.accdb` + Excel, HTTP 200 **sin auth**; esquema inspeccionado (§2) |
| 3 | Definición de indicadores | ✅ | Cabeceras `EL2025CT.xlsx` + `tb_cuentasEconomica` (702 conceptos) + PDFs 200 |
| 4 | Licencia / reutilización | ✅ | `Avisolegal.aspx` HTTP 200 (Ley 37/2007; cita «Origen de los datos: Ministerio de Hacienda») |
| 5 | Identificador o puente de join reproducible | ✅ | `LEFT(codente,5)`: 100 % de prefijos ∈ catálogo INE-5 en ambos definitivos; divergencias de nombre = variantes de la misma entidad; join por código, nunca por nombre |
| 6 | Cobertura suficiente (serie completa) | ❌ | **Medida y caracterizada** (§11.2–11.4): nacional 90,3 % (ppto) / 84,4 % (liq); Álava 0/51; Navarra ~14 %; 510 ausentes en los 4 ficheros → **no alcanza `available`** → salida **B** |
| 7 | Tratamiento de entidades no municipales | ✅ | Tipos contados por fichero (§11.2): `DD`50, `MM`410, `AV`367, `AO`154, `ZZ`2… filtro definido |
| 8 | Estrategia de auditoría | ✅ | Diseño §9 (manifest + `data_sync_runs` + revalidación) |
| 9 | Dry-run posible | ✅ | Descarga, esquema, muestra 100, join sistemático **y matriz de cobertura** ejecutados |

GO exige ✅ en las nueve filas. Con criterio 6 en ❌ la serie completa **no puede ser `available`**.

### 11.2 Matriz municipio × fichero (denominador explícito)

**Denominador: 8.132 municipios del catálogo SOCideas** (incluye Ceuta 51001 y Melilla 52001). Municipal CONPREL = tipo `AA` (+ `ZZ` en Ceuta/Melilla). Artefactos (solo lectura) en `tmp/conprel-coverage/`: `<fichero>-presentes.csv`, `<fichero>-ausencias.csv`, `ausentes-los-4-ficheros.csv`, `navarra-*.csv`, `matrix-report-*.json` · generador: `scripts/conprel-coverage-matrix.ts`.

| Fichero | Fase | Municipios (AA+ZZ) | Cobertura nacional |
|---|---|---|---|
| Presupuestos 2025 | definitivo | 7.345 | **7.345/8.132 = 90,3 %** |
| Presupuestos 2026 | avance | 6.141 | 6.141/8.132 = 75,5 % (remisión incompleta aún) |
| Liquidaciones 2024 | definitivo | 6.861 | **6.861/8.132 = 84,4 %** |
| Liquidaciones 2025 | avance | 5.623 | 5.623/8.132 = 69,1 % |

**Precisión de recuentos (2026-09-23):** el dry-run previo contaba 7.352/6.868 *filas* municipales con un predicado laxo que incluía **7 organismos dependientes `ZV/ZO` de Ceuta y Melilla**; con el predicado estricto `AA|ZZ` de la matriz: **7.345/6.861 municipios-distinto-ficha** y **0 códigos duplicados** en ambas familias (regla de duplicados y clave única: `docs/conprel-integracion-partial-diseno.md` §1).

**Cobertura de presupuesto y de liquidación son independientes** (90,3 % ≠ 84,4 %): una no se hereda de la otra. Los **avances no se publican como cobertura** (deficitario por diseño de remisión).

**CCAA por debajo de 100 % — Presupuestos 2025 (definitivo):** Navarra 39/272 (14,3 %) · País Vasco 170/252 (67,5 %) · Castilla-La Mancha 780/919 (84,9 %) · La Rioja 154/174 (88,5 %) · CyL 2.067/2.248 (91,9 %) · resto ≥94,9 % (Galicia/Cataluña 98,1 %). **Provincias con 0 municipios: solo Álava (0/51)** — Ceuta 1/1 y Melilla 1/1 en los cuatro ficheros salvo Melilla en avance liq 2025 (0/1, timing).

**CCAA — Liquidaciones 2024 (definitivo):** Navarra 38/272 (14,0 %) · Castilla-La Mancha 590/919 (64,2 %) · País Vasco 185/252 (73,4 %) · La Rioja 130/174 (74,7 %) · resto ≥84,4 % (Canarias 96,6 %).

**Tipos de entidad (Presupuestos 2025, distinción exigida):** `AA` 7.343 · `MM` 410 mancomunidades · `AE` 737 · `AV` 367 organismos autónomos · `AO` 154 · `DD` 50 diputaciones · `DO` 29 · `DV` 62 · `RR` 65 · `ZZ` 2 (Ceuta/Melilla) · resto (`GG/MO/MV/RO/RV/TO/TT/ZO/ZV/EO`) <30 c/u. Solo `AA`+`ZZ` cuentan como municipio.

### 11.3 Dossier de ausencias (causa investigada, sin join por nombre)

| Caso | Hallazgo | Diagnóstico |
|---|---|---|
| **Álava** | En los **definitivos** (ppto 2025 y liq 2024/2025-av) la provincia 01 solo contiene `01000DD000` (Diputación Foral) + organismos `DV/DO`: **0 municipios**. En **ppto 2026 avance ya aparecen 15 municipios `AA`** (Vitoria aún no). Diagnóstico por nombre sin hallar fila municipal con clave alternativa. | **Hecho medido:** 0 municipios en los definitivos; 15 en el avance ppto 2026. **Hipótesis (no demostradas):** H1 remisión tardía/incompleta (compatible con el salto del avance); H2 no remisión en ese corte. No se afirma causa. Vitoria-Gasteiz: **ausente en los 4 ficheros** por código y por nombre. |
| **Navarra** | 39/272 presentes en ppto 2025 (`navarra-presentes-ppto2025.csv`): incluye Pamplona 31201, Tudela 31232 y cabeceras comarcales; **ausentes 233** (`navarra-ausentes-ppto2025.csv`), desde Abáigar hasta Milagro 31169 (municipio de ~15 mil hab.) — **el hueco no se explica por tamaño**. Estabilidad: 39 (ppto def) → 28 (ppto av) → 38 (liq def) → 22 (liq av). | **Hecho medido:** cobertura parcial estructural ~14 % estable en definitivos. Causa individual no demostrada. |
| **Vitoria 01059** | 0 filas con prefijo `01059` y 0 coincidencias `Gasteiz|Vitoria` en los 4 ficheros. | Ausencia total de la entidad en la ventana descargada; causa no demostrada. |
| **Getxo 48044** | Presente en **ppto 2025** (`48044AA000`); **ausente** en ppto 2026-av, liq 2024 y liq 2025-av (por código y por nombre). | **Ausencia puntual inestable** (una familia/sí y otra no): no heredar cobertura entre ficheros; causa no demostrada. |
| **01018 Zigoitia** | 0 en los 4 | Parte del hueco alavense. |
| **31169 Milagro** | 0 en los 4 | Parte del hueco navarro (pese a ser municipio mediano). |
| **06161 Zarza-Capilla (Badajoz)** | Solo en **ppto 2025** | Remisión puntual no repetida en avances/liq; causa no demostrada. |
| **19191 Monasterio (Guadalajara)** | Solo en **ppto 2025** | Mismo patrón que 06161. |

**510 municipios están ausentes en los cuatro ficheros** (`ausentes-los-4-ficheros.csv`) — **ausentes en la ventana 2024–2026 analizada; no implica exclusión permanente** (corte temporal, no dictamen definitivo).

### 11.4 Diagnóstico de estabilidad (2 ejercicios por familia)

| Familia | Definitivo | Avance | Delta | Lectura |
|---|---|---|---|---|
| Presupuestos | 2025 → 90,3 % | 2026-av → 75,5 % | −1.204 mun. | El avance **nunca** refleja cobertura final (1.340 mun. del def. aún no están en el avance; 136 llegaron después). |
| Liquidaciones | 2024 → 84,4 % | 2025-av → 69,1 % | −1.238 mun. | Ídem. |

- Álava: 0 en definitivos → **15 AA en avance ppto 2026** (el salto es un **hecho**; la causa «remisión tardía» es **hipótesis H1 no demostrada**); 0 en liquidaciones (todavía).
- Navarra: ~14 % estable en definitivos; avances aún menores.
- Las ausencias **no son homogéneas** entre presupuesto y liquidación (Getxo, 06161, 19191): cada familia se declara por su propio fichero/ejercicio.
- La estabilidad obliga a publicar **solo definitivos** y a congelar hash/ejercicio.

### 11.5 Contrato propuesto para la futura serie

**Estado inicial propuesto: `partial`** (no `available`; no `missing_by_design` nacional porque la ausencia no es por diseño homogéneo; no `not_applicable` porque sí aplica a los municipios con dato).

- **Texto de ficha/XLSX (propuesta):** «Serie CONPREL de presupuestos/liquidaciones de entidades locales con cobertura parcial: 90,3 % de los 8.132 municipios en presupuestos 2025 (definitivo) y 84,4 % en liquidaciones 2024 (definitivo). Los municipios sin remisión se muestran como ND; nunca como 0 ni se imputan. Cobertura propia por familia de fichero; los avances no se publican como cobertura.»
- **Territorios excluidos/parciales a declarar:** Álava 0/51 (avance ppto 2026: 15/51), Navarra ~14 %, Vitoria-Gasteiz, los 510 ausentes persistentes (lista en `ausentes-los-4-ficheros.csv`) y las ausencias puntuales por familia (Getxo en liq, etc.).
- **Reglas:** ND ≠ 0 · presupuesto ≠ liquidación · definitivo ≠ avance · join solo por `codente` · filtro de tipos · AEAT/ADRH siguen intactos (esta serie no toca renta).
- **No se diseñan slugs finales ni se carga ningún valor** en esta misión.

### 11.6 Salida de la investigación

```text
A. Cobertura explicada y aceptable → propuesta GO separada
B. Cobertura estructuralmente parcial → propuesta de integración partial con exclusiones explícitas
C. Cobertura no explicable o inestable → NO-GO
```

# SALIDA: **B**

La cobertura está **explicada** (§11.2–11.4) y es **estructuralmente parcial** (Álava 0 en definitivos, Navarra ~14 %, 510 ausentes persistentes, inestabilidad entre familias). Procede una **propuesta de integración `partial` con exclusiones explícitas** en una misión posterior de diseño; no procede `available` (no es A) ni `NO-GO` (la fuente, el join y la licencia son sólidos; la ausencia es explicable, no caótica — no es C).

## 12. Recomendación final

# PENDIENTE (GO denegado) → vía aprobada: **B — propuesta `partial`**

**Cerrados:** descarga sin auth; join `LEFT(codente,5)` validado sistemáticamente (100 %); licencia verificable; definiciones contables oficiales; muestra de 100; **matriz completa 4 ficheros × 8.132 municipios**; dossier de ausencias (Álava/Navarra/Vitoria/Getxo/01018/31169/06161/19191); estabilidad 2 ejercicios por familia; contrato `partial` propuesto (§11.5).

**Erratas corregidas:** Bilbao = **48020** (48013 = Barakaldo) — fixture compartido en `scripts/qa-fixtures.ts`; códigos de capital verificados en el mismo fixture.

**Siguiente paso (aprobado):** misión de **diseño de integración `partial`** (parser, contrato de indicadores con cobertura por fichero/ejercicio, texto final de ficha/XLSX, plan de auditoría y dry-run de escritura simulada) — **sin carga real hasta aprobación explícita**. El dictamen `GO` para serie completa queda denegado hasta que un ejercicio definitivo alcance cobertura aceptable y estable.

**Prohibido (igual que antes):** parser productivo en esta misión, slugs finales, tablas nuevas, carga R2, publicación de presupuestos.

**Fase 4 (aislada, no ejecutada):** B1 caché R2 · B2 separación de secretos · B3 rate limit · B4 permisos de Runtime Errors/Logs del conector (`docs/backlog-hardening-revalidacion.md`).

**Nota:** deuda viva = producto distinto (XLSX Hacienda verificado), nunca mezclada con liquidaciones.
