# SOCideas — Integración INE Tempus3 (Fase 2A)

Base: `https://servicios.ine.es/wstempus/js/ES/`. Sin clave API. Todas las
tablas/series siguientes se verificaron en vivo el 2026-09-03 antes de
codificar el adaptador (`src/lib/ine-tempus.ts`).

## 1. Operación DPOP (Id 22)

"Cifras Oficiales de Población de los Municipios Españoles: Revisión del
Padrón Municipal". Tablas provinciales `PROV-MUN` (1996→, último dato
definitivo 2025-01-01, unidad Personas, periodicidad anual):

| Provincia | Tabla | Estado |
|---|---|---|
| Albacete (02) | 2855 | Verificada (La Roda: DPOP367/368/369) |
| A Coruña (15) | 2868 | Tabla verificada en catálogo; series por validar en sync |
| Sevilla (41) | 2895 | Tabla verificada en catálogo; series por validar en sync |
| Zaragoza (50) | 2907 | Tabla verificada en catálogo; series por validar en sync |

Variables estables: 19 municipio (códigos INE de 5 dígitos, p. ej. `02069`;
**los filtros `tv` exigen el Id numérico del valor, no el código**: La Roda =
1629; `tv=19:02069` devuelve 500), 18 sexo (451 Total / 452 Hombres /
453 Mujeres), 115 provincia, 34 "Total habitantes", 3 Personas.
Patrón de consulta: `DATOS_TABLA/{tabla}?nult={N}&tip=AM&tv=19:{valorId}`.

Verificación La Roda (tabla 2855, 2025): Total 15.643 = 7.877 H + 7.766 M
(coherencia exacta exigida por el adaptador). 2024: 15.610.
La tabla incluye las 3 series agregadas de provincia (DPOP160-162 en
Albacete): sirven para la comparativa provincial sin peticiones extra.

## 2. Comparativas CCAA/España (tabla 2853, op. 22)

Variable 70 (verificada): Total Nacional = 16473; Andalucía = 8997;
Aragón = 8998; Galicia = 9008; Castilla-La Mancha = 9004.
Patrón: `DATOS_TABLA/2853?nult={N}&tip=AM&tv=70:{valorId}`.

## 3. Pirámide edad/sexo (tabla nacional 33570, op. 188 Padrón Continuo)

Grupos quinquenales (variable 360, códigos `Y0T4`…`Y95T99`) + `100+`
(variable 357, `Y-GE100`). Filtro `tv=19:{valorId}` verificado con La Roda
(1629): 69 series (23 tramos × 3 sexos), año 2022, Total 15.497 =
7.820 H + 7.677 M. **El Padrón Continuo termina en 2022**: la pirámide declara
su año y no se mezcla con el total 2025.

## 4. Mapeo a indicadores internos

| Indicador | Fuente | Detalle |
|---|---|---|
| `population_total|_male|_female` | DPOP provincial, último año | `dimensiones={ambito}` |
| `population_evolution` | DPOP provincial, `nult=12` | serie anual total |
| `population_age_sex` | 33570, `nult=1` | 46 filas (sexo × tramo) |
| `population_total` + `dimensiones.ambito=provincia\|ccaa\|espana` | DPOP prov. / 2853 | comparativas |
| `population_change_5y|_10y` | derivados | `(P_t−P_base)/P_base`; solo con ambos años |
| `population_density` | — | **pendiente** (sin superficie validada) |

Cada valor guarda `source_url` (consulta reproducible), `source_table_id`,
`source_series_id` (DPOPxxx/PCxxx) y `obtenido_en`.

## 5. Errores y cambios

Timeout 15 s + 1 reintento; HTTP no-2xx, JSON inválido, serie ausente, unidad
≠ Personas o H+M ≠ Total → error registrado en `data_sync_runs`, sin
persistir. `DATOS_SERIE/{id}` devolvió 404 en pruebas: el adaptador usa
`DATOS_TABLA` + `SERIES_TABLA` exclusivamente. Si el INE renumera tablas, el
sync falla con mensaje explícito (nunca datos de otra tabla: se valida el
código INE en los metadatos de cada serie).

## 6. Municipios de prueba

La Roda (02069, CLM) + tras autorización de migración: Santiago de
Compostela (15078, Galicia), Sevilla (41091, Andalucía), Zaragoza (50297,
Aragón). Existencia y códigos confirmados en `municipios`.
