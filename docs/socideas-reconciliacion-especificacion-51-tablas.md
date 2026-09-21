# SOCideas — Reconciliación de la especificación (51 tablas / 7 bloques) contra el sistema real — **v3**

> Tarea de **reconciliación y descubrimiento**. **No se ha cargado ningún dato nuevo**, ni se ha
> tocado R2, Supabase, el formato v2 ni ninguna clave en producción.
> v3: 2026-09-21 (cierre de evidencia). Rama: `feat/xlsx-pulido-y-ficha-hojas`.
> v3 = v2 + confirmación en vivo de las 4 tablas PC-Axis (Censo Agrario 2020 y Censo 2021), + estado
> real de los anexos (ver §0). Se preserva íntegro lo acertado de v1/v2.
> Verificación: API Tempus3 + `jaxi/Tabla.htm` (PC-Axis) + catálogo `TABLAS_OPERACION` del INE, y
> portales oficiales. Nada por memoria.

---

## 0. Aviso de alcance — anexos verificados en disco: **no disponibles para el agente**

El encargo indica que los dos anexos existen, y es cierto que están en el chat. El problema es de
**canal**: este agente de código **no puede leer adjuntos del chat**, solo el sistema de archivos.

- **ANEXO 1 (especificación literal de las 51 tablas):** en el mensaje largo original la sección
  «ESPECIFICACIÓN ORIGINAL RECIBIDA» quedó con el **placeholder literal**
  `[Pegar aquí el documento completo recibido del usuario...]`, **sin rellenar**. No hay texto de las
  51 tablas en el hilo.
- **ANEXO 2 (`24B128-Indicadores_linea-base-social.xlsx`):** adjunto del chat, no visible como fichero.
- Búsqueda en disco (2026-09-21): **NO existe ninguno de los dos** en el repo, `Downloads`, `Desktop`,
  `Documents`, `%TEMP%\opencode` ni `%TEMP%`.

**Cómo desbloquear la tabla de 51 filas (acción del usuario).** Guardar ambos ficheros en disco, p. ej.:

    docs/anexos/anexo-especificacion-51-tablas-para-cotejo.md
    docs/anexos/24B128-Indicadores_linea-base-social.xlsx

Con esos ficheros en disco, este agente los abre y completa el cotejo fila a fila (ver
`docs/anexos/README.md`). **Hasta entonces la
tabla de 51 filas literales queda BLOQUEADA por ausencia de entrada**; se entrega la tabla por bloques
(que cubre todo el sistema). De Villarrobledo se usan **solo URLs/patrones verificados en vivo**,
**nunca valores**.

---

## 0.1 ACTUALIZACIÓN v2 — correcciones por evidencia del caso real (obligatorio leer)

### Hallazgo 1 — Familias de tablas provinciales: **CONFIRMADO** (con matiz importante)

Verificación en vivo (2026-09-21) contra `TABLAS_OPERACION/188` del INE (catálogo de la operación
Padrón continuo · Resultados detallados):

- Las tablas `33758`, `33866`, `33577`, `33578`… **no son tablas rotas**: son **miembros `PROV-MUN` de
  familias**, una por provincia, con el MISMO nombre repetido:
  - *"Población por sexo, municipios y edad (grupos quinquenales)"* → `33758`, `33866`, … (52+ IDs).
  - *"Población por sexo, municipios y nacionalidad (principales nacionalidades)"* → `33578`, `33588`,
    `33658`, … (52+ IDs).
  - *"…nacionalidad (español/extranjero) y edad (grandes grupos)"* → `33577`, `33587`, `33657`, … .
- La página de `33578` abre en **"Municipios · 02.- Albacete"**, y sus **87 códigos INE-5 = los 87
  municipios de Albacete**: la «cobertura de 87/8.132» de la v1 era, en efecto, **la provincia de
  Albacete de la familia**, no una carencia de la tabla.
