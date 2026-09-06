# SOCideas — Auditoría de regresiones de tablas y exportación

Fecha: 2026-09-06 · Rama: `feat/urbideas-premium-editorial-ui` (SHA base `3394601`)
Método: solo lectura Git + lectura de código actual. Sin cambios de datos ni infra.

## 1. Gráfico comparativo de renta

### Búsqueda exhaustiva (resultado: NO existe ni existió en el historial)

| Búsqueda | Resultado |
|---|---|
| `git log -S "EvolutionChart" -- src/components/socideas` | Solo `873a194`, `c766a62`, `c8a0307` (creación del componente y usos gini/demografía) |
| `EconomiaFicha.tsx` en `873a194`, `18f73fa`, `05222e2`, `957e174^` y `main` | Siempre y solo: `giniSerie` + `p80Serie` con `EvolutionChart`; la sección Renta solo tuvo StatCards + `RentaTable` + nota |
| `git log -S "renta_neta"` | Parsers, descargas y reordenación; ningún commit añade/elimina un gráfico de renta |
| `main:src/components/socideas/EconomiaFicha.tsx` | Idéntico patrón: sin gráfico de renta |

**Último commit donde estaba presente: ninguno.** El gráfico comparativo de renta
nunca se renderizó en este repositorio. No hay commit anterior funcional que recuperar;
la "desaparición" no es un borrado: es una **laguna funcional** (la sección Renta tiene
serie homogénea ADRH 2015–2023 pero nunca tuvo su `EvolutionChart`, a diferencia de
Desigualdad que sí tiene Gini/P80-P20).

### Componente, props y datos para la restauración (reutilización, no reinvención)

- Componente exacto: `src/components/socideas/EvolutionChart.tsx` (SVG propio, sin
  dependencias, multiserie, leyenda en `figcaption`, `<title>` accesible por punto).
- Props: `series: SerieEvo[]` (`{clave, etiqueta, color, puntos:{anio,valor}[]}`) + `id`.
- Datos reales requeridos (ya alimentan `RentaTable`, sin tocar nada):
  `serie(valores, "renta_neta_media_persona")` y `serie(valores, "renta_neta_media_hogar")`
  (`EconomiaFicha.tsx`, helper `serie()` con `ambito === "municipio"`).
- Fuente: INE · ADRH (ambas series, homogéneas, euros). Período: años reales presentes
  (típicamente 2015–2023; se etiqueta el rango efectivo, nunca se interpola).
- Causa técnica de la ausencia: la sección Renta se diseñó solo con cards + tabla;
  el reordenamiento `957e174` la reescribió sin añadir el gráfico (ese commit, además,
  referenciaba `ConsultaTools`/`MunicipioDataActions` creados en commits posteriores,
  lo que explica la percepción de regresión tras la pasada de tablas).
- Cambio mínimo: bloque de gráfico en la sección Renta con `EvolutionChart`,
  series persona (principal) + hogar (secundaria, solo si también tiene ≥2 puntos),
  visible solo con ≥2 puntos reales comparables; oculto en caso contrario.
- Prueba P0: municipio real con serie ADRH (p. ej. La Roda `02069`) muestra tabla y
  gráfico con idéntica fuente/período; municipio de 1 punto no renderiza gráfico.

## 2. Tablas desproporcionadas

### Componentes afectados y reglas causantes

| Síntoma de la captura | Causa concreta |
|---|---|
| Primera columna (“Año”) excesivamente ancha | `.socideas-table__text` no se usaba en Año, pero `.socideas-table` es `width:100%` dentro de un shell a 7fr del workspace: con 2 columnas, Año absorbe todo el sobrante (no hay `width:1%` en Año; `__year` sí lo tiene pero la columna dato es `__numeric` sin tope y la tabla se estira al contenedor) |
| Tabla demasiado ancha (2 cols a ~50 % pantalla) | `TableWorkspace` 7fr/5fr + `socideas-workspace--bare{max-width:70%}`: para 2 columnas sigue siendo ~35 % de página; sin tope absoluto en px |
| Scroll interno prematuro (6 filas visibles con max-h-72) | `maxHeight="18rem"` incondicional en D2 (y 20rem en D3): fuerza scroll con pocas filas |
| Demasiado espacio vertical | Shell + bloque + workspace apilados con `mb-10` heredados más el rail vacío a la derecha |
| Mala relación tabla/gráfico | Grid 7fr/5fr fijo para cualquier contenido; sin variante 50/50 para renta ni tope 420–560 px para tablas de 2–3 columnas |

