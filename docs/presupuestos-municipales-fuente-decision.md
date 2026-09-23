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

## 11. Criterios de GO (nueve)

| # | Criterio | Estado (2026-09-22) | Evidencia |
|---|---|---|---|
| 1 | Fuente oficial | ✅ | Ministerio de Hacienda · CONPREL SGFAL · `hacienda.gob.es` |
| 2 | Descarga estructurada nacional/API verificable | ✅ | ZIP→`.accdb` + Excel, HTTP 200 **sin auth**; esquema inspeccionado (§2) |
| 3 | Definición de indicadores | ✅ | Cabeceras `EL2025CT.xlsx` (Presupuesto Inicial/Previsión Definitiva vs Derechos Reconocidos/Recaudación Líquida) + `tb_cuentasEconomica` (702 conceptos) + PDFs metodología 200 |
| 4 | Licencia / reutilización | ✅ | `Avisolegal.aspx` **HTTP 200** (2026-09-22): reutilización comercial/no comercial (Ley 37/2007) con cita «Origen de los datos: Ministerio de Hacienda», fecha y metadatos |
| 5 | Identificador o puente de join reproducible | ✅ | `LEFT(codente,5)`: **100 % de prefijos municipales ∈ catálogo INE-5** en ambos ficheros (7.352 y 6.868); divergencias de nombre 0,7 % = variantes de la misma entidad; join por código, nunca por nombre |
| 6 | Cobertura suficiente demostrada | ❌ | Muestra 100: hit 97/100 (ppto) y 94/100 (liq); **Álava 0 municipios AA**, **Navarra 39/272**, ausencias puntuales (Vitoria, Getxo-liq, etc.) sin explicar |
| 7 | Tratamiento de entidades no municipales | ✅ | Tipos `DD/MM/AO/AV/ZO…` identificados; filtro definido |
| 8 | Estrategia de auditoría | ✅ | Diseño §9 (manifest + `data_sync_runs` + revalidación) |
| 9 | Dry-run posible | ✅ | **Ejecutado**: descarga, esquema, muestra 100 y validación sistemática de join (`scripts/dry-run-conprel-100.ts`, informe en `tmp/`) |

GO exige ✅ en las nueve filas. **Hoy: 7✅ + 0⚠️ + 1❌ (criterio 6) → PENDIENTE.**

## 12. Recomendación final

# PENDIENTE

**Cerrado desde versiones anteriores:** descarga Access/ZIP sin autenticación (tamaños y esquema), **join `LEFT(codente,5)` validado sistemáticamente** (100 % de prefijos ∈ INE-5 en ambos ficheros definitivos; divergencias de nombre = variantes de la misma entidad), **licencia verificable** (aviso legal HTTP 200, Ley 37/2007), definiciones contables por cabeceras oficiales y **muestra estratificada de 100 ejecutada** (97/100 y 94/100 por código).

**Corrección de errata previa:** Bilbao es INE **48020** (48013 = Barakaldo). La «ausencia de 48013» no existía: era un efecto de etiquetado.

**Bloqueante único para GO — criterio 6 (cobertura suficiente):**

1. Explicar y cerrar el **hueco de Álava (0 municipios AA en presupuestos)**: ¿exclusión por suministro foral, clave alternativa o falta real de publicación?
2. Explicar **Navarra 39/272** y las ausencias puntuales de la muestra (Vitoria 01059 en ambos, Getxo 48044 en liquidaciones, 01018/31169/06161/19191…): ¿cumplimiento incompleto (Ley 2/2011 art. 36), recorte de ámbito u otro motivo?
3. Definir el estado de publicación SOCideas para la serie resultante (`partial` nacional con huecos documentados **o** cobertura declarada completa tras explicación) y re-ejecutar este dry-run como evidencia final.

**Prohibido hasta GO (y así ha permanecido):** parser productivo, slugs públicos, tablas nuevas, carga R2, publicación de datos presupuestarios.

**Nota:** la deuda viva (XLSX Hacienda, HTTP 200) es producto distinto (stock a 31/12), jamás mezclada con flujos de liquidación.