- **MATIZ que simplifica todo:** para estas familias **también existe la variante `NAC-MUN`** (una sola
  tabla con **todos** los municipios de España):
  | Contenido | Familia `PROV-MUN` (por provincia) | **Variante `NAC-MUN` (nacional, todos)** |
  |---|---|---|
  | Sexo · municipios · edad (quinquenales) | 33576, 33584, 33645, …, 33758, …, 33866, … | **33570** (ya en producción) |
  | Sexo · municipios · nacionalidad (español/extranjero) · edad (grandes grupos) | 33577, 33587, … | **33571** |
  | Sexo · municipios · nacionalidad (principales nacionalidades) | 33578, 33588, 33658, … | **33572** |
  | Sexo · municipios · país de nacimiento | 33589, 33659, … | **33573** |
- **Recomendación**: para estos indicadores **NO construir un mapeo de 50 provincias**; usar la tabla
  `NAC-MUN` (cubre los 8.130 municipios en una sola consulta). Es exactamente el criterio que el
  proyecto ya aplicó con `33570`. (Si algún día se necesita el desglose provincial, el mapeo
  provincia→ID se deriva de `TABLAS_OPERACION/188`, pero no es necesario para la ficha municipal.)
- **`36780`**: sigue **NO municipal** — su `Codigo` es `NAC-CCAA-PROV` ("Población (españoles/
  extranjeros) por edad año a año y sexo"): nacional/CCAA/provincia, sin municipios. **Corrección v1 se
  mantiene.**
- **`1453`**: sigue **NO municipal** (solo `Comunidades y Ciudades Autónomas`). **Corrección v1 se mantiene.**

> ⚠️ Nota sobre la v1: la conclusión «33578 solo cubre 87 municipios → no apta» era **correcta como
> hecho** pero **incorrecta como decisión**, porque existía la hermana nacional `33572`. Corregido.

### Hallazgo 2 — Endpoint PC-Axis (`jaxi/Tabla.htm?tpx=`) para Censo Agrario y Nivel de estudios: **VIABLE**

La v2 reprobó la vía **equivocada**. El endpoint correcto es
**`https://www.ine.es/jaxi/Tabla.htm?tpx={ID}&L=0`** (formato **PC-Axis**, distinto del `jaxiT3`
JSON que usa el resto del proyecto). Verificación en vivo (2026-09-21):

| `tpx` | HTTP | Título real | Breadcrumb | ¿Municipal? |
|---|---|---|---|---|
| **52071** | 200 | *"Explotaciones por tipo de cultivo"* | Agricultura → Censo Agrario 2020 → *Resultados estructurales… municipios* | **Sí** ✅ |
| **55249** | 200 | *"Población por sexo, nacionalidad(española/extranjera) y nivel de estudios (agregado)"* | Cifras de población → Censo 2021 → Tablas predefinidas → Personas → *Resultados municipales* | **Sí** ✅ |
| **52076** | 200 | *"Explotaciones ganaderas por tipo de ganado"* (Bovinos/Ovino-caprino/Porcinos/Aves; Explotaciones, Cabezas, UGT) | Censo Agrario 2020 → municipios | **Sí** ✅ |
| **52081** | 200 | *"Jefes/as de las explotaciones por sexo"* (Personas, Edad media) | Censo Agrario 2020 → municipios | **Sí** ✅ |
| **52082** | 200 | *"Jefes/as de las explotaciones por nivel de formación agraria"* | Censo Agrario 2020 → municipios | **Sí** ✅ |

- **Conclusión**: `55249` (nivel de estudios Censo 2021) y `52071` (Censo Agrario, cultivos) están
  **confirmados como municipales y viables** con un **conector PC-Axis** específico. El «no verificable»
  de la v1 fue **puerta equivocada** (`jaxiTabla.htm` / `jaxiT3` → 404/204), no ausencia de fuente.
- **Pendiente real**: decidir la vía de
  **descarga masiva** (fichero PC-Axis `.px` / API **PxWeb** del INE) frente a consulta interactiva, para
  no hacer 8.130 peticiones; el Censo Agrario es **decenal** (2020), así que basta una descarga puntual
  completa. Sin escribir conector todavía.

### Hallazgo 3 — `37709` vs `37703`

