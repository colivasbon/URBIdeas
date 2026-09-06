# SOCideas — Auditoría de diseño corporativo de tablas

Fecha: 2026-09-06 · Rama: `feat/urbideas-premium-editorial-ui`
Alcance: SOLO diseño de tablas y presentación. Sin cambios de datos, valores,
fuentes, períodos, lógica, parsers, R2, Supabase, APIs, caché, filtros, cálculos,
rutas, descargas, hot update, navbar ni producción. Sin dependencias nuevas.

Identidad obligatoria: `--company-primary:#3E665C`, `--company-secondary:#86B73D`,
`--company-alert:#FBE122`, `--company-dark:#3C403E`, `--company-light:#F1F1F1`,
Poppins, radio 6 px. Poppins ya es la fuente global (`globals.css:1,45`);
`--color-primary`/`--color-secondary` ya coinciden con la identidad: no se
introduce paleta nueva, se mapea la identidad a variables `--company-*`.

## 1. Inventario de tablas visibles

### 1.1 Demografía — `src/components/socideas/FichaFiltros.tsx`

| # | Tabla (id) | Componente | Cols | Tipos | Alineación actual (th / td) | Metadatos | Botones | Viz asociada | Problemas |
|---|---|---|---|---|---|---|---|---|---|
| D1 | `tabla-actual-{INE}` | Bloque 1, thead escrito a mano | 3 | Concepto (texto), Personas (entero), % (porcentaje) | th: Concepto left / Personas right / % right · td: igual (consistente) | h3 “Tabla del año X” sin fuente ni periodo en línea | Copiar | No | Sin `scope="col"`; thead minúsculo (11 px uppercase); sin barra Fuente·Período·Estado; % del Total muestra “—” como dato |
| D2 | `tabla-evo-{INE}` | Bloque 2, a la derecha del gráfico | 2–5 | Año + 1–4 ámbitos (enteros) | th: Año left / ámbitos right · td: Año left / ámbitos right (consistente pero Año no centrado) | Sin título propio ni meta (solo h3 “Tabla anual por ámbito” + copiar) | Copiar | Sí, `EvolutionChart` a la IZQUIERDA (tabla 2/5 derecha) | Sin `scope`; thead minúsculo; Año como texto; gráfico y tabla no comparten título/fuente/periodo visibles; orden invertido respecto a pauta (tabla primero) |
| D3 | `tabla-pir-{INE}` | Bloque 3, a la derecha del gráfico | 3 | Edad (texto), H, M (enteros o %) | Igual que D2 | h3 + copiar; nota de fuente en párrafo suelto | Copiar | Sí, `PyramidChart` a la IZQUIERDA | Igual que D2; cabecera “H %/M %” cambia según modo sin norma de formato |

### 1.2 Economía — `src/components/socideas/EconomiaFicha.tsx`

| # | Tabla (id) | Componente | Cols | Tipos | Alineación actual | Metadatos | Botones | Viz asociada | Problemas |
|---|---|---|---|---|---|---|---|---|---|
| E1 | `tabla-renta-{INE}` (`RentaTable`) | Sección Renta | 2–7 | Año + hasta 6 numéricas (€/conteo) | th: Año left (sin clase) / resto `text-right` · td: igual (consistente, Año no centrado) | h3 con fuente abreviada + rango + copiar + fuente oficial | Copiar, Consultar fuente | No (el `ComparadorPeriodos` vive en Herramientas, separado) | Sin `scope`; thead minúsculo; 7 columnas a ancho completo sin workspace; mezcla € y conteos con el mismo tratamiento visual |
| E2 | `tabla-gan-{INE}` | Sección Ganadería | 3 | Especie (texto), Explotaciones/Cabezas (enteros, ND posible) | th: Especie left / resto right · td: igual (consistente) | Sin título/meta propios (caption sr-only + copiar + fuente) | Copiar, Consultar fuente | No | Sin `scope`; ND correcto como texto (mantener); tabla estrecha estirada a ancho completo |

### 1.3 Descargas — `src/components/socideas/DescargasBloque.tsx`

| # | Tabla | Componente | Cols | Tipos | Alineación actual | Metadatos | Botones | Viz | Problemas |
|---|---|---|---|---|---|---|---|---|---|
| X1 | Tablas dinámicas `#tabla-{id}` (hasta 10 por página) | `article.premium-card` por tabla | 2–7 | Primera texto, resto numérico | th y td: primera left, resto right (consistente, generado por código) | h2 + línea “N filas · Fuente · Periodo · Cobertura · Estado” (12 px, correcta pero sin badge unificado) | Ver tabla (ancla), Descargar CSV | Informe imprimible aparte | Sin `scope="col"`; thead minúsculo heredado de `.ideas-table`; botones con dos estilos (primario + secundario) y radio 12 px |

### 1.4 Fuera de alcance (no se migran)

- `Traceability.tsx` (lista `dl`, no tabla), `Barras` (divs con `role="img"`), gráficos
  (`EvolutionChart`, `PyramidChart` — SVG existentes, no se tocan), tabla de fuentes de
  `/socideas/como-funciona` (página documental, se deja como está), StatCards/KPIs
  (no son tablas).

## 2. Problemas transversales detectados

1. Alineación globalmente consistente por tabla, pero Año como texto a la izquierda
   (D2, D3, E1) en vez de centrado; ninguna norma compartida.
2. Thead de `.ideas-table` (`globals.css:572`): 11 px uppercase, color muted, sin fondo
   corporativo → no parece encabezado empresarial; ilegible como “fuente de un vistazo”.
