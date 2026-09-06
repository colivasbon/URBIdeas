# Auditoría y sistema visual premium — URBIdeas / SOCideas

Rama base: `feat/socideas-economia-phase-2c` (HEAD `cf5c3d2`).
Rama de trabajo: `feat/urbideas-premium-editorial-ui`.
Fecha: 2026-09-06.
Alcance: solo visual/editorial. No se altera contrato R2, parsers, `unstable_cache`,
tags `socideas-muni-{codigoINE}`, revalidación selectiva, endpoint `SOCIDEAS_SYNC_TOKEN`,
lógica de selector/overlay, carga bajo demanda de secciones, migraciones ni datos.

Marca obligatoria: "Ideas Medioambientales" / "IDEAS Sostenibilidad · Área de
Sostenibilidad de Ideas Medioambientales". Verificado: no existe ninguna ocurrencia
de "Territorio vivo" en el repo (búsqueda literal sin resultados).

## 1. Inventario de páginas y componentes afectados

### 1.1 Rutas

| Ruta | Archivo | Header/Footer | Notas |
|---|---|---|---|
| `/` | `src/app/page.tsx` | `PlatformHeader` / `PlatformFooter` | Hero centrado, 3 `ModuleCard`, bloque corporativo |
| `/urbideas` | `src/app/urbideas/page.tsx` | `UrbideasHeader` / `PlatformFooter` | Único con `HeroParallax` + barra `#stats-bar` + índice 01–04 |
| `/socideas` | `src/app/socideas/page.tsx` | `PlatformHeader` / `PlatformFooter` | Cabecera simple + `SocideasSearch` + bloque fuentes + enlaces |
| `/socideas/[codigoINE]` | `src/app/socideas/[codigoINE]/page.tsx` | `PlatformHeader` / `PlatformFooter` | Migas, H1 municipal, frescura, `CategoryTabs`, `FichaFiltros` o `EconomiaFicha` |
| `/socideas/[codigoINE]/secciones-censales` | `src/app/socideas/[codigoINE]/secciones-censales/page.tsx` | `PlatformHeader` / `PlatformFooter` | Migas de 3 niveles + `SeccionesMap` (idle → cargar → ok/error) |
| `/asistencias` | `src/app/asistencias/page.tsx` | `PlatformHeader` / `PlatformFooter` | Lista de 5 líneas "Próximamente" |
| `/urbideas/municipios` | `src/app/urbideas/municipios/page.tsx` | `UrbideasHeader` / `layout/Footer` | Sidebar filtros + mapa + planeamiento + normativa + capas + comparativa |
| `/urbideas/mapa` | `src/app/urbideas/mapa/page.tsx` | `UrbideasHeader` (client) | Visor Leaflet completo, el más pesado |
| `/urbideas/legislacion` | `src/app/urbideas/legislacion/page.tsx` | `UrbideasHeader` | Client, filtros normativos |
| `/urbideas/api-docs` | `src/app/urbideas/api-docs/page.tsx` | `UrbideasHeader` | Client, documentación |
| `/urbideas/municipios/[codigoINE]/legislacion` | `src/app/urbideas/municipios/[codigoINE]/legislacion/page.tsx` | `UrbideasHeader` | Client, ficha normativa |
| `/admin` | `src/app/admin/page.tsx` | sin header plataforma | Client, interno |
| Layout raíz | `src/app/layout.tsx` | `ThemeProvider` | Metadata IDEAS Sostenibilidad, `suppressHydrationWarning` |

### 1.2 Componentes

- Navegación: `platform/PlatformHeader`, `platform/UrbideasHeader`,
  `platform/PlatformFooter`, `layout/Header` (legacy rutas sin prefijo),
  `layout/Footer` (legacy, solo `/urbideas/municipios` lo usa aún).
- Plataforma: `platform/ModuleCard` (home).
- UI base: `ui/Button` (5 variantes, 3 tamaños), `ui/Card` (+ `CardHeader/Title`),
  `ui/Badge`, `ui/Input`, `ui/Select`, `ui/Modal`, `ui/ThemeToggle`,
  `ui/ThemeProvider`, `ui/HeroParallax` (existente, solo URBideas).