Ambas tablas tienen **estructura de variables idéntica**: `Unidades territoriales` + `Índice de Gini y
Distribución de la renta P80/P20`. Son **dos miembros de la misma familia ADRH**, y en el mapa ya
verificado del proyecto (`src/lib/adrh-province-tables.json`): **`37703` = León** y **`37709` = Ourense**.
→ La diferencia **no es el indicador**, sino la **provincia** cubierta. ⚠️ El documento de Villarrobledo
es de **Albacete (02)**, cuya tabla ADRH es **`37678`**; por tanto el uso de 37703/37709 en ese documento
debe **revisarse** (probablemente una para el municipio y otra para comparativa, o un error del documento).

### Hallazgo 4 — AEAT renta bruta/disponible (EDM): **FUENTE CONFIRMADA**

- Operación **real y anual**: *Estadística de los declarantes del IRPF por municipios (EDM)*, AEAT
  (registros modelo 100 + 190).
- **Último: 2023** (publicado sep-2025); **2024 el 30/09/2026**. Ejercicio por ejercicio.
- **Cobertura**: municipios **> 1.000 habitantes** del **Territorio de Régimen Común** (excluye País
  Vasco y Navarra). Bajo umbral o forales → `pending`/`no disponible`, nunca 0.
- **Variables** (coinciden con la especificación): **Nº de declaraciones, Nº de titulares, RENTA BRUTA
  MEDIA, RENTA DISPONIBLE MEDIA**, y componentes.
- **Descarga estructurada**: existe página **«ANEXO: Descargas en formato Excel»** por año. Patrón:
  `https://sede.agenciatributaria.gob.es/AEAT/Contenidos_Comunes/La_Agencia_Tributaria/Estadisticas/Publicaciones/sites/irpfmunicipios/{AÑO}/home.html`
  (y variante `irpfmunicipios_ccaa`). Catálogo en datos.gob.es (`EA0028512`).
- **Advertencia ya presente en el proyecto y correcta**: renta **por declaración**, no por habitante/hogar.
- **Veredicto**: **VIABLE — prioridad alta** (bloque de Economía ya catalogado; solo faltaba confirmar el
  fichero, ya localizado como descarga Excel anual). **Plan sin ejecutar**: descargar XLSX del ejercicio,
  parsear por INE (ya hay `xlsx` en deps), cargar slugs `irpf_*` preservando Demografía; registrar en
  `data_sync_runs`. Anual.

### Hallazgo 5 — Presupuestos municipales (Hacienda): **FUENTE OFICIAL CONFIRMADA; viabilidad masiva por confirmar**

- Portal oficial **SGCIEF · Presupuestos Entidades Locales**
  (`https://serviciostelematicosext.hacienda.gob.es/sgcief/presupuestos/Publico`) — existe y es el
  recurso público de presupuestos/liquidaciones de EELL.
- También hay **descargas Excel por provincia** en la consulta de información impositiva municipal
  (`SGFAL/ConsultaTipos`: «Municipios de la provincia seleccionada (Excel)», «Todos los Municipios que
  han enviado Información (Excel)»).
- **Pendiente de verificar en fase de implementación**: si SGCIEF ofrece descarga **estructurada por
  `codigo_ine` para los 8.130** o solo consulta interactiva, y desde qué ejercicio hay serie. Hasta
  confirmarlo: **documental** (no se compromete carga).

### Hallazgo 6 — Fuentes informales (El País): **NO replicadas**

- **No se usará prensa** para gobierno local ni elecciones. Se **mantiene y amplía la fuente oficial ya
  construida**: **Infoelectoral / Ministerio del Interior** (`MIR_MUNI_202305`, elecciones 2023).
- Para **gobierno local vigente** (alcalde actual, no resultados), el objetivo oficial sigue siendo el
  **Registro de Entidades Locales (MPT)**; al no haber API nacional, permanece **bloqueado/fragmentado
  por CCAA** (ver §2.3).

---

## 1. Paso 0 — Inventario de lo YA construido (sistema real, no la especificación)

### Bloque 1 — Demografía · **CONSTRUIDO Y EN PRODUCCIÓN**

