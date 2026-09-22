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
- **Hipótesis de join (reproducible, aún NO validada extremo a extremo):**
  ```sql
  LEFT(LEFT(codente, 5), INE-5)   -- filtro tipo = 'AA' (o 'ZZ'/'ZV'/'ZO' en Ceuta/Melilla)
  ```
  Excel avance: `Pr(2) || Cor(3)` = INE-5 con `Tipo = 'A00'`.
- Evidencia de coherencia: 9–10/10 INE de prueba resuelven por esta regla (ver §5).
- BDGEL (códigos INE + NIF) confirmado como dataset oficial en datos.gob.es, pero **solo app HTML de consulta, sin fichero masivo descargable** → no se usa como puente obligatorio hoy.
- Filtro obligatorio de tipo de entidad (excluir `DD`, `MM`, `AO`, `AV`, …). **Nunca join por nombre.**

## 5. Cobertura observada (muestra de 10 INE + volúmenes)

Fecha medición: 2026-09-22. Muestra: Albacete 02003, Madrid 28079, Sevilla 41091, Barcelona 08019, Pamplona 31201, Bilbao 48013, Ceuta 51001, Melilla 52001, Abengibre 02001, Palma 07040.

| Conjunto | PPTO 2026 avance | PPTO 2025 definitivo | LIQ 2024 definitivo |
|---|---|---|---|
| Muestra 10 INE | **9/10** | **9/10** | **10/10** |
| Ausencia | 48013 (Bilbao) | **48013** (Bilbao); Getxo figura como 48044 | — |

Volúmenes en `tb_inventario` (unidades = **entidades locales**, no municipios INE):

| Fichero | Entidades totales | Municipios tipo `AA` | Filas `tb_economica` |
|---|---|---|---|
| PPTO 2026 avance | 7.720 | 6.139 | ~961k |
| PPTO 2025 definitivo | 9.269 | **7.343** | 1.130.531 |
| LIQ 2024 definitivo | 8.986 | **6.859** | 1.190.208 |

Estos conteos **no se comparan automáticamente con el catálogo SOCideas de 8.132 municipios**: unidades distintas (entidades locales AA vs municipios INE), cortes distintos (avance/definitivo) y posible desfase de suministro. La brecha observada (p. ej. 7.343 AA vs ~8.131 INE y la ausencia de 48013 en ambos presupuestos) impide declarar cobertura suficiente hoy.

Muestra completa estratificada de 100 municipios (plan §10) aún **no ejecutada**.

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
| 3 | Definición de indicadores | ✅ | PDFs metodología HTTP 200; Excel distingue derechos liquidados vs obligaciones; presupuesto vs liquidación separados |
| 4 | Licencia / reutilización | ✅ | `https://www.hacienda.gob.es/es-ES/Paginas/Avisolegal.aspx` **HTTP 200** (2026-09-22): «Condiciones generales para la reutilización de información» — autoriza reutilización comercial/no comercial (Ley 37/2007 y RD 1495/2011) con cita «Origen de los datos: Ministerio de Hacienda», mención de fecha de actualización, conservación de metadatos y prohibición de desnaturalizar |
| 5 | Identificador o puente de join reproducible | ⚠️ | `LEFT(codente,5)` reproducible y coherente en 9–10/10, pero **falta validación sistemática** (§10) |
| 6 | Cobertura suficiente demostrada | ❌ | 7.343 / 6.859 / 6.139 AA vs ~8.131 INE; **48013 ausente** en presupuestos; muestra de 100 no ejecutada |
| 7 | Tratamiento de entidades no municipales | ✅ | Tipos `DD/MM/AO/AV…` identificados en `codente`/`Tipo`; filtro definido |
| 8 | Estrategia de auditoría | ✅ | Diseño §9 (manifest + `data_sync_runs` + revalidación) |
| 9 | Dry-run posible | ✅ | Ejecutado a nivel de descarga/esquema/muestra 10 (§2, §5); pipeline completo pendiente de §10 |

GO exige ✅ en las nueve filas. **Hoy: 6✅ + 1⚠️ + 2❌ → PENDIENTE.**

## 12. Recomendación final

# PENDIENTE

**Cerrado desde la versión anterior:** descarga Access/ZIP sin autenticación (verificada con tamaños y esquema), join `codente` confirmado como INE-5+tipo (hipótesis reproducible), cobertura medida sobre muestra de 10 y **licencia verificable** (aviso legal Hacienda HTTP 200 con condiciones de reutilización de la Ley 37/2007).

**Bloqueantes exactos para GO:**

1. **Cobertura suficiente:** ejecutar el dry-run de §10 (muestra de 100) y explicar/cerrar la **ausencia de 48013** en presupuestos y la brecha AA (~7.343) vs catálogo INE (~8.131), sin imputar.
2. **Join validado de extremo a extremo:** validar `LEFT(codente,5)` + filtro de tipo sobre el fichero completo (no solo 10 INE) con tasa de match publicada; si se necesita BDGEL, obtener descarga o puente oficial equivalente.

**Prohibido hasta entonces (y así ha permanecido en fase 3):** parser productivo, slugs públicos, tablas nuevas, carga R2, publicación de datos presupuestarios.

**Nota:** la deuda viva (XLSX Hacienda, HTTP 200 verificado) es producto distinto: integración propia con su definición de stock a 31/12, jamás mezclada con flujos de liquidación.
