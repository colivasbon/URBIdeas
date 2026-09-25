# Fase 0 — Auditoría de reconocimiento (previa al rediseño visual IMA)

Fecha: 2026-09-25 · Rama de trabajo local: `feat/conprel-integral` (sin commits, a petición del usuario)
Producción de referencia: https://urb-ideas.vercel.app/

## 1.1 Stack

| Elemento | Versión / uso real |
| --- | --- |
| Framework | Next.js **16.3.3** (App Router, `src/app`) |
| React | 19.2.8 |
| Estilos | **Tailwind CSS v4** (`@tailwindcss/postcss`) + CSS custom properties en `src/app/globals.css` (1.924 líneas, dos capas históricas: "rebranding SOCideas" y "reskin corporativo") |
| Mapa | **Leaflet 1.9.4** + `react-leaflet` 5.0.0 (OpenStreetMap / IGN / PNOA) |
| Gráficos | Componentes SVG propios: `PyramidChart`, `EvolutionChart`, `PirEstructura`, `EstructuraPoblacionBlock` (sin librería) |
| Iconos | **SVG inline dispersos** (Heroicons copiados a mano en cada componente). No hay set único |
| Fuentes | Poppins vía `next/font/google`, pesos 400/500/600/700, **subset solo `latin`** (sin `latin-ext`) |
| Tema | `data-theme="light"` por defecto en `<html>`; existe `ThemeProvider` + `ThemeToggle` (dark mode de la etapa anterior) |
| Dependencias de animación | Ninguna (todo CSS). No añadir salvo necesidad |
| Tests / tooling visual | **No hay Playwright, ni axe-core directo, ni capturas**. `axe-core` existe como dependencia transitiva |
| Despliegue | Vercel (`urb-ideas`) |

## 1.2 Inventario de rutas (App Router)

### Públicas

| Ruta | Archivo | Notas |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | Home de plataforma. Hero musgo + parallax + KPIs + 2 ModuleCard |
| `/urbideas` | `src/app/urbideas/page.tsx` | Home de módulo, stats Supabase, 4 accesos directos |
| `/urbideas/municipios` | `.../municipios/page.tsx` | Listado + buscador (108 clases arbitrarias) |
| `/urbideas/municipios/[codigoINE]/legislacion` | `.../municipios/[codigoINE]/legislacion/page.tsx` | Legislación por municipio |
| `/urbideas/mapa` | `.../mapa/page.tsx` | Visor Leaflet a pantalla completa + panel (103 clases arbitrarias) |
| `/urbideas/legislacion` | `.../legislacion/page.tsx` | Listado normativo |
| `/urbideas/api-docs` | `.../api-docs/page.tsx` | Documentación API |
| `/socideas` | `src/app/socideas/page.tsx` | Home de módulo + buscador |
| `/socideas/como-funciona` | `.../como-funciona/page.tsx` | Metodología (64 clases arbitrarias) |
| `/socideas/[codigoINE]` | `.../[codigoINE]/page.tsx` | Ficha municipal (libro de hojas) |
| `/socideas/[codigoINE]/secciones-censales` | `.../secciones-censales/page.tsx` | Mapa de secciones |
| `/socideas/[codigoINE]/descargas/demografia` | `.../descargas/demografia/page.tsx` | Descargas |
| `/socideas/[codigoINE]/descargas/economia` | `.../descargas/economia/page.tsx` | Descargas |
| `/admin` | `src/app/admin/page.tsx` | Panel interno (118 clases arbitrarias) |
| `/asistencias` | `src/app/asistencias/page.tsx` | Módulo deshabilitado en nav (comentado) |
| `/urbideas/buscar` (referenciado) | redirect a `/urbideas/municipios` | — |

Alias por rewrite en `next.config.ts`: `/mapa`, `/municipios`, `/municipios/:path*`, `/legislacion`, `/api-docs`.

### API (no rediseñar; solo verificar que no se tocan)

`/api/municipios`, `/api/municipios/[id]`, `/api/busqueda`, `/api/dictamen`, `/api/dictamen/pdf`, `/api/dictamen/word`, `/api/dictamen/paquete`, `/api/legislacion`, `/api/legislacion-aplicable`, `/api/capas-wms`, `/api/capas-aplicables`, `/api/catastro`, `/api/comunidades`, `/api/provincias`, `/api/territorio`, `/api/planeamiento`, `/api/siU`, `/api/comparar`, `/api/export`, `/api/estado-servicios`, `/api/wms-proxy`, `/api/fuentes`, `/api/directorio-ayuntamientos`, `/api/socideas/*`.

### Estados globales existentes

- `src/app/socideas/[codigoINE]/loading.tsx` (skeleton propio).
- No hay `not-found.tsx`, `error.tsx` ni `global-error.tsx` en `src/app`. **Pendiente crear** con el lenguaje 4.16.
- Estados vacíos: `EmptyState`, `LoadingState`, `AvailabilitySummary`, `TemporaryDataNotice`.

## 1.3 Inventario de componentes (86 archivos)

### Compartidos primitivos (`src/components/ui`) — 21