| Indicador | Fuente REAL | Tabla real | Estado |
|---|---|---|---|
| Población total / hombres / mujeres | INE DPOP op.22, tablas provinciales | 2854–2907 (50 tablas) | Cargado 8.130/8.132 |
| Evolución 1996→ | INE DPOP provincial `nult=12` | idem | Cargado |
| Pirámide edad/sexo | INE Padrón Continuo | **33570** (NAC-MUN) | Cargado (últ. 2022) |
| Comparativas CCAA / España | INE tabla nacional var.70 | **2853** | Cargado |
| Nacionalidad | INE Censo anual | **68535** | Cargado |
| País de nacimiento | INE Censo anual | **66322** | Cargado |
| Arraigo | INE Censo anual | **68540** | Cargado |
| Flujos migratorios | INE EMCR | **69711 / 69743 / 69746** | Cargado |
| Derivados (edad media, dependencia, envejecimiento, var. 5/10a) | cálculo SOCideas | — | Calculado |
| Densidad | — | — | **Bloqueado** (sin superficie municipal verificada) |
| Movilidad migratoria (capa lateral) | INE saldo migratorio | **69767** | **Apta** (auditoría 2026-09-11: 8.132/8.132); pendiente de carga |
| Nacionalidad por edad (vía alterna) | INE Padrón continuo | **33571/33572/33573** (NAC-MUN) | **Nuevo candidato v2** (hermanas nacionales de las `PROV-MUN`) |

### Bloque 2 — Político · **PARCIAL**

| Indicador | Fuente REAL | Tabla real | Estado |
|---|---|---|---|
| Elecciones municipales 2023 | Interior · Infoelectoral | `MIR_MUNI_202305` | Construido |
| Gobierno local vigente | — | — | **NO construido** (§2.3) |

### Bloque 3 — Económico · **CONSTRUIDO EN CÓDIGO/CATÁLOGO; carga nacional parcial**

| Indicador | Fuente REAL | Tabla real | Estado |
|---|---|---|---|
| Renta neta/bruta media (persona/hogar) | INE ADRH | tablas provinciales ADRH + **53688/53689** | Conector listo; carga pendiente |
| Gini y P80/P20 | INE ADRH | tabla gini provincial (p.ej. 37678 Albacete) | Conector listo; carga pendiente |
| IRPF declaraciones / renta bruta y disponible media | **AEAT EDM** | XLSX anual (`irpfmunicipios/{año}`) | **Fuente confirmada v2**; conector listo |
| Empresas (total/industria/constr./servicios/comercio) | INE DIRCE | **4721** | Conector verificado |
| Agrario (SAU, arable, leñosos, pastos, huertos, explotaciones) | INE Censo Agrario 2020 | **29006** (Tempus3) y **52071** (`jaxi/Tabla.htm?tpx=`, **viable v2**) | Conector listo |
| Ganadería / jefes por sexo / formación agraria | INE Censo Agrario 2020 | **52076 / 52081 / 52082** (`jaxi/Tabla.htm?tpx=`) | **VIABLE v3** (municipal) |
| Paro registrado | SEPE | XLS mensual nacional + por provincia | Conector implementado |
| Afiliación Seguridad Social | TGSS | `MuniMMAAAA.xlsx` | Conector implementado |
| Presupuestos / liquidaciones | Hacienda SGCIEF | portal EELL | **Fuente oficial confirmada v2**; descarga masiva por confirmar |
| Pobreza/desigualdad extra | — | — | Gini/P80 ADRH ya cubre; extra sin fuente homogénea |

### Bloques 4–7 · **NO CONSTRUIDOS** (placeholders en `socideas-xlsx.ts`)

Sociocultural (nivel educativo `55249` **viable v2**; centros educativos pendiente), Patrimonio/Turismo,
Infraestructuras, Asociaciones.

---

## 2. Paso 1 — Verificación EN VIVO (v2)

### 2.1 IDs del encargo — veredicto v2