3. Metadatos (fuente/período) en texto 12 px suelto o ausente (D2 sin meta; E2 sin título
   visible); sin “metadata rail” común.
4. Botones de tabla con radio 12 px (`rounded-xl`) y alturas dispares; dos patrones
   conviviendo en X1.
5. Sin `scope="col"` en D1–D3, E1–E2, X1 (solo `caption` sr-only en E2).
6. Tablas estrechas (E2, D1) estiradas a ancho completo; tablas anchas (E1) sin zona
   editorial; ningún layout tabla+visualización compartido.
7. Espaciado entre bloques correcto (`mb-10` = 40 px) pero título→meta→tabla→nota con
   separaciones ad-hoc por sección.
8. `.ideas-table thead th:last-child` sin padding derecho y `tbody td` con padding
   asimétrico → cifras pegadas al borde en scroll.
9. `%` y `€` con convenciones distintas por componente (sufijo con/sin espacio);
   “—” usado como contenido de celda en D1 (regla nueva: ausencia explicada, no guion).
10. Modo claro/oscuro heredado por variables: correcto, pero el encabezado mineral debe
    verificarse en ambos (blanco sobre `#3E665C` contrasta en los dos).

## 3. Componentes candidatos a unificar (propuesta aprobada para Fase B)

| Componente | Ruta | Responsabilidad |
|---|---|---|
| `DataTableShell` | `src/components/socideas/DataTableShell.tsx` | Superficie 6 px, título + toolbar, meta, scroll-x, tabla, nota; ritmo vertical |
| `DataTableMeta` | mismo archivo o propio | Línea `Fuente · Período · Cobertura · Estado` ≥12/13 px + badge |
| `DataTableToolbar` | `src/components/socideas/DataTableToolbar.tsx` | Copiar + fuente oficial + CSV (solo si existe la acción), misma altura/radio |
| `DataStatusBadge` | `src/components/socideas/DataStatusBadge.tsx` | 8 estados unificados, sin amarillo salvo alerta ni rojo salvo error |
| `TableWorkspace` | `src/components/socideas/TableWorkspace.tsx` | Grid tabla (64–70 %) + rail (30–36 %) en ≥1280 px; apilado debajo |
| `EmptyState` tabla | dentro del shell | Ausencia explicada, nunca “—” como único contenido |

`CopyTableButton` y `FuenteOficial` se conservan (comportamiento intacto) y se
reestilizan a patrón compacto 6 px. `Metodologia` (`details`) se conserva como nota.

## 4. Propuesta de tokens CSS (Fase B/C, solo tablas SOCideas)

```css
--company-primary:#3E665C; --company-secondary:#86B73D; --company-alert:#FBE122;
--company-dark:#3C403E; --company-light:#F1F1F1;
--company-font:'Poppins',sans-serif; --company-radius:6px;
--soc-table-row-h:42px;            /* 38–44 desktop, 40–46 móvil */
--soc-table-fs:0.8125rem;          /* 13 px desktop, 12 px móvil */
--soc-table-pad-x:14px;            /* 12–16 desktop, 10–12 móvil */
--soc-table-head-fs:0.75rem;       /* 12 px, weight 600, sin uppercase abusivo */
```

- Encabezado: fondo `#3E665C` (ambos temas), texto blanco, borde inferior 2 px
  `#86B73D`, radio superior 6 px (wrapper con `overflow` + scroll-x).
- Filas: base superficie tema / alterna mineral 5 % (`color-mix`), hairline sutil,
  sin bordes verticales, sin hover decorativo (tablas informativas).
- Alineación: `.socideas-table__text` izquierda · `__year` centro nowrap `width:1%` ·
  `__numeric` derecha + `tabular-nums` nowrap · `__status` centro · `__action` derecha.
  El `th` usa SIEMPRE la misma clase que sus `td`.
- `table-layout:auto`; primera columna flexible con `font-weight:500/600` y wrap
  controlado; año/estado/cifra corta a contenido; `min-width` solo donde preserve
  lectura; `overflow-x:auto` en móvil antes que reducir bajo 11 px.
- Meta ≥12 px móvil / 13 px escritorio; badge con punto + texto (nunca solo color);
  foco visible 2 px `#86B73D`; `prefers-reduced-motion` sin transiciones.
-ailability: `scope="col"` en todos los `th`, captions existentes preservados,
  “—” como único contenido sustituido por ausencia explicada (`ND` con nota o texto).

## 5. Workspaces previstos (Fase D, sin gráficos nuevos)

| Tabla | Visual real existente | Workspace |
|---|---|---|
| D2 evolución | `EvolutionChart` | Sí (tabla izq. + gráfico der., comparten título/fuente/periodo/estado) |
| D3 pirámide | `PyramidChart` | Sí (igual) |
| D1 población año | No | Sí sin rail (tabla estrecha, respiro editorial en xl) |
| E1 renta | No (comparador vive en Herramientas) | No (7 columnas; ancho completo con scroll) |
| E2 ganadería | No | Sí sin rail (3 columnas) |
| X1 descargas | No (informe aparte) | No (índice denso a ancho completo) |

Futuros gráficos (registro, NO implementar): evolución de población, pirámide,
evolución de renta (serie ADRH disponible y comparable), Gini/P80-P20 (series
2015–2023 disponibles), distribución sectorial (DIRCE puntual, no serie), paro
(SEPE pendiente → no comparable), estructura agraria (Censo 2020 puntual, no serie).