`Button`, `Badge`, `Card`, `Input`, `Select`, `Modal`, `EmptyState`, `LoadingState`, `PageShell`, `SectionHeading`, `SectionEyebrow`, `SourcePill`, `PremiumCard`, `DataCard`, `ThemeToggle`, `ThemeProvider`, `HeroParallax`, `EditorialParallaxHero`, `TopographicContours`, `TerritorialGrid`, `TerritorialBackground`.

### Plataforma / layout — 9

`ProductNavbar` (base de `PlatformHeader`, `UrbideasHeader`, `SocideasHeader`, `AsistenciasHeader`), `PlatformFooter`, `ModuleCard`, `product-nav-config`, `layout/Header` (legado URBideas), `layout/Footer` (legado URBideas, sin usar en plataforma).

### Datos / mapa / filtros — 15

`TablaPlaneamiento`, `TablaComparativa`, `TarjetaMunicipio`, `MunicipalTab`, `VisorMapa`, `MunicipioMapa`, `WmsTileLayer`, `FileGeoJsonLayer`, `SoilGeoJsonLayer`, `CapaAmbito`, `DibujoAmbito`, `ControlCapas`, `FileLayerPanel`, `ProvinceSelector`, `GetFeatureInfoPopup`, `FiltroCascada`, `BuscadorTextoLibre`, `SelectorMultiMunicipio`.

### SOCideas — 47

Todo el ecosistema de ficha: `SheetShell`, `SheetTabs`, `SheetSections`, `SocideasSearch`, `DataTableShell`, `DataTableToolbar`, `DataTableMeta`, `DataStatusBadge`, `StatCard`, `StatusCard`, `Traceability`, `EvolutionChart`, `PyramidChart`, `PirEstructura`, bloques por dominio (`DemographicBlocks`, `DensityBlocks`, `MigrationBlocks`, `LaborBlocks`, `EconomiaFicha`, `EstructuraPoblacionBlock`, `ElectoralBlocks`, `ElectoralProvincialBloques`, `IneLayersBlocks`, `ConprelSeccion`, `AsociacionesBloque`, `GalBloque`, `PatrimonioBloque`, `DescargasBloque`, etc.).

### Duplicidades detectadas (variantes ad hoc del mismo patrón)

- **Botón**: 5 implementaciones distintas — `ui/Button` (inline styles), `.ideas-btn-primary`, `.socideas-btn`, `.socideas-error-btn`, y botones inline por página con `style={{backgroundColor: 'var(--color-primary)'}}`. Además ModuleCard, home, urbideas repiten el mismo CTA.
- **Badge/estado**: 4 sistemas — `ui/Badge`, `.ideas-status__badge`, `.socideas-badge`, `DataStatusBadge`, más spans ad hoc en `socideas/page.tsx` ("Disponible", "En desarrollo", "En preparación").
- **Card**: `ui/Card`, `PremiumCard`, `DataCard`, `.ideas-section`, `.socideas-table-shell`, `.glass-card`, `ModuleCard`, y decenas de `div` con borde+radio 6px inline.
- **Eyebrow**: `.ideas-eyebrow`, `.editorial-eyebrow`, más `p.text-xs.uppercase` repetidos en home/urbideas/socideas.
- **Cabecera de sección**: `SectionHeading`, `SectionEyebrow` y variantes manuales.

## 1.4 Deuda visual (grep automatizado)