| ID | ¿Existe? | Variables (Tempus3) | Veredicto v2 |
|---|---|---|---|
| **69767** | Sí | `Provincia y Municipio`, `Sexo`, `Tipo de saldo` | **Municipal**; cobertura 8.132/8.132 (auditoría). ⚠️ contradicción interna en código (nota obsoleta). Ver §2.2 |
| **33866** | Sí | `Sexo`, `Municipios`, `Edad (grupos quinquenales)` | **`PROV-MUN`** → provincia de familia; **usar hermana NAC-MUN `33570`** |
| **33758** | Sí | `Sexo`, `Municipios`, `Edad (grupos quinquenales)` | **`PROV-MUN`** → provincia; **usar `33570`** |
| **33577** | Sí | `Sexo`, `Municipios`, `Nacionalidad`, `Edad (grandes grupos)` | **`PROV-MUN`** → provincia; **usar `33571`** |
| **33578** | Sí | `Sexo`, `Municipios`, `Nacionalidad (principales nacionalidades)` | **`PROV-MUN`** (Albacete; 87 = municipios de Albacete); **usar `33572`** |
| **36780** | Sí | `CCAA y provincias`, `Españoles/Extranjeros`, `Edad`, `Sexo` | **`NAC-CCAA-PROV`** → **no municipal** (confirmado) |
| **1453** | Sí | **solo `Comunidades y Ciudades Autónomas`** | **No municipal** (confirmado) |
| **37709** | Sí | `Unidades territoriales`, `Gini/P80-P20` | **ADRH real** (prov. Ourense). Ver §0.1 Hallazgo 3 |
| **37703** | Sí | `Unidades territoriales`, `Gini/P80-P20` | **ADRH real** (prov. León). Misma familia que 37709 |
| **55249** | Sí (**PC-Axis**) | `Nacionalidad`, `Municipio de residencia`, `Sexo`, `Nivel de estudios`, `Unidades` | **VIABLE** vía `jaxi/Tabla.htm?tpx=55249` (Censo 2021, resultados municipales) |
| **52071** | Sí (**PC-Axis**) | `Ámbito territorial`, `SAU`, `Características básicas` | **VIABLE** vía `jaxi/Tabla.htm?tpx=52071` (Censo Agrario 2020, municipios) |
| **52076 / 52081 / 52082** | Sí (**PC-Axis**) | Ganadería / jefes por sexo / formación agraria | **VIABLE** vía `jaxi/Tabla.htm?tpx=` (Censo Agrario 2020, municipios) |
| **31934 / 31917** | Sí | **`Capitales y principales municipios`** | **Cobertura PARCIAL** (no 8.130) — corrección v1 se mantiene |
| 69711 / 33570 / 29006 (control) | Sí | Municipales | Correctos |

### 2.2 Contradicción interna sobre `69767` (a resolver antes de cargar)

El código dice «sin cobertura municipal verificada» (`FichaFiltros.tsx:231`, `socideas-export.ts:894`),
pero la auditoría 2026-09-11 y la verificación de hoy muestran variable municipal y cobertura total.
Además `69767` es un producto **distinto** de las EMCR ya cargadas (`69711/69743/69746`): es el
**saldo** (Total/Exterior/Interior). → Actualizar la nota obsoleta y decidir la carga en su fase.

### 2.3 Veredicto por área no construida (v2)

| Área | Fuente real verificada | Veredicto v2 |
|---|---|---|
| Gobierno local vigente | RER (MPT) web; CCAA (CyL/Andalucía/Euskadi/CLM) | **BLOQUEADO** nacional; fragmentado CCAA |
| Nacimientos/defunciones | INE 31934/31917 (capitales) | **BLOQUEADO/parcial** |
| Censo Agrario | INE 29006 + **52071/52076/52081/52082 (PC-Axis, viables)** | **VIABLE** (cultivos, ganadería, jefes) |
| Pobreza/desigualdad extra | Gini/P80 ADRH | **CUBIERTO PARCIAL** por Gini/P80 |
| Nivel de estudios | **55249 PC-Axis VIABLE** | **VIABLE** con conector PC-Axis |
| Centros educativos | Registro estatal (consultable) | **PARCIAL** (verificar export) |
| Sanidad/servicios sociales | 17 servicios CCAA | **BLOQUEADO** |
| Patrimonio cultural | Inventarios CCAA | **BLOQUEADO** |
| Alojamientos/demanda turística | EOH = puntos turísticos (no-INE); CCAA sí | **BLOQUEADO** nacional; viable CCAA |
| Banda ancha | **SETELECO XLSX municipal 2021-2025** | **VIABLE** ✅ |
| Viaria/ferrocarril/energía | MITECO/CNMC/REE | **PARCIAL/por verificar** |