- SOCideas: `socideas/SocideasSearch` (cascada CCAA→prov→muni + búsqueda libre +
  `MunicipioLoadingOverlay`), `socideas/CategoryTabs` (Demografía/Economía +
  enlace Secciones), `socideas/FichaFiltros` (~650 líneas, demografía completa),
  `socideas/EconomiaFicha` (~465 líneas, 5 bloques + pendientes),
  `socideas/StatCard` (KPI), `socideas/EvolutionChart` (SVG propio),
  `socideas/PyramidChart`, `socideas/SeccionesMap` (Leaflet lazy),
  `socideas/Traceability`, `socideas/StatusCard`, `socideas/CopyTableButton`,
  `socideas/MunicipioLoadingOverlay`.
- URBideas datos/mapa/filtros: `datos/*` (`TarjetaMunicipio`, `TablaPlaneamiento`,
  `TablaComparativa`, `MunicipalTab`), `mapa/*` (10 ficheros Leaflet/react-leaflet),
  `filtros/*` (`FiltroCascada`, `SelectorMultiMunicipio`, `BuscadorTextoLibre`).

## 2. Sistema visual actual

### Colores (`src/app/globals.css` `:root`)

- Primario verde profundo: `#3E665C` / light `#4A7A6F` / dark `#2E4F47`.
- Secundario verde mineral: `#86B73D` / light `#9AC94E` / dark `#6F9A2E`.
- Acento ámbar: `#E8C547` / light `#F0D060` / dark `#C9A83A`.
- Semánticos: error `#C44545`, success `#3D9B6A`, info `#4A7AB5`, warning `#C49A30`.
- Tema por defecto OSCURO: bg `#1A1D1B`, elevado `#222523`, superficie `#282B29`,
  texto `#EAEAE8` / `#A0A2A0` / `#6E706E`, borde `#303330` / sutil `#262926`,
  card `#222523`, input `#1E211F` (+hover `#282B29`), overlay `rgba(10,12,10,.75)`.
- Tema claro vía `[data-theme="light"]`: bg `#F5F6F4`, card `#FFFFFF`,
  texto `#1A1C1A` / `#505250` / `#8A8C8A`, bordes `#D8DAD6/#C8CAC6`.
- Sombras oscuras fuertes (`0 16px 48px rgba(0,0,0,.5)`); en claro, suaves.
- Problema de fondo: la tarea pide fondo base marfil/blanco mineral y tinta noche;
  hoy el defecto es dark. No se puede invertir el defecto sin cambiar comportamiento;
  la estrategia será refinar ambos temas y reservar el editorial claro para heroes
  y `PageShell` sin forzar dark-mode nuevo.

### Tipografías

- Única familia: `Poppins` (Google Fonts `@import`) + fallback sistema.
  Pesos 300–700. Sin serif editorial. `tracking-tight/tighter`, titulares
  `text-3xl→5xl`, eyebrow `text-xs uppercase tracking-[0.2–0.25em]`.
- Carencia: no hay tipografía editorial para grandes titulares; UI/tablas usan la
  misma Poppins, correcta pero sin contraste editorial.

### Espaciado / radios / layout

- Contenedor: `max-w-7xl`, `px-4 sm:px-6 lg:px-8`, `py-10/14/20` en landing,
  `py-8/10` en herramientas. Grid editorial solo parcial (home 3 cols,
  URBideas índice 2 cols con números 01–04).
- Radios: `--border-radius 8px`, `lg 12px`, `xl 16px`; pills `999px` en tabs.
- Herramientas densas (`FichaFiltros`, municipios) ya compactan bien; landing
  respira. Ficha SOCideas usa `mb-10` entre bloques, correcto.

### Cards / botones / navegación / estados

- Cards: `bg-card + border-subtle + rounded-lg/xl`, `p-5/6`. `ModuleCard` y
  `StatCard` bien; `StatCard` es la KPI canónica (etiqueta uppercase + valor
  `2xl/3xl tabular-nums` + detalle). `Card hover` hace `translateY(-2px)` aprox
  (`-translate-y-0.5`), dentro del límite permitido.
- Botones: primario verde `#3E665C` + secundario lima + acento ámbar + ghost +
  danger; `rounded-lg/xl`, `min-h 32–44px`, `active:scale-[0.97]`, focus ring 2px.
  Existen además clases legacy `.ideas-btn-primary` y tabs `.ideas-tabs/.ideas-tab`.
- Navegación: sticky `h-14/16`, `backdrop-blur-xl`, active = pill `input-bg` +
  subrayado `w-4 secondary`. `UrbideasHeader` añade `border-b-2 secondary` y modo
  compacto a 48px de scroll; `PlatformHeader` no compacta. Móvil: overlay + panel
  `animate-slide-in-down`; URBideas cierra con Escape, plataforma no.
