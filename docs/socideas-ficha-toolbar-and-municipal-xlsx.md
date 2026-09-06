# SOCideas — Barra operativa de ficha y libro XLSX municipal

Fecha: 2026-09-06 · Rama: `feat/urbideas-premium-editorial-ui`
Tarea nueva (no reutilizar el informe `eec5c78`): barra operativa en la misma fila que
las categorías + UN SOLO libro XLSX combinado por municipio + menú interno dry-run.

## 1. Barra operativa (misma fila que las categorías)

Ubicación: `src/app/socideas/[codigoINE]/page.tsx`, bloque que hoy contiene solo
`CategoryTabs` (Demografía · Economía · Secciones censales).

Desktop (fila única, sin envolver la jerarquía editorial):

```text
[Tabs izquierda] — [Resumen de datos disponibles] [Descargar XLSX] [Actualizar datos ▾]
```

- Izquierda: `CategoryTabs` tal cual (cápsula con scroll horizontal propio).
- Derecha: `FichaToolbar` (`src/components/socideas/FichaToolbar.tsx`, client):
  píldora de resumen (nº de tablas por bloque, con periodos en `title`),
  botón primario `Descargar XLSX` (enlace al API route, atributo `download`) y
  ranura para el menú interno (`children`; solo se rellena en entorno interno).
- Contenedor: `flex flex-col lg:flex-row lg:items-center lg:justify-between` con `gap`.
  La ficha sigue empezando por la cabecera editorial del municipio; la barra vive
  debajo del bloque de título, a la altura de las categorías.

Mobile:

- Tabs con scroll horizontal como están (`.ideas-tabs` ya tiene `overflow-x: auto`,
  `max-width: 100%`, `white-space: nowrap` en `.ideas-tab`).
- Debajo: resumen + botón XLSX + menú interno, en `flex-wrap` (nunca `nowrap`),
  sin `overflow-x` en la página. Verificación exigida: 390 px y 320 px sin scroll horizontal.

## 2. Libro XLSX municipal (UN SOLO libro por municipio)

Ruta: `GET /api/socideas/exportar/[codigoINE]` → `attachment` con nombre
`SOCideas_<Municipio>_<INE>_tablas.xlsx` (reutiliza `normalizarMunicipio`).
Acceso principal desde la cabecera de ficha (botón `Descargar XLSX`).
Las páginas `/descargas/demografia` y `/descargas/economia` se mantienen como vistas
detalladas (CSV por tabla + informe imprimible) y enlazan además al libro combinado.

Hojas (solo con filas reales; jamás hojas vacías ni datos inventados):

| Hoja | Contenido |
|---|---|
| `00_Resumen` | Marca, municipio, INE, fecha de generación, tablas incluidas (título, fuente, periodo, estado, nº filas), tablas NO incluidas con motivo, limitaciones (“la ausencia nunca equivale a 0”) |
| `01_Demografía` | Todas las tablas de `buildDemografiaTables` apiladas (título + fuente/periodo + cabecera + datos + fila de separación) |
| `02_Economía` | Todas las tablas de `buildEconomiaTables` apiladas, igual formato |
| `03_Secciones censales` | SOLO cuando existan datos reales (hoy: sin tabla cargada → no se crea; se documenta en `00_Resumen` como exclusión) |

Reglas de datos (heredadas de `socideas-export.ts`):

- Solo tablas con ≥1 fila real.
- `null`/ND/secreto estadístico → texto `ND`, NUNCA `0` (las celdas numéricas solo
  llevan número cuando `ExportCell.numeric` es finito; afirmado por test).
- Cada tabla conserva fuente y periodo en su subtítulo.
- Generación idempotente, sin escribir R2 ni Supabase, sin secretos, sin tokens.
- Lecturas: reutiliza `getPerfilDemografico`/`getPerfilEconomico` (la lectura R2 del
  envelope está deduplicada por `React.cache` en el mismo request; no se añade caché
  nueva ni se toca la existente).

## 3. Estética corporativa real (ExcelJS, server-only)