---

## 3. Paso 2 — Reconciliación del esquema de trazabilidad (sin cambios en v2)

| Estado propuesto | Envelope v2 | Capa INE | Acción |
|---|---|---|---|
| `definitivo` | `estado_validacion="validado"` | `observed` | Sin cambio |
| `provisional` | (no existe) | (no existe) | Añadir `dimensiones.estado_dato="provisional"` |
| `estimado` | — | `derived=true` | Sin cambio |
| `no_disponible` | `partial`/ausente | `missing`/`not_available` | Sin cambio |
| `suprimido` | `null` (nunca 0) | `suppressed`+`null` | Sin cambio |

**No se modifica el formato v2** (tupla de 9; catálogos deduplicados; un JSON por municipio).

---

## 4. Paso 3 — Plan por fases (v2, sin ejecutar nada)

| Fase | Contenido | Fuente | Complejidad | Mantenimiento |
|---|---|---|---|---|
| **A1** | Renta AEAT (EDM) por declaración | AEAT XLSX anual | Media | Anual |
| **A2** | Banda ancha municipal | SETELECO XLSX | Baja | Anual |
| **A3** | Nivel de estudios Censo 2021 | INE `jaxi/Tabla.htm?tpx=55249` | Media (conector PC-Axis) | Decenal |
| **A4** | Censo Agrario (cultivos/ganadería) | INE `tpx=52071/52076/52081/52082` | Media | Decenal |
| **A5** | Movilidad migratoria | INE 69767 (capa lateral) | Media | Anual |
| **B1** | Carga nacional económica ya diseñada | ADRH+DIRCE+SEPE+TGSS | Alta | Mensual/Anual |
| **B2** | Nacionalidad/país nacimiento por edad (NAC-MUN) | INE 33571/33572/33573 | Baja | Anual |
| **C** | Presupuestos Hacienda (si descarga masiva viable) | SGCIEF | Media-Alta | Anual |
| **D** | Bloqueados (gobierno local, sanidad, patrimonio, turismo, asociaciones) | — | — | No planificar sin cambio de fuente |

Criterio: un bloque verificado → autorizado → cargado → auditado, y solo entonces el siguiente.

---

### 4.1 Fuentes de PRIORIDAD ALTA (siguiente fase, por `codigo_ine`)

Todas con fuente **verificada en vivo** y cobertura nacional estructurada. Orden recomendado por
relación valor/esfuerzo:

1. **AEAT IRPF municipal (EDM)** — renta bruta y disponible media por declaración. XLSX anual
   `irpfmunicipios/{año}`; 2023 vigente. Complementa (no sustituye) ADRH; umbral >1.000 hab. y régimen común.
2. **Censo Agrario 2020 PC-Axis** — `jaxi/Tabla.htm?tpx=52071` (cultivos), `52076` (ganadería),
   `52081` (jefes por sexo), `52082` (formación). Estructural/decenal; una descarga masiva puntual.
3. **Saldos migratorios `69767`** — municipal, 8.132/8.132; saldo total/exterior/interior; complementa
   `69711/69743/69746`.
4. **Nivel de estudios Censo 2021** — `jaxi/Tabla.htm?tpx=55249`, municipal; bloque sociocultural comparable.
5. **Banda ancha municipal SETELECO** — XLSX cobertura 2021-2025 con desglose municipal; mantenible.

### 4.2 Fuentes BLOQUEADAS (no abordar como bloque nacional)