- Estados: `.ideas-status` (ok/partial/pending dashed/error) + badge uppercase;
  `.ideas-table` (scroll-x, `tabular-nums`); overlay municipal (`absolute inset-0`,
  spinner + mensaje lento a 3.5s); secciones idle/cargando/ok/error; skeletons
  ad-hoc (spinners `border-t-transparent`) sin componente unificado; errores con
  `role=alert/status` correctos.

## 3. Qué se puede reutilizar (sin romper)

- Tokens CSS existentes como base (renombrar/añadir, no eliminar).
- `StatCard`, `StatusCard`, `Traceability`, `EvolutionChart/PyramidChart` (SVG sin
  dependencias), `CopyTableButton`, `CategoryTabs` (evolucionar a variante premium).
- `SocideasSearch` + `MunicipioLoadingOverlay` (solo re-skin).
- `SeccionesMap` (carga bajo demanda intacta; solo re-skin de paneles).
- `HeroParallax` (base del nuevo `EditorialParallaxHero`; ya usa rAF + passive +
  respeta reduced-motion parcialmente).
- `PlatformHeader/Footer`, `UrbideasHeader` (refinar, no reescribir).
- `.ideas-section/.ideas-h2/.ideas-eyebrow/.ideas-table/.ideas-tabs` como punto de
  partida del sistema editorial.
- Leaflet/react-leaflet, Supabase SSR, `unstable_cache`: intocables.

## 4. Inconsistencias visuales detectadas

1. Doble sistema de footers/headers: `PlatformFooter` vs `layout/Footer`
   (`/urbideas/municipios` usa el legacy con copy "Registro Urbanístico España v1.0").
2. Home sin parallax; solo `/urbideas` lo tiene. `/socideas` y `/` con cabeceras planas.
3. `ModuleCard` badge inline vs `ideas-tag` ámbar en Economía: dos lenguajes de etiqueta.
4. Tablas: `FichaFiltros` usa clases ad-hoc (`w-auto min-w-[16rem]`) mientras Economía
   usa `.ideas-table`. Encabezados y sticky no unificados.
5. H2: `text-lg` en demografía vs `.ideas-h2` (`1.125rem`) en economía vs `text-xl`
   en índice URBideas. Eyebrows con `w-12/w-8` y tracking `0.2/0.25em` mezclados.
6. Overlay usa `bg-[var(--color-bg)]` (variable inexistente → cae a transparente);
   debe ser `dark-bg`.
7. Tema oscuro por defecto choca con el objetivo "marfil frío"; el light existe pero
   no es el defecto y el toggle persiste en `localStorage`.
8. `UrbideasHeader` compacta con scroll; `PlatformHeader` no. Menú móvil con Escape
   solo en URBideas.
9. Skeletons inexistentes como sistema; cada vista improvisa spinners/textos.
10. Decoración hero solo retícula verde (`#4A5E42`, opacidad 0.2) sin variantes por
    producto (URB/SOC/sostenibilidad).
11. Contraste lima `#86B73D` sobre oscuro OK para texto grande; en texto pequeño
    (`text-xs`) al límite: reservarlo a eyebrow/bold, no a párrafos.

## 5. Client Components y riesgos de bundle

43 directivas `"use client"` (ver `grep`). Mapa de riesgo:

- Alto peso / lazy necesario: `mapa/*` (Leaflet + react-leaflet + turf),
  `SeccionesMap` (import dinámico de `leaflet` + CSS solo tras clic — BIEN),
  `urbideas/mapa/page`, `urbideas/municipios/page` (dynamic `MunicipioMapa`
  con `ssr:false` — BIEN).
- Medio: `FichaFiltros`, `EconomiaFicha` (lógica local, sin fetch; memoizado en
  demografía — BIEN; no convertir en server).
- Ligero pero numeroso: headers, `SocideasSearch`, `CategoryTabs`,
  `ThemeProvider/Toggle`, `HeroParallax`, `Button/Input/Select/Modal`.
- Regla: ningún componente editorial nuevo será client salvo `EditorialParallaxHero`
  (scroll rAF) y estados interactivos ya existentes. Nada de librerías nuevas.
  Vigilar que `page.tsx` de `/socideas/[codigoINE]` siga siendo server y que solo
  una categoría se monte (`categoria === "economia" ? ... : ...` — mantener).

## 6. Plan de diseño por página