Verificación previa (2026-09-06, script node contra el repo): `xlsx@0.18.5` Community
PIERDE los estilos al escribir (celda leída de vuelta: `s:{patternType:none}`).
Por eso se añade **`exceljs@4.4.0` (MIT)** como dependencia de producción pero de uso
estrictamente servidor: solo la importan `src/lib/socideas-xlsx.ts` y el API route
(ningún Client Component). No entra en el bundle cliente (verificado tras el build:
ausencia de `exceljs` en `.next/static`).

Paleta (misma que el informe imprimible `DescargasBloque.tsx`):

- Cabecera: fondo verde mineral `#1E4D3F`, texto blanco, negrita.
- Título de bloque/hoja: banda `#1E4D3F` con marca `Ideas Sostenibilidad · SOCideas`.
- Filas alternas: blanco / `#EFF4F1`.
- Borde inferior fino `#CBD5D1` en cabeceras. Fuente `Calibri 11`.
- Sin degradados, sin macros, sin fórmulas ocultas, sin logos externos.

Formato por hoja de bloque:

- Fila 1: título del bloque (fusionada, banda corporativa). Fila 2: fuente global +
  periodo. Fila 3: `00`-style… no: por tabla apilada → fila de título de tabla,
  fila de meta (fuente · periodo · estado), fila de cabecera, filas de datos.
- `autoFilter` en cada cabecera de tabla. `freezePanes` bajo la primera cabecera
  (`ySplit` correspondiente). Anchos calculados por contenido (tope razonable).
- Formato numérico por cabecera: `#,##0` miles; `#,##0 "€"` si contiene `€`;
  `0.0" %"` si contiene `%`; `0` para `Año`. Años como número, ND como texto.

Prueba real del archivo: `scripts/verify-municipio-xlsx.ts` (tsx, sin tocar
infraestructura: datos sintéticos con casos null/secreto). Genera el `.xlsx` en
`tmp/`, lo relee con ExcelJS y afirma: hojas exactas, fill `FF1E4D3F` + fuente
blanca en cabeceras, `autoFilter` presente, vista `frozen`, formatos numéricos
presentes, cero celdas numéricas `0` donde el origen era null, exclusiones en
`00_Resumen`, firma ZIP `PK`. Salida `PASS/FAIL` literal para el informe.

## 4. Menú `Actualizar datos` (junto a Descargar XLSX)

Componente: `src/components/socideas/ActualizacionMenu.tsx` (client), renderizado
como `children` de `FichaToolbar`. Visible SOLO si
`NEXT_PUBLIC_SOCIDEAS_INTERNAL === "true"`; en caso contrario no renderiza nada
(ni botón ni marcador).

- Botón `Actualizar datos ▾` con `aria-haspopup="menu"`, `aria-expanded`, cierre con
  `Escape` y clic fuera, `role="menu"`/`menuitem`, foco visible.
- Acciones (alcance: municipio actual; Demografía y Economía nunca se mezclan):
  1. `Actualizar Demografía (dry-run)` → informativo: el endpoint de demografía no
     soporta dry-run; no se ejecuta fetch ni escritura (“disponible desde la
     herramienta interna autorizada”).
  2. `Actualizar Economía (dry-run)` → `POST /api/socideas/sync-economia/[INE]?dryRun=true`;
     muestra registros/estado; sin escrituras.
  3. `Comprobar provisionales` → endpoint con `provisional=true`; comunica la ausencia
     de fuente provisional de forma explícita; nunca sobrescribe el consolidado.
- Garantías: `dryRun=true` por defecto, escritura real deshabilitada y etiquetada
  (“No activada en esta versión”), cero tokens en cliente (el endpoint exige
  `x-sync-token` en servidor; sin él responde 401 y el menú lo comunica), no se finge
  actualización real.
- Los controles por bloque (`MunicipioDataActions`) se retiran de `EconomiaFicha` y
  `FichaFiltros` para no duplicar: el menú de cabecera es el único punto interno.

## 5. No tocar (verificado al final con `git status`/`git diff`)

R2, Supabase (esquema/migraciones/datos), APIs de datos existentes, parsers,
caché (`unstable_cache`/React cache), `main`, producción. Sin PR ni merge ni
despliegue manual. Push solo a `origin/feat/urbideas-premium-editorial-ui`.