| Fuente/bloque | Motivo |
|---|---|
| Gobierno local vigente (alcalde/partido) | Sin API nacional; RER (MPT) solo web; CCAA dispersas (17) |
| Nacimientos/defunciones (`31934/31917`) | Solo «Capitales y principales municipios»; no 8.130 |
| Recursos sanitarios/sociales | Sin registro estatal único; 17 servicios CCAA |
| Patrimonio cultural (BIC) | Inventarios por CCAA, sin capa nacional |
| Alojamientos/demanda turística | EOH municipal = «puntos turísticos» (no-INE); CCAA sí |
| Directorio asociativo | RNA expone solo «Fichero de Denominaciones» (nombres), sin directorio municipal |
| Presupuestos Hacienda (carga) | Fuente oficial, pero descarga masiva por `codigo_ine` sin confirmar |
| Viaria / ferrocarril / energía | MITECO/CNMC/REE sin dataset municipal unificado |

## 5. Identificadores de la especificación: incorrectos / no verificables (v2)

| ID | Veredicto v2 | Evidencia |
|---|---|---|
| **1453** | ❌ NO municipal (solo CCAA) | `GRUPOS_TABLA/1453` |
| **36780** | ❌ NO municipal (`NAC-CCAA-PROV`) | `GRUPOS_TABLA/36780` + `TABLAS_OPERACION/188` |
| **33578** | ⚠️ Municipal pero **es la tabla de Albacete** de una familia `PROV-MUN`; usar **33572** (NAC-MUN) | `jaxiT3` 33578 (02.- Albacete) + `TABLAS_OPERACION/188` |
| **33866 / 33758 / 33577** | ⚠️ **No incorrectos**: son miembros `PROV-MUN`; usar hermanas NAC-MUN **33570/33571** | `TABLAS_OPERACION/188` |
| **55249** | ✅ **VIABLE** (no incorrecto): usar `jaxi/Tabla.htm?tpx=55249` | live 2026-09-21 (200, Censo 2021 municipal) |
| **52071** | ✅ **VIABLE**: usar `jaxi/Tabla.htm?tpx=52071` | live 2026-09-21 (200, Censo Agrario municipal) |
| **52076 / 52081 / 52082** | ✅ **VIABLES** (no incorrectos): `jaxi/Tabla.htm?tpx=52076/52081/52082` | live 2026-09-21 (200, Censo Agrario 2020 municipal) |
| **69767** | ✅ No incorrecto (municipal, 8.132/8.132) | `GRUPOS_TABLA/69767` + auditoría |
| **37709 / 37703** | ✅ No incorrectos: ADRH Gini/P80 (provincias Ourense / León) | `GRUPOS_TABLA/*` + `adrh-province-tables.json` |
| **31934 / 31917** | ⚠️ Existen pero cobertura parcial (capitales) | `GRUPOS_TABLA/*` |

---

## 6. Tabla de bloques con «Evidencia de uso real (Villarrobledo)»

> Columna nueva pedida. Se marca **SÍ** cuando el patrón/fuente consta como usado en el documento de
> línea base de Villarrobledo (reconstruido y verificado en vivo); **NO** cuando es construcción del
> proyecto o fuente oficial aún no validada por uso real. *(No se copian valores de Villarrobledo.)*

| Bloque | Fuente / patrón | Evidencia real (Villarrobledo) |
|---|---|---|
| Demografía — padrón/provincia | DPOP 2854–2907 | SÍ (patrón clásico del equipo) |
| Demografía — pirámide | 33570 (NAC-MUN) | SÍ |
| Demografía — nacionalidad/edad | 33571/33572/33573 (NAC-MUN) | SÍ (vía familia provincial) |
| Demografía — migraciones | 69711/69743/69746 | SÍ |
| Político — elecciones | Infoelectoral `MIR_MUNI_202305` | **NO** (usaban prensa → **no replicar**) |
| Economía — renta ADRH | tablas provinciales ADRH | SÍ |
| Economía — Gini/P80 | ADRH (37678 Albacete) | SÍ |
| Economía — renta AEAT | `irpfmunicipios/{año}` XLSX | **SÍ** ✅ |
| Economía — empresas DIRCE | 4721 | SÍ |
| Economía — agrario | 29006 / **52071 (tpx)** | SÍ ✅ |
| Economía — ganadería / jefes | 52076/52081/52082 (tpx) | SÍ ✅ (confirmado técnicamente) |
| Sociocultural — nivel estudios | **55249 (tpx)** | **SÍ** ✅ |
| Sociocultural — centros educativos | registro estatal | NO |
| Turismo / patrimonio | EOH puntos turísticos / CCAA | SÍ (parcial) |
| Infraestructuras — banda ancha | SETELECO XLSX | NO (fuente oficial nueva) |
| Presupuestos | SGCIEF Hacienda | **SÍ** ✅ |
| Dispersión/otras | Hacienda SGFAL (`ConsultaTipos`) | SÍ |

