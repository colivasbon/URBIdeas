# CONPREL — Veredicto de magnitudes (contabilidad pública)

**Fecha:** 2026-09-24 · **Rama:** `feat/conprel-contabilidad` · **Estado:** INFORME DE INVESTIGACIÓN (solo lectura)
**Script reproducible:** `scripts/conprel-reconciliar-workbook.ts` → `npx tsx scripts/conprel-reconciliar-workbook.ts` → informes en `tmp/conprel-reconciliacion/` (gitignored).
**Fuentes:** PDF 809 `metodologia_access.pdf` y PDF 814 `nota_metodologica.pdf` (extracción de texto completa, ver §1) · CSVs extraídos de los `.accdb` definitivos · workbooks oficiales `EP2025C01..19` / `EL2024C01..19` / `EP2025_def_total` / `LD2024` (temp fuera del repo) · `pd2025_nonsigners.csv` · `EL2025CT.xlsx` (diagnóstico).

---

## TABLA DE VEREDICTOS

| magnitud | definición oficial | unidad administrativa | columna(s) fuente | regla de agregación | prueba | municipios contrastados | veredicto |
|---|---|---|---|---|---|---|---|
| **PPTO · `importe`** (`conprel_ppto_importe`, ej. 2025) | **Sin definición de fase resuelta.** PDF 809 solo define `Importe: Importe del dato económico` (genérico, §Tablas). Workbook `EP2025*`: `Parametros` = `cdImporte: P · cdFase: U` **sin glosario**; cabeceras de hoja de entidad = **«Previsión inicial»** (ingresos) / **«Créditos iniciales»** (gastos) — las mismas cabeceras en el avance `EP2026` (no distinguen definitivo/avance). Portal: descarga en la sección «datos definitivos» (`TipoPublicacion`). Nota metodológica: «definitiva» = fase **estadística** de la publicación (cobertura), no de crédito. **V1 ABIERTA** (§1). | Municipio / Ciudad Autónoma = fila `tb_inventario` con `codente` tipo **`AA`** (`ZZ` en 51001/52001); corporación = `id`; dependientes = demás `idente` del mismo `id` (`AO/AV` … , `ZV/ZO` en Ceuta/Melilla). **La cifra que iguala el workbook es la CONSOLIDADA** (`tb_economica_cons[id]` = AG + organismos autónomos dependientes − transferencias internas, criterio pagador EHA/3565 §metodología). La fila `idente=AA` de `tb_economica` es **solo la AG** y NO reproduce el workbook cuando hay dependientes (§3). | Workbook: hoja de entidad `EP2025Cxx` · Access: **`tb_economica_cons.importe`** (grain `id`); `tb_economica.importe` (grain `idente`) solo si se publica el grano AG. | `SUMA(importe)` por `(id, cdcta∈1..9, tipreig∈{I,G})` sobre `tb_economica_cons`; fila municipal = `id` de la fila `AA/ZZ`; **sin fila en Access → ND** (nunca 0); `0` publicado en fila existente = cero real. | (a) **38/38** municipios presentes en ambos lados: **18/18 celdas exactas** (tol 0,01 €) con estrategia `cons[id]`; estrategia `idente AA` falla en **30/38** (diff. máx. 493,9 M€ Barcelona) — §3. (b) Ceuta y Melilla: **18/18 exactos** (I y G × 9 cap.) vs `Tabla1` de `EP2025C18/C19` (miles). (c) `Tabla1` nacional: columna «Ciudades Autónomas» = Access ZZ **ratio = 1 en 9/9 capítulos de ingresos**. (d) Cadena nacional §4 (ratio 97,82 %). | Muestra diversa **45 INE**: 27 capitales/grandes, 2 CA, 6 medianos, 7 rurales/asimetrías, 3 ausencias forales · **40 con match exacto** (38 + Ceuta/Melilla) · 5 ausentes de Access documentados (48013 Barakaldo · 01059 Vitoria · 31169 Milagro · 01018 Zigoitia · 05188 Poveda) | **NO PUBLICABLE** — V1 sin resolver: no existe glosario de `cdFase=U`/`cdImporte=P` en PDF 809/814 ni en los workbooks; coexisten vocabularios en conflicto (cabeceras «iniciales» vs familia de publicación «definitiva» y `U` sin glossar). **No se usará «presupuesto definitivo» para `U`.** Perímetro SÍ resuelto (§2–§3). *Falta para pasar a PUBLICABLE:* (i) glosario primario de `U`/`P`, **o** (ii) aceptación formal del orquestador de una etiqueta neutral o de cabecera (p. ej. «previsión inicial / créditos iniciales del ejercicio 2025») con nota V1. |
| **LIQ · `imported`** (`conprel_liq_prevision_definitivos_importe`, ej. 2024) | **PDF 809 L435 (textual):** *«Imported: Previsión o créditos definitivos del ejercicio corriente.»* Corroborado por cabeceras del workbook `LD2024`/`EL2024Cxx`: **«Previsión Definitiva»** (ingresos) / **«Créditos Definitivos»** (gastos). | Ídem PPTO: `AA|ZZ` → consolidado por `id`. | Access: **`tb_economica_cons.imported`** · Workbook: `EL2024Cxx!Tabla 1` col. «Previsión Definitiva»/«Créditos Definitivos»; hojas de entidad **no exponen** esta columna (límite de esquema oficial). | `SUMA(imported)` por `(id, cdcta, tipreig)` sobre `cons`; ND si sin fila. | (a) **Ceuta + Melilla: 18/18 celdas exactas** (9 cap. × I/G) vs `EL2024C18/C19!Tabla 1` (miles, Δ≤1e-11 miles = ruido FP). (b) Definición primaria PDF 809. (c) Coherencia nacional `LD2024!Tabla 1`: ratios Access-planos/workbook 96,0–99,2 % en capítulos no transferencia (hueco = no firmantes LIQ §4b); cap. 4 y 7 con ratio >1 por **consolidación sectorial de transferencias interentidad** del agregado nacional (esperado, no es error de columna). | 2 CA exactas (72 celdas) + agregado nacional 9 cap. × 4 magnitudes; contraste de semántica adicional: `EL2025CT` (= liquidación **2025**) cuadra con `liq2025av` (§5), lo que valida la cadena de mapeo de columnas en la familia LIQ. | **PUBLICABLE** |
| **LIQ · `importer`** (`conprel_liq_reconocidos_importe`) | **PDF 809 L436 (textual):** *«Importer: Derechos u obligaciones reconocidas del ejercicio corriente.»* Workbook entidad: **«Derechos reconocidos netos»** (I) / **«Obligaciones reconocidas netas»** (G). | Ídem: `AA|ZZ` → `cons[id]`. | Access: **`tb_economica_cons.importer`** · Workbook: `EL2024Cxx` hoja de entidad (grupos de cabecera), col. «Derechos reconocidos netos»/«Obligaciones reconocidas netas». | `SUMA(importer)` por `(id, cdcta, tipreig)` sobre `cons`; ND si sin fila. | (a) **37/37** municipios presentes en ambos: **18/18 exactas** con `cons[id]` (estrategia AA falla en 30/37, diff. máx. 515,8 M€ Barcelona). (b) Ceuta+Melilla **18/18 exactas** vs `Tabla 1` col. «Derechos Reconocidos Netos». (c) PDF 809. (d) Definición de `imported` §sup. encadena la misma familia. | Muestra LIQ: **39 contrastados** (37 + 2 CA) · 6 ausentes Access documentados (48044 Getxo · 06161 Zarza-Capilla · 19191 Monasterio · 01059 · 31169 · 01018) | **PUBLICABLE** |
| **LIQ · `importel`** (`conprel_liq_recaudacion_corriente_importe`) | **PDF 809 L437 (textual):** *«Importel: Recaudación o pagos líquidos realizados del ejercicio corriente.»* Workbook: **«Recaudación Líquida Ejercicio corriente»** (I) / **«Pagos Líquidos Ejercicio corriente»** (G). | Ídem: `AA|ZZ` → `cons[id]`. | Access: **`tb_economica_cons.importel`** · Workbook: `EL2024Cxx!Tabla 1` col. «Recaudación Líquida / Pagos Líquidos Ejercicio corriente» (hojas de entidad no la exponen). | `SUMA(importel)` por `(id, cdcta, tipreig)` sobre `cons`; ND si sin fila. | (a) **Ceuta + Melilla: 18/18 exactas** vs `Tabla 1` (miles). (b) Definición primaria PDF 809. (c) Nacional: ratios 94,8–99,8 % no-transferencia, coherente con hueco de no firmantes; `importel ≤ importer` en el agregado (30.027 ≤ 32.315 miles € en cap. 1) — consistencia interna. | 2 CA (36 celdas) + 9 cap. nacionales; hojas entidad sin columna (esquema oficial). | **PUBLICABLE** |
| **LIQ · `importec`** (`conprel_liq_recaudacion_cerrados_importe`) | **PDF 809 L438 (textual):** *«Importec: Recaudación o pagos líquidos de ejercicios cerrados.»* Workbook: **«Recaudación Líquida Ejercicios cerrados»** (I) / **«Pagos Líquidos Ejercicios cerrados»** (G). | Ídem: `AA|ZZ` → `cons[id]`. | Access: **`tb_economica_cons.importec`** · Workbook: `EL2024Cxx!Tabla 1` col. «…Ejercicios cerrados». | `SUMA(importec)` por `(id, cdcta, tipreig)` sobre `cons`; **`0` publicado = cero real** (no hay NULLs en la fuente; los ceros son de la columna «ejercicios cerrados»); fila ausente → ND. | (a) **Ceuta + Melilla: 18/18 exactas**, incluidos ceros (p. ej. Melilla I8/I9 = 0 = 0) vs `Tabla 1`. (b) Definición primaria PDF 809. (c) Nacional: ratio 94,8–99,0 % no-transferencia; `importec` ≪ `importel` en todos los capítulos (1.793 ≤ 30.027 miles € cap. 1) — orden contable correcto. | 2 CA (36 celdas) + 9 cap. nacionales; hojas entidad sin columna (esquema oficial). | **PUBLICABLE** |

