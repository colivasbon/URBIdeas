# SOCideas — Auditoría de selectores y gráficos interactivos

Fecha: 2026-09-06 · Rama: `feat/urbideas-premium-editorial-ui` (SHA base `92586f7`)
Regla: los filtros no crean datos. Solo “Disponible” lo verificado en envelope/JSON,
fuente integrada y serie trazable. Nada de documentos de línea base como cobertura.

## SECCIÓN 1 — Inventario de controles actuales

| Componente | Bloque | Control | Datos que filtra | Fuente | Período | Funciona | Reutilizable | Problema |
|---|---|---|---|---|---|---|---|---|
| `FichaFiltros` año (`f-anio`) | Demografía | Select año | Total/H/M del año | INE Tempus3 DPOP | Serie municipal | Sí | No (local) | Ninguno |
| `FichaFiltros` dato (`f-sexo`) | Demografía | Select total/H/M/comparar | Desagregación por sexo publicada | INE DPOP | Año ref. | Sí | No | Ninguno; no deduce (usa filas H/M reales) |
| `FichaFiltros` desde/hasta + Rangos 5/10/Todo | Demografía | Rango de serie | Evolución + comparativas | INE DPOP/CCAA70 | Serie | Sí | Parcial | Ninguno; rezago CCAA/España avisado |
| `FichaFiltros` comparar (checkboxes) | Demografía | Series visibles por ámbito | `population_total` por ámbito | INE DPOP/CCAA70 | Distinto por ámbito (2025 vs 2021) | Sí | Sí (patrón) | Periodos difieren: se etiquetan, no se igualan |
| `FichaFiltros` pir-año/modo | Demografía | Año y abs/% | `population_age_sex` | INE 33570 | Año pirámide | Sí | No | Ninguno; % calculado sobre total del mismo año |
| `FiltroTabla` (ConsultaTools) | Ambas | Texto + año + reset | Tabla visible ya cargada | La de la tabla | El de la tabla | Sí | Sí | Ninguno; local, sin fetch |
| `ComparadorPeriodos` | Ambas | Ninguno ( display ) | Último vs anterior | La de la serie | Años exactos | Sí | Sí | Ninguno; “No comparable” con base 0/nula |
| `Metodologia` + `FuenteOficial` | Ambas | Ninguno | — | — | — | Sí | Sí | Ninguno |
| Renta rail (chart) | Economía | Ninguno | Serie ADRH persona/hogar | INE ADRH | 2015–2023 efectivo | Sí | Sí | Falta Unidad visible en el rail (se añade en esta tarea) |
| `DescargasBloque` | Descargas | Ninguno | — | — | — | — | — | Sin filtros (correcto: índice de descarga) |
| `SeccionesMap` + página | Secciones | Botón “Cargar” bajo demanda | Geometría oficial | INE | Delimitación | Sí | No aplica | Sin filtros de indicador (no hay tabla por sección) |
| `ActualizacionMenu` | Interno | 3 acciones dry-run | — | — | — | Sí | No | Interno; fuera del sistema público de filtros |

Controles que parecen funcionar pero no filtran: **ninguno** (verificado uno a uno;
`ComparadorPeriodos` y `Metodologia` son informativos, no controles).

## SECCIÓN 2 — Matriz de dimensiones reales

Leyenda: Disponible / Parcial / Sin cobertura / Pendiente / No aplicable.

| Bloque | Familia | Ámbito | Período | Sexo | Edad | Nacionalidad | Nacimiento | Residencia | Sector | Fuente | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Demo | Población total | muni+prov+ccaa+esp | serie anual | — | — | — | — | — | N/A | INE DPOP/CCAA70 | Disponible (rezago ccaa/esp→2021) |
| Demo | Hombres / Mujeres | municipio (último año publicado) | corte (sin serie: sync guarda solo último) | Total/H/M del año | — | — | — | — | N/A | INE DPOP | Disponible; serie facetada: Sin cobertura |
| Demo | Evolución | municipio | serie anual | — | — | — | — | — | N/A | INE DPOP | Disponible |
| Demo | Edad y sexo | municipio | por año (pirámide) | H/M inherentes | tramos quinquenales publicados | — | — | — | N/A | INE 33570 | Disponible; grupos calculados (0-14/15-64/65+) documentados como derivados |
| Demo | Extranjería/migración/natalidad/educación | — | — | — | — | Sin cobertura | Sin cobertura | Sin cobertura | N/A | — | Sin cobertura (no usar etiquetas “nativa/extranjero”) |
| Eco | Renta ADRH (4) | municipio (+comparativas solo gini/p80) | serie 2015–2023 | — | — | — | — | — | N/A | INE ADRH | Disponible; AEAT es otra métrica (por declaración) |
| Eco | Renta AEAT (3) | municipio (>1000 hab., fiscal común) | ejercicio aportado | — | — | — | — | — | N/A | AEAT EDM | Parcial (requiere fichero); No aplicable fuera de ámbito |
| Eco | Gini / P80-P20 | muni+prov+ccaa+esp | serie 2015–2023 | — | — | — | — | — | N/A | INE ADRH | Disponible (≥100 hab.; secreto si no) |
| Eco | Empresas DIRCE | municipio | corte 2025 | — | — | — | — | — | Desglose real (industria/construcción/comercio/resto) | INE DIRCE | Disponible; serie temporal: Sin cobertura |
| Eco | Agrario/ganadería | municipio | 2020 estructural | — | — | — | — | — | Especie×medida, uso del suelo | Censo 2020 | Disponible; serie: Sin cobertura |
| Eco | Paro/afiliación/presupuestos | — | — | — | — | — | — | — | Pendiente (SEPE/TGSS) / Sin cobertura (finanzas) | — | Pendiente / Sin cobertura |