> **Tabla de 51 filas literales: BLOQUEADA por ausencia de entrada** (ANEXO 1 no accesible; ver §0).
> Instrucciones para desbloquear en §0. Esta tabla por bloques cubre todo el
> sistema y ya incorpora la columna de evidencia real.

---

## 7. Confirmación explícita (v2)

```text
Hallazgo 1 (familias provinciales 33866/33758/33577/33578/36780):
  CONFIRMADO como familia para 33866/33758/33577/33578 (miembros PROV-MUN, uno por provincia).
  Recomendación: usar las hermanas NAC-MUN 33570/33571/33572/33573 (cubren los 8.130 en una tabla).
  36780: NO municipal (NAC-CCAA-PROV) -> se mantiene descartado.
  1453: NO municipal (solo CCAA) -> se mantiene descartado.

Hallazgo 2 (endpoint PC-Axis Censo Agrario/estudios):
  VIABLE por tabla. Endpoint correcto: https://www.ine.es/jaxi/Tabla.htm?tpx={ID}
    52071  -> 200, Censo Agrario 2020 (municipios)          VIABLE
    55249  -> 200, Censo 2021 nivel de estudios (municipios) VIABLE
    52076 -> 200, "Explotaciones ganaderas por tipo de ganado"    VIABLE
    52081 -> 200, "Jefes/as de explotaciones por sexo"            VIABLE
    52082 -> 200, "Jefes/as por nivel de formación agraria"       VIABLE
  => Los 4 PC-Axis del Censo Agrario + el de estudios: VIABLES.
  La v1 falló por puerta equivocada (jaxiTabla.htm / jaxiT3), no por ausencia de fuente.

Hallazgo 3 (37709 vs 37703):
  Diferencia = provincia (misma familia ADRH Gini/P80): 37703=León, 37709=Ourense.
  Albacete (Villarrobledo) = 37678. Revisar el uso en el documento.

Hallazgo 4 (AEAT renta bruta/disponible):
  FUENTE CONFIRMADA. XLSX anual (irpfmunicipios/{año}); 2023 vigente, 2024 el 30/09/2026.
  Municipios >1.000 hab. (régimen común). Variables: nº declaraciones, renta bruta media,
  renta disponible media. Plan propuesto sin ejecutar. Prioridad alta.

Hallazgo 5 (presupuestos Hacienda):
  FUENTE OFICIAL CONFIRMADA (SGCIEF Presupuestos EELL). Descarga masiva por codigo_ine
  PENDIENTE de confirmar. Hasta entonces: documental. Plan si aplica (anual).

Hallazgo 6 (fuentes informales El País):
  NO replicadas. Se mantiene/amplía la fuente oficial ya construida (Infoelectoral).

Tabla de 51 filas: BLOQUEADA por ausencia de entrada (ANEXO 1 no accesible al agente; ver §0). Tabla por bloques con columna de
  evidencia real: COMPLETA.

Carga de datos nueva ejecutada: NINGUNA.
```

## 8. Ceros de alcance

Cero escrituras R2. Cero escrituras Supabase. Cero migraciones. Cero cambios de XLSX. Cero cambios del
formato v2. Cero claves de producción modificadas. Cero datos de Villarrobledo usados como valores de
producción. Cero conectores escritos. Cero datos inventados.