**Resumen:** PUBLICABLE = las **4 magnitudes de LIQ-2024** · NO PUBLICABLE = **PPTO-2025 `importe`** (etiqueta de fase V1).

---

## 1. V1 — `cdFase=U` y `cdImporte=P`: extracción y resultado

- Extracción de texto de **ambos PDF** completada (pdf-parse y método FlateDecode+Tj, ficheros `*.npx.txt` en temp): **0 ocurrencias** de `cdFase`, `cdImporte`, `Fase=` o glosario asociado en `metodologia_access.npx.txt` (PDF 809) ni en `nota_metodologica.npx.txt` (PDF 814). La keywordización de `extract-pdf-text.ps1` (`cdFase`, `cdImporte`, …) no encuentra hits.
- Workbooks con `Parametros`:
  - `EP2025_def_total` / `EP2025_def_01` / `EP2025C18` / `EP2025C19`: `cdImporte: P · Ejercicio: 2025 · cdFase: U` — **solo valores, sin leyenda**.
  - `LD2024` / `EL2024C01..19`: `Ejercicio: 2024 · cdFase: U` (sin `cdImporte`).
  - Avances (`EP2026_avance`, `EL2025CT`): **sin hoja `Parametros`**.
- Circunstancial: `U` co-ocurre solo con la familia de **definitivos**; no es glosario. **V1 queda ABIERTA con motivo exacto:** *los códigos no están definidos en la documentación primaria descargada ni en los propios workbooks; solo se observan como pares de parámetro sin leyenda.*
- Evidencia indirecta (no sustituye al glosario): plazo de firma «10 de diciembre del 2025» (hoja *Relación*); importes iniciales redondos; identidad numérica exacta con las cabeceras «Previsión inicial/Créditos iniciales» (§3).