- `/`: hero editorial con parallax sutil + propuesta de valor + 3 entradas
  diferenciadas (URB/SOC/asistencias) + franja Ideas Medioambientales. Sin métricas
  inventadas (las 3 cifras actuales son descriptivas: 8.130 fichas, fuentes, 2+1
  módulos — se mantienen o se etiquetan como cobertura, no como KPI de éxito).
- `/urbideas`: conservar `HeroParallax` evolucionado + `#stats-bar` real de Supabase
  + índice 01–04 refinado. Acento territorial verde profundo.
- `/socideas`: hero sobrio propio + buscador como protagonista jerárquico
  (cascada + búsqueda libre en `PageShell` elevado) + bloque fuentes creíble sin
  saturar. Acento lima contenido + cobre para economía.
- `/socideas/[codigoINE]`: cabecera con jerarquía municipio→provincia→CCAA→INE +
  píldora de frescura + tabs refinadas (única categoría montada) + bloques como
  informe ejecutivo (KPI → tabla → gráfico → nota). Sin parallax en cuerpo.
- `/socideas/.../secciones-censales`: misma cabecera + panel idle premium con CTA
  "Cargar", sin prefetch.
- Economía/Demografía: informe ejecutivo: visión general (5 `DataCard`) → renta →
  desigualdad (gráficos SVG) → empresas (barras) → agrario/ganadería (tag
  "Estructural · 2020") → pendientes → `SourcePill`/trazabilidad.
- `/urbideas/*` derivadas: mismo shell, acento propio leve, tablas/mapás sin motion.
- `/asistencias`: lista editorial "Próximamente" coherente.
- Header/footer/estados: ver Fase B.

## 7. Propuesta de tokens CSS (a implementar en Fase B)

```css
/* Editorial premium —Variables a añadir en globals.css (nombres nuevos, sin borrar) */
--paper: #FAF8F3;            /* marfil frío (superficies editoriales claras) */
--ink: #10201C;              /* azul noche / verde profundísimo */
--ink-2: #33403C;            /* tinta secundaria */
--mineral: #3E665C;          /* verde mineral (sostenibilidad, primario) */
--mineral-soft: #E3ECE8;     /* velo mineral para fondos claros */
--teal-muted: #5E8A7D;       /* turquesa apagado */
--sand: #C9A227;             /* arena/cobre énfasis (eco de --color-accent) */
--sand-soft: #F4EAD0;
--line: color-mix(in srgb, currentColor 12%, transparent); /* bordes bajo contraste */
--shadow-xs: 0 1px 2px rgba(16,32,28,.06);
--shadow-sm: 0 1px 3px rgba(16,32,28,.08);
--shadow-md: 0 8px 24px rgba(16,32,28,.10);
--radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 999px;
--font-display: "Fraunces", Georgia, "Times New Roman", serif; /* o Georgia si offline */
--font-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; /* Poppins solo titulares legacy */
--space-section: clamp(3rem, 6vw, 5rem);
--ease-editorial: cubic-bezier(.16,1,.3,1);
--dur-1: 160ms; --dur-2: 280ms; --dur-3: 480ms;
--accent-urb: var(--mineral);   /* URBideas */
--accent-soc: #6F9A2E;         /* SOCideas (lima contenida) */
--accent-eco: #B7791F;         /* Economía (cobre, ya usado en series CCAA) */
--accent-ideas: var(--mineral);/* Sostenibilidad / Ideas Medioambientales */
```

Nota: sin fuentes de pago; si la red falla, display cae a Georgia (editorial
válido). Poppins se conserva como fallback legacy, no se elimina.

## 8. Propuesta de escala tipográfica

- Display: `clamp(2.5rem, 5vw, 4.25rem)`, serif editorial, `line-height 1.02`,
  `letter-spacing -0.02em`. Solo H1 de heroes.
- H1 ficha: `1.875rem→2.25rem` sans semibold `tracking-tight`.
- H2 sección: `1.125rem→1.25rem` bold (`ideas-h2` evoluciona).
- Eyebrow: `0.72rem`, `600`, `uppercase`, `0.22em`, con regla `w-8` mineral.
- Cuerpo: `0.95–1.05rem`, `1.65`; tablas `0.85rem` `tabular-nums`; caption/nota
  `0.75rem` muted. KPI: `1.6–1.9rem` bold `tabular-nums`.

## 9. Variantes de color por producto