Sexo facetado en series: Sin cobertura (solo corte anual). Edad facetada fuera de
pirámide: Sin cobertura. Nacionalidad/nacimiento/residencia/sector-empleo: Sin cobertura.
Comparativas entre municipios, rankings, predicciones: Futuro (no implementar).

## SECCIÓN 3 — Gráficos y regresiones

| Gráfico | Componente | Datos | Fuente | Período | Controles | Estado | Regresión |
|---|---|---|---|---|---|---|---|
| Evolución población | `EvolutionChart` (+ tabla D2) | `population_evolution` + comparativas | INE DPOP/CCAA70 | Serie efectiva | Rango + checkboxes ámbito | OK | No |
| Pirámide | `PyramidChart` (+ tabla D3) | `population_age_sex` año | INE 33570 | Año pirámide | Año + abs/% | OK | No |
| Renta comparativa | `EvolutionChart` (+ tabla E1) | `renta_neta_media_persona/hogar` | INE ADRH | 2015–2023 efectivo | Ninguno aún (esta tarea: serie visible implícita) | OK desde `19564b8` | **Nunca existió antes**: búsqueda en `873a194/18f73fa/05222e2/957e174^/main` prueba que Renta solo tuvo cards+tabla; laguna, no borrado |
| Gini / P80-P20 | `EvolutionChart` ×2 | `gini`, `p80_p20` | INE ADRH | 2015–2023 | Ninguno | OK | No |
| Barras empresas/agrario | `Barras` (divs) | DIRCE / Censo | INE | Corte | Ninguno | OK (no es gráfico de serie) | No |

Renta: commit `19564b8`, archivo `EconomiaFicha.tsx`, `EvolutionChart series={rentaChartSeries}
id={renta-INE}`, series persona (`#86B73D`) + hogar (`#3E665C`, solo si ≥2 puntos),
condición `rentaNetaSerie.length >= 2`, causa de la ausencia histórica (nunca implementado),
restauración = bloque añadido en sección Renta con rail (título+fuente+período). Gap
restante: Unidad (€) no visible en el rail → se corrige en esta tarea.

## SECCIÓN 4 — Modelo común (implementar en `socideas-indicator-capabilities.ts`)

```ts
type SocideasDimension = 'scope'|'period'|'sex'|'age_group'|'nationality'|'birth_country'
  | 'birth_residence_relation'|'economic_sector'|'source'|'availability';
interface SocideasScopeOption { id: string; label: string; periods: number[]; }
interface SocideasIndicatorCapability {
  id: string; block: 'demografia'|'economia'; label: string; definition?: string;
  unit: 'personas'|'euros'|'porcentaje'|'ratio'|'indice'|'hectareas'|'empresas';
  source: string; sourceUrl?: string;
  kind: 'series' | 'snapshot';
  scopes: SocideasScopeOption[];   // solo ámbitos con valores reales y misma definición
  defaultScope: string;
  supportsChart: boolean;          // solo si ≥2 puntos comparables en algún ámbito
  comparisonNote?: string;         // p. ej. rezago CCAA/España 2021
  availability: 'available'|'partial'|'pending'|'without_coverage';
}
```

Constructor puro `buildCapabilities(perfilDemo?, perfilEco?)`: deriva TODO de valores
reales (`isRealValue`), nunca declara dimensiones sin filas. Reutilizable por ficha,
tablas, gráficos, descargas futuras, coropletas futuras y “Cómo funciona”.

## SECCIÓN 5 — Plan

P0: renta completa (unidad) + registro +，不存在 controles falsos (ninguno; verificado).
P1: `IndicatorExplorer` (indicador/período/ámbito/desagregación condicionales,
tabla+KPI+gráfico sincronizados, reset, URL validada `x_ind/x_desde/x_hasta/x_ambitos/x_anio`),
tooltips con unidad/fuente/estado, `aria-live`, sin fetch por interacción (useMemo, datos
ya cargados). P2: coropletas, descargas filtradas, comparativas entre municipios (no ahora).