### Clasificación por tipo (base del sistema de densidades)

- Tabla con gráfico real (D2, D3): tabla estrecha a la izquierda + gráfico protagonista.
- Tabla sin gráfico (D1, E2): sin rail artificial; `max-width` absoluto, alineada a izquierda.
- Tabla de dos columnas (D2 con 1 ámbito): `compact-two-columns`, 420–560 px, Año 80–110 px.
- Tabla multicolumna (E1 renta): `wide`, `overflow-x-auto`, sin reducir tipografía.
- Tabla con series largas (D2 1996–2025, D3 21 tramos): `series`, filas 34–38 px,
  scroll interno solo con >11 filas, cabecera sticky solo entonces.

## 3. XLSX actual

- Flujo actual: botón `Descargar XLSX` (cabecera de ficha y páginas de descargas) →
  `GET /api/socideas/exportar/[codigoINE]` (`src/app/api/socideas/exportar/[codigoINE]/route.ts`).
- NO descarga ni proxifica ningún fichero INE: genera un libro propio con ExcelJS a
  partir de `buildDemografiaTables`/`buildEconomiaTables` (datos ya presentes en ficha).
- Estilo corporativo real existente: banda `#3E665C`, encabezados mineral/blanco,
  alternas, autofilter, freeze panes, formatos miles/€/%/año, ND como texto, cero ceros.
- Hojas: `00_Resumen`, `01_Demografía`, `02_Economía` (03 solo con datos reales: hoy ausente).
- Metadatos: por tabla (fuente, período, cobertura, estado) + trazabilidad en `00_Resumen`.
- Incumplimientos pendientes (esta tarea): `00_Resumen` sin Provincia/CCAA; tabla de
  trazabilidad sin columnas Bloque/Cobertura/Incluida/Observación; celdas numéricas con
  alineación por índice (Año queda a la izquierda); bloques vacíos omiten la hoja en vez
  de incluir mensaje + referencia a `00_Resumen`; falta batería de 3 municipios de prueba.
- Dependencia: `exceljs@4.4.0` (MIT), importada solo en `src/lib/socideas-xlsx.ts` y el
  endpoint (server-only; ausente en `.next/static`). `xlsx@0.18.5` queda como dependencia
  sin uso en exportación (verificado: pierde estilos al escribir).

## 5. Hallazgo verificado durante la implementación (solo lectura, sin tocar parsers)

El INE publica la desigualdad suprimida como `.` en el CSV
(`37727.csv`: `28143 Somosierra … Índice de Gini 2023 .`). Esa marca llega al
envelope como `0` literal (`valor_numerico=0`, `validado`), porque el parseo
convierte cadena vacía en `Number('') === 0`. Parsers y datos almacenados NO se
tocan en esta tarea. Tratamiento solo-lectura en presentación/exportación
(`isPublishableValue` en `socideas-availability.ts`): `gini`/`p80_p20` con valor
exacto `0` se tratan como secreto estadístico (ND + cobertura explícita), ya que
Gini ∈ (0,100] y P80/P20 ≥ 1 por construcción. Los ceros de conteos (pirámide)
sí son publicables y se conservan. La corrección del parser queda registrada
como trabajo futuro fuera de esta tarea.

## 4. Alcance seguro

Archivos a modificar: `EconomiaFicha.tsx` (gráfico renta), `globals.css` (solo bloque
`.socideas-*`), `DataTableShell.tsx` (prop densidad/max-width), `TableWorkspace.tsx`
(variante half), `FichaFiltros.tsx` (densidades + scroll condicional), `socideas-export.ts`
(campo bloque), `socideas-xlsx.ts` + endpoint exportar (columnas 00, provincia/CCAA,
mensaje de bloque vacío, alineación Año), `scripts/verify-municipio-xlsx.ts` (3 escenarios).
Datos que no se tocan: valores, fuentes, períodos, parsers, R2, Supabase, caché, sync,
hot update, CSV, navbar, rutas, semántica `table/thead/tbody/th/td`.
Riesgos: bajo (solo presentación + endpoint de lectura); el endpoint ya existe y se
extiende sin cambiar su contrato. Plan de prueba: tsc + eslint + build + verificación
XLSX de 3 archivos + humo de rutas 02003/02069/02081 en ambas categorías.