- URBideas (`--accent-urb` mineral `#3E665C`): retícula cartográfica + curva de
  nivel en hero; enlaces y subrayados active en mineral; badges sobrios.
- SOCideas (`--accent-soc` lima contenida `#6F9A2E`): hero de consulta; píldora de
  frescura con punto vivo; series municipio en lima, provincia en mineral.
- Economía (dentro de SOC, `--accent-eco` cobre `#B7791F`): tags
  "Estructural · 2020", barras secundarias; nunca como fondo pleno.
- Sostenibilidad / Ideas Medioambientales (`--accent-ideas` mineral + marfil):
  franja corporativa y footer; logo siempre visible; enlace corporativo único
  (`CORPORATE_URL`), sin externos inventados.

## 10. Plan de motion

Con parallax (solo `transform`, rAF, `EditorialParallaxHero`):

- Hero `/`, hero `/urbideas`, hero `/socideas`, cabeceras de alto nivel con aire
  (`/asistencias`, `/urbideas/legislacion` si se les da hero).

Sin parallax ni reveal desplazado, deliberadamente:

- Tablas, formularios, filtros, selector municipal, gráficos SVG, mapas Leaflet,
  fichas densas (`FichaFiltros`/`EconomiaFicha`), botones críticos, overlay de
  carga, `#stats-bar`, resultados de búsqueda.

Permitido: reveal `opacity+transform` por sección (IntersectionObserver, 1 vez),
hover card `translateY(-2px)` + sombra, transición de tabs `160–280ms`,
skeleton shimmer lento y discreto. Prohibido: listeners sin rAF, layout-props en
scroll, loops infinitos, canvas/vídeo, librerías de parallax.

Reduced motion (`prefers-reduced-motion: reduce`): parallax off (sin JS, grid
estático), sin reveal desplazado (opacidad inmediata), sin shimmer ni conteos;
todo el contenido y CTAs intactos; foco visible y teclado sin cambios.

## 11. Mobile, contraste, rendimiento

- Mobile: heroes `py-10→14`, KPI `1col→2→5`, tablas con `overflow-x-auto`,
  tabs con scroll-x, menús con overlay + Escape en ambos headers, buscador
  apilado (`flex-col sm:flex-row` ya existe).
- Contraste: texto principal/secundario sobre card/bg en ambos temas; lima solo
  para elementos gráficos/bold; foco `:focus-visible` 2px lima siempre.
- Rendimiento: cero dependencias nuevas; decoración SVG/CSS inline `aria-hidden`;
  sin imágenes pesadas; `SeccionesMap` y `MunicipioMapa` siguen lazy; ficha
  `/socideas/[codigoINE]` mantiene `force-dynamic` + `unstable_cache` + una sola
  categoría montada; sin `HEAD` a R2; sin tocar endpoints/env.

## 12. Archivos a modificar (Fases B/C, sin contar este doc)

- `src/app/globals.css` (tokens + editorial + reduced-motion).
- `src/components/ui/EditorialParallaxHero.tsx` (nuevo, client mínimo).
- `src/components/ui/SectionEyebrow.tsx`, `SectionHeading.tsx`, `PremiumCard.tsx`,
  `DataCard.tsx` (evolución de `StatCard`), `PageShell.tsx`, `EmptyState.tsx`,
  `LoadingState.tsx`, `SourcePill.tsx` (evolución de `Traceability` parcial).
- `src/components/platform/PlatformHeader.tsx`,
  `src/components/platform/UrbideasHeader.tsx`,
  `src/components/platform/PlatformFooter.tsx` (+ retirar `layout/Footer` de
  `/urbideas/municipios` o alinearlo).
- `src/app/page.tsx`, `src/app/urbideas/page.tsx`, `src/app/socideas/page.tsx`,
  `src/app/socideas/[codigoINE]/page.tsx`,
  `src/app/socideas/[codigoINE]/secciones-censales/page.tsx`,
  `src/app/asistencias/page.tsx`, `src/app/urbideas/municipios/page.tsx`
  (re-skin por bloques).
- `src/components/socideas/*` (StatCard→DataCard alias, CategoryTabs, Traceability,
  SocideasSearch, MunicipioLoadingOverlay, SeccionesMap, FichaFiltros,
  EconomiaFicha): solo clases/marcado, cero lógica de datos.
- No tocar: `src/lib/socideas*`, `src/lib/supabase*`, `src/app/api/**`,
  `supabase/migrations/**`, `scripts/**`, `.env*`, `vercel.json`, `render.yaml`.