## 2. Perímetro de la cifra (definiciones, PDF 809 + empírico)

| Nivel | Regla | Fuente |
|---|---|---|
| Entidad ayuntamiento | `codente` = INE-5 + tipo + ordinal; tipo **`AA`** = Administración General de Ayuntamiento, **`ZZ`** = Ciudad Autónoma (`DD/MM/GG/RR/TT/AE` = resto, excluidos). Filtro municipal estricto `AA\|ZZ`. | PDF 809 «codbdgel/codente» |
| Grupo de corporación | `tb_inventario.id` = ordinal de la entidad local (corporación); `idente` = AG (`idente=id` en la fila AA) o dependiente. **La cifra municipal consolidada se toma de `tb_economica_cons[id]`.** | PDF 809 `Id`/`Idente` + empírico §3 |
| Dependientes | Tipos `AV/AO/…` del ayuntamiento, `ZV/ZO` de Ceuta/Melilla (y plantillas `XV/XO/XL/XI` del PDF). Pertenecen al **mismo `id`** que la AG. **Nunca cuentan como municipio aparte** (regla `AA\|ZZ` del diseño §1 sigue vigente para recuentos de cobertura). | PDF 809 + diseño partial §1 |
| Eliminaciones / consolidación | «La consolidación … consiste en la agregación de la información … eliminando los gastos e ingresos de las transferencias internas»; desde EHA/3565/2008, transferencia interna = **importe declarado por el pagador**; la diferencia se registra como **«Ajustes de consolidación»** en ingresos. **`tb_economica_cons` ya incorpora estas eliminaciones**: su suma por `id` coincide **exactamente** con la fila del workbook. | PDF 809 §«Datos individualizados y consolidados» + PDF 814 §«Consolidación» + prueba empírica §3 |
| Ausencia | Sin fila `AA/ZZ` en el fichero → **ND**; no se imputa causa; `0` de la fuente se conserva como `0`. | Reglas vigentes (producto-textos §1) |