- **184 hex hardcodeados** en `globals.css` (dos sistemas de tokens solapados) y **~70 hex/`rgba()` hardcodeados** en componentes: `mapa/page.tsx` (21), `ProductNavbar` (16), `MunicipioMapa` (8), `fileLayerUtils` (8), `FileLayerPanel` (6), `SoilGeoJsonLayer` (6), `HeroParallax` (4), `DescargasBloque` (4), `DibujoAmbito` (4), `CapaAmbito` (4), etc.
- **Clases arbitrarias Tailwind** (valores sueltos): >1.500 apariciones, concentradas en `admin` (118), `urbideas/municipios` (108), `urbideas/mapa` (103), `socideas/como-funciona` (64), `MigrationBlocks` (59).
- **Radios distintos de 6px**: `.ideas-tabs`/`.ideas-tab` usan `999px` no circular; `leaflet-popup-close-button` usa `50%` (circular, admisible); `--radius-pill` para cápsulas.
- **Sombras negras / por defecto**: `--shadow-sm/md/lg/xl` con `rgba(0,0,0,…)`; `cta-glow` con `rgba(0,0,0,.2)`; `glass-card` con `rgba(0,0,0,.25)`.
- **Gradientes prohibidos**: `.premium-skeleton` (linear-gradient shimmer), máscaras `mask-image: linear-gradient(...)` del fondo territorial, `repeating-linear-gradient` de la retícula, `--color-overlay` con degradados simulados. (Las máscaras son funcionales pero el brief las prohíbe explícitamente en overlays; se sustituirán por opacidad/capas planas.)
- **Glassmorphism**: `.glass-card`, `.loading-overlay`, `.header-glass` con `backdrop-filter: blur + saturate`.
- **Fuentes**: Poppins subset `latin` (faltan diacríticos raros de `latin-ext`); `--font-display` y `--company-font` declarados con fallback incompleto en algunos puntos.
- **Focus**: `:focus-visible` global con `outline` (válido) pero hay botones con `focus:outline-none` en `Input` y varios sin estado `focus-visible` propio; no existe `--ring-focus` unificado.
- **Contraste**: `--color-secondary` (#86B73D) usado como texto en varios puntos sobre claro (<3:1). `ideas-tab[data-active]` usa `#fff` sobre musgo (5,7:1 OK). Badge "Disponible" usa `text-white` sobre musgo (OK). Botones `bg-[var(--color-primary)]` + `#FFFFFF` (OK, 5,7:1) pero el acento conifera no se usa como CTA en casi ningún sitio.
- **Movimiento**: duraciones dispares (150/160/200/220/280/300/320/480/600ms); `animate-pulse` del footer; `transition-all` en varios elementos (mala práctica); no hay capa `prefers-reduced-motion` unificada (existen 4 bloques parciales).
- **Accesibilidad estructural**: un `h1` por página (OK en las revisadas); no hay **skip link**; no hay `not-found/error`; menú móvil de `ProductNavbar` sin focus trap; `aria-current` presente en nav (OK); `ThemeToggle` anuncia estado (OK).
- **Formato numérico**: uso mixto de `toLocaleString("es-ES")` y `tabular-nums`; falta unificar `Intl.NumberFormat`.

## 1.5 Línea base (capturas y Lighthouse)

No ejecutada todavía: el proyecto no tiene Playwright instalado y el brief prohíbe añadir dependencias no esenciales. Plan:
1. Instalar `playwright-core` (usa Chrome del sistema, sin descargar navegadores) + script de capturas y axe en `design-audit/`.
2. Guardar capturas 375/768/1440 en `design-audit/before/` y `design-audit/after/`.
3. Lighthouse móvil se documentará con resultado y, si el entorno lo impide, se anotará como pendiente de validación manual.

## 1.6 Top 15 problemas visuales priorizados

1. **Dos (tres) sistemas de tokens solapados** en `globals.css` que se pisan por orden de cascada → resultados impredecibles y 184 hex duplicados.
2. **CTA inconsistente**: conifera no se usa como acción principal; cada página usa botones con estilos inline distintos.
3. **Sin jerarquía tipográfica real**: tamaños ad hoc (`text-4xl/5xl/6xl`), tracking arbitrario, sin escala modular ni `clamp`.
4. **Glassmorphism + gradientes** en cards, skeletons y overlays (prohibidos por el brief).
5. **Sombras negras** en lugar de tintadas en carbón.
6. **Radios fuera de sistema** (tabs circulares, cápsulas).
7. **Estados incompletos**: hover/active/disabled sí; focus-visible inconsistente; loading/aria-busy casi inexistente.
8. **Iconografía mezclada** (Heroicons copiados + SVGs sueltos + emojis textuales en datos sociológicos).
9. **Sin `not-found` / `error` / `loading` globales** con lenguaje propio.
10. **Sin skip link ni landmarks consistentes** entre páginas.
11. **Datos sin tratamiento premium**: KPIs planos, cifras sin `tabular-nums` en tablas concretas, sin animación de conteo.
12. **Mapa sin tema visual**: controles Leaflet por defecto re-estilizados a medias con `!important`, popups heredan estilos dispares.
13. **Tablas**: un sistema `.ideas-table` y otro `.socideas-table` con cabeceras `bg-musgo` + borde conifera (chillón) y zebra + divisores a la vez.
14. **Home**: hero con parallax pesado (`HeroParallax`, `EditorialParallaxHero`) que penaliza LCP y usa máscaras degradadas.
15. **Accesibilidad de color**: conifera como texto sobre claro en varios puntos, `--text-muted` por debajo de 4,5:1 en algunos usos.

## 1.7 Decisiones de alcance tomadas tras la Fase 0

- **No migrar** de stack: se mantiene Tailwind v4 + custom properties. La nueva capa de tokens se monta encima y **remapea los nombres legacy** (`--color-primary`, `--color-card-bg`, …) a los tokens IMA para corregir de golpe los 86 componentes sin reescribirlos todos.
- **Se conserva el dark mode existente** (hay toggle), mapeando los tokens semánticos a derivados oscuros con contrastes verificados. El diseño de referencia es claro (hueso).
- Los componentes prioritarios (Button, Badge, Card, Input, EmptyState, ProductNavbar, PlatformFooter, ModuleCard, SectionHeading, SourcePill, PageShell) se **reescriben** con tokens semánticos y estados completos; los componentes de dominio se corrigen por el remapeo global y se limpian por pasadas en las rutas clave.
- Sustituir el set de iconos completo está fuera del presupuesto de esta pasada: se normaliza a **stroke 1,5 y tamaños 16/20/24** donde se toca, y se documenta el set pendiente (lucide) como deuda.
- Playwright/axe se añaden **solo como herramienta de verificación** (dev), nunca como dependencia de runtime.