## 3. Prueba de grano: `idente AA` vs `cons[id]` (corrección al diseño §1)

Estrategias evaluadas por el script en la muestra (18 celdas = 9 capítulos × I/G):

| Estrategia | PPTO (presentes-ambos 38) | LIQ `importer` (37) | Lectura |
|---|---|---|---|
| **`tb_economica_cons[id]`** | **38/38 exactos** (684/684 celdas, 0 diff) | **37/37 exactos** (666/666, 0 diff) | **Grano correcto = consolidado = workbook** |
| `tb_economica[idente AA]` (diseño §1) | 8/38 exactos (solo munis sin dependientes) · 30 con diff (máx. 493,9 M€ Barcelona) | 7/37 exactos · 30 con diff (máx. 515,8 M€) | Es la **AG sola**: omite dependientes y las eliminaciones no están aplicadas |
| Σ `tb_economica` por `id` (sin eliminar) | Intermedio: cuadra en capítulos no transferencia; **desvia en 4/7** por transferencias internas | Ídem | No reconstruye la consolidación sin `eco_cons` |

Ejemplo Madrid (5 dependientes `AO`): `cons` = workbook exacto en 18/18; `AA` se desvía hasta 390,4 M€ en `G4` (transferencias internas AG→agencias) y 241,4 M€ en `G1` (personal de agencias).

**Implicación para el loader/orquestador:** la regla del diseño partial §1 («el importe municipal usa `idente` del inventario AA/ZZ») **publica la AG, no la cifra del workbook**. Para reproducir la serie oficial hay que extraer/usar **`tb_economica_cons`** (grain `id` de la fila AA/ZZ). Recuento de cobertura (7.345/8.132) no cambia: sigue siendo el de las filas `AA/ZZ` de `tb_inventario`.

## 4. El 97,82 % Access ↔ workbook (cadena completa, cap. 1 · Impuestos directos · ej. 2025)

| Nivel | Cifra | Δ vs anterior | Explicación |
|---|---|---|---|
| (1) `EP2025!Tabla1` col. **«Ayuntamientos»** | **22.588,41 M€** | — | Agregado **elevado** (factores Pi/pi por tramo, Nota metodológica §4: «el total … es superior al que pueda obtenerse como simple agregación»). |
| (2) Σ filas `A00` de las 19 hojas de entidad (plano, **8.130** filas) | **22.345,39 M€** | +243,03 M€ (elevación) | **Solo la columna Ayuntamientos está elevada**: Diputaciones (`D00` = 10.847,26) y Áreas Metropolitanas (`T00` = 132,30) cuadran **exacto** plano con `Tabla1`; Ciudades Autónomas ratio = 1 (cobertura censal = usada). |
| (3) Σ `cons[id]` Access de los **7.345** `AA` | **22.093,52 M€** | +251,87 M€ | **No firmantes con dato usados en la publicación**: hoja *Relación* = *«Entidades Locales que no han firmado la comunicación de los Presupuestos del ejercicio 2025 a 10 de diciembre del 2025 **y cuyos datos han sido utilizados en esta publicación**»* → **210 filas** (tipo A **128**; **122** de ellas fuera de Access) = **232,07 M€** + **residuo 19,79 M€** (diferencias fila-a-fila presentes/ausentes menores). |
| (4) Σ `tb_economica[idente AA]` (AG sola) | **22.096,62 M€** | (cons −3,10 M€) | Efecto de las eliminaciones de transferencias internas ya aplicadas en `cons`. |
| **Ratio (4)/(1)** | **97,82 %** ✓ | | (3)/(1) = 97,81 %. La cifra histórica del diseño se reproduce con la estrategia `AA`; con `cons` es 97,81 %. |

Otras notas oficiales del workbook aplicadas: total nacional **incluye Ceuta y Melilla**; Formentera computa en el Ayuntamiento de Formentera (en Access es `07024AA000`); **Álava fuera** de los agregados («corporaciones … salvo Diputación Foral») — Vitoria/Milagro/Zigoitia: filas en workbook **a cero** y ausentes de Access → coherentes (ND nuestro / 0 publicado suyo).

### 4b. Mismo mecanismo en LIQ-2024 (`LD2024!Tabla 1`, nacional)

- `LD2024!Relación`: no firmantes de la liquidación «a 10 de diciembre del 2025 **y cuyos datos han sido utilizados**».
- Ratios Access-planos / workbook (todas las entidades) en capítulos **no transferencia**: 94,8–99,2 % según magnitud/capítulo — mismo orden del hueco de no firmantes.
- Capítulos **4 y 7 con ratio > 1** (p. ej. 1,21 y 1,44 en `imported`): el agregado nacional es **«consolidado del total de Entidades»** y elimina transferencias **entre entidades locales distintas** (diputación→ayuntamiento etc.), que en Access (individualizadas por entidad) aparecen en ambos lados. **No es un error de columna**; impide usar el agregado nacional LIQ como prueba exacta (lo son las hojas de entidad y las Tabla 1 de Ceuta/Melilla).

## 5. Hallazgo: `EL2025CT.xlsx` está mal emparejado en la evidencia previa (V2)

- Título de la hoja de entidades: **«Liquidación de Entidades Locales 2025»** (`Pobla 2025`; Melilla a `N`/ceros = avance sin remisión) → **es la liquidación de 2025 (avance), no de 2024**.
- Albanchez (`idente 631`) cap. 1-I: `EL2025CT` = **211.693,90** = `liq2025av` ✓ · `Liquidaciones2024` Access `importer` = **275.980,26** ✗.
- **Conclusión:** la validación «V2 cerrada» del diseño §3 que contrastaba LIQ-2024 contra `EL2025CT` estaba **mal emparejada** (usaba los targets/valores de 2025). Tras corregir: la familia LIQ-2024 se valida contra **`EL2024C01..19` + `LD2024`** (hecho en este informe) y `EL2025CT` queda como evidencia **transversal de semántica de columnas** (cuadra con `liq2025av`, mismo esquema de años).
- `liq2025_crosscheck.csv` está **vacío** (0 filas) — no aporta.

## 6. Qué falta para cada NO PUBLICABLE / condiciones de las PUBLICABLE

| Magnitud | Condición |
|---|---|
| PPTO `importe` | **(i)** glosario primario de `cdFase=U`/`cdImporte=P` (portal OVEL, metadatos del descargable u hoja de glosario inexistente hoy), **o (ii)** aceptación formal de etiqueta por el orquestador (cabecera workbook «previsión inicial/créditos iniciales» con nota V1, o etiqueta neutral «importe comunicado»). Hasta entonces: **no publicar**, y en ningún caso rotular «presupuesto definitivo» por `U`. |
| LIQ (las 4) | Ninguna bloqueante. **Adoptar la regla `cons[id]`** (§3) en loader/contrato antes de cualquier carga; si se mantiene `idente AA`, la serie publicada **no** será la del workbook oficial (documentado). Cobertura/ND y textos `partial` siguen como en el diseño §4–§5 (no se tocan aquí). |

---

## 7. Reproducibilidad

```text
npx tsx scripts/conprel-reconciliar-workbook.ts
→ tmp/conprel-reconciliacion/report-<ts>.json        (métricas completas)
→ tmp/conprel-reconciliacion/comparisons-<ts>.csv    (celda a celda)
→ tmp/conprel-reconciliacion/gap-nonsigners-<ts>.csv (descomposición por CCAA)
```

Entradas esperadas en `%TEMP%/opencode/conprel/`: `csv/loader_*` (+ `csv/loader_eco_cons_*` extraídos de `tb_economica_cons`), `EP2025C01..19.xlsx` (`01` puede ser `EP2025_def_01.tmp`), `EP2025_def_total.tmp`, `EL2024C01..19.xlsx` (`01` = `EL2024_def_01.tmp`), `LD2024.tmp`, `EL2025CT.xlsx`, `csv/pd2025_nonsigners.csv`. Los workbooks `EP2025Cxx`/`EL2024Cxx` se obtienen del endpoint público `DescargaFichero?CCAA=xx&…&TipoPublicacion=Definitiva` (sin token). El script **no** escribe R2/Supabase ni ejecuta el loader.

---

*Informe del Agente A (contabilidad) · rama `feat/conprel-contabilidad` · sin escrituras externas · CONPREL no publicado.*
