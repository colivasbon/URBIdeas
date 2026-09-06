# Auditoría de navegación y metodología pública SOCideas

Rama: `feat/urbideas-premium-editorial-ui` · Fecha: 2026-09-06

## 1. Inventario de cabeceras / layouts existentes

| Componente | Archivo | Comportamiento actual |
|---|---|---|
| `PlatformHeader` | `src/components/platform/PlatformHeader.tsx` | Sticky, sin contracción por scroll. Menú desktop simple (4 links + corporativo) + menú móvil overlay con Escape y body-lock. Logo Ideas → `/` pero `aria-label="IDEAS Sostenibilidad — inicio"` (no el literal exigido). Estado activo: pill `bg-[input-bg]` + subrayado `w-4 secondary`. |
| `UrbideasHeader` | `src/components/platform/UrbideasHeader.tsx` | Sticky + **contracción por scroll** (`COMPACT_AFTER_PX = 48`, `h-14/sm:h-16` → `h-12`, descriptor oculto, letra/badge reducidos, `transition-all duration-300`). Listener `scroll` pasivo **sin rAF** (mejorable). Sin dropdowns: 5 enlaces planos (Inicio, Municipios, Mapa, Legislación, API). Móvil con Escape + body-lock. Logo producto → `/urbideas`. Enlace retorno `IDEAS Sostenibilidad` → `/`. |
| `PlatformFooter` | `src/components/platform/PlatformFooter.tsx` | Footer global; importa `CORPORATE_URL` desde `PlatformHeader`. Enlaces: `/`, `/urbideas`, `/socideas`, `/asistencias` + nota de fuentes. Sin cambios previstos salvo añadir `Cómo funciona` si encaja. |
| Root layout | `src/app/layout.tsx` | Sin header; solo `ThemeProvider` + metadata global. Cada página monta su header. |
| Sin layouts de módulo | — | No existe `src/app/(…)/layout.tsx` ni layout SOCideas/URBideas; cada `page.tsx` importa el header directamente. |
| `ThemeToggle` / `ThemeProvider` | `src/components/ui/ThemeToggle.tsx` | Existe y se conserva en todos los navbars. |
| Estilos header/nav | `src/app/globals.css` | Tokens `--color-*`, `:focus-visible` global secondary, animaciones `slide-in-down/fade-in`, `prefers-reduced-motion: reduce` global (anula transiciones). Sin CSS específico de header salvo clases Tailwind inline. |

## 2. Qué header usa cada ruta relevante

| Ruta | Archivo | Header actual |
|---|---|---|
| `/` | `src/app/page.tsx` | `PlatformHeader` |
| `/urbideas` | `src/app/urbideas/page.tsx` | `UrbideasHeader` |
| `/urbideas/municipios` | `src/app/urbideas/municipios/page.tsx` | `UrbideasHeader` |
| `/urbideas/mapa` | `src/app/urbideas/mapa/page.tsx` | `UrbideasHeader` |
| `/urbideas/legislacion` | `src/app/urbideas/legislacion/page.tsx` | `UrbideasHeader` |
| `/urbideas/api-docs` | `src/app/urbideas/api-docs/page.tsx` | `UrbideasHeader` |
| `/urbideas/municipios/[codigoINE]/legislacion` | `src/app/urbideas/municipios/[codigoINE]/legislacion/page.tsx` | `UrbideasHeader` |
| `/socideas` | `src/app/socideas/page.tsx` | `PlatformHeader` → migrar a `SocideasHeader` |
| `/socideas/[codigoINE]` | `src/app/socideas/[codigoINE]/page.tsx` | `PlatformHeader` → migrar a `SocideasHeader` contextual |
| `/socideas/[codigoINE]/secciones-censales` | `src/app/socideas/[codigoINE]/secciones-censales/page.tsx` | `PlatformHeader` → migrar a `SocideasHeader` contextual |
| `/socideas/como-funciona` | (nueva) `src/app/socideas/como-funciona/page.tsx` | `SocideasHeader` (nuevo) |
| `/asistencias` | `src/app/asistencias/page.tsx` | `PlatformHeader` → migrar a `AsistenciasHeader` |
| `/admin` | `src/app/admin/page.tsx` | Sin header de plataforma (fuera de alcance) |

## 3. Inventario de rutas realmente existentes (verificado en `src/app`)

URBideas: `/urbideas`, `/urbideas/municipios`, `/urbideas/municipios/[codigoINE]/legislacion`, `/urbideas/mapa`, `/urbideas/legislacion`, `/urbideas/api-docs`.
SOCideas: `/socideas`, `/socideas/[codigoINE]`, `/socideas/[codigoINE]/secciones-censales` (+ nueva `/socideas/como-funciona`).
Asistencias: `/asistencias`.
Plataforma: `/`.
Rewrites legacy (`/mapa`, `/municipios`, `/legislacion`, `/api-docs` → canónicos) documentados en `docs/urbideas-navigation-phase-1-1.md`; no se tocan.

## 4. Propuesta final de navegación por módulo

Base única: `src/components/platform/ProductNavbar.tsx` (tipos `ProductNavItem` / `ProductNavbarConfig`, hook de compactación con 1 listener pasivo + rAF, menús click-to-open con `aria-expanded`/`aria-controls`, cierre por Escape/click-fuera/navegación, menú móvil con secciones expandibles, bloqueo de scroll restaurado siempre). Wrappers finos: `PlatformHeader`, `UrbideasHeader` (evolucionados, sin duplicar lógica), `SocideasHeader` (nuevo, contextual), `AsistenciasHeader` (nuevo). Tonos: `platform` (hairline gradiente), `urban` (border-b-2 secondary), `social` (idem + acento propio), `assistance` (idem).

- **Plataforma** (`/`): Inicio → `/`; URBideas → `/urbideas`; SOCideas → `/socideas`; Asistencias → `/asistencias`; Ideas Medioambientales → `CORPORATE_URL` existente (nueva pestaña, se conserva). Logo Ideas → `/` con etiqueta `Ir a la página principal de Ideas Sostenibilidad`.
- **URBideas**: logo URBideas → `/urbideas`; Inicio → `/urbideas` (exacto); Explorar ▾ (Municipios → `/urbideas/municipios`, Mapa → `/urbideas/mapa`); Recursos ▾ (Legislación → `/urbideas/legislacion`, API → `/urbideas/api-docs`); retorno IDEAS Sostenibilidad → `/`. Activo de grupo: Explorar en municipios/mapa (+ ficha legislacion municipal → Explorar); Recursos en legislacion/api-docs.
- **SOCideas**: logo SOCideas → `/socideas`; Inicio → `/socideas` (exacto); Explorar ▾ (Buscar municipio → `/socideas`; Ficha municipal → contextual `/socideas/[INE]` preservando query; Secciones censales → contextual `/socideas/[INE]/secciones-censales`; ambos solo con `codigoINE` válido, nunca literal); Datos y metodología ▾ (Cómo funciona → `/socideas/como-funciona`; Fuentes y cobertura → `/socideas/como-funciona#fuentes`; Actualización y calidad → `/socideas/como-funciona#actualizacion-calidad`); retorno IDEAS Sostenibilidad → `/`. Sin municipio (hub): Explorar solo muestra Buscar municipio.
- **Asistencias**: nombre → `/asistencias`; Inicio → `/asistencias`; Áreas ▾ con 5 ítems `Próximamente` **sin href** (span, `aria-disabled`, no `#`); retorno IDEAS Sostenibilidad → `/`.

## 5. Rutas que NO existen y NO se deben enlazar

- `/urbideas/api` — **no existe**; la ruta real es `/urbideas/api-docs`. No enlazar `/urbideas/api`.
- `/socideas/[codigoINE]` literal — nunca como href; solo con INE de 5 dígitos.
- `/socideas/como-funciona` aún no existe (la crea esta tarea); resto de anchors SOCideas solo `#fuentes` y `#actualizacion-calidad`.
- Sin nuevas rutas corporativas, dashboards, módulos de Asistencias ni endpoints.

## 6. Fuentes / datos: estado real (ver `docs/socideas-phase-2b-economic-sources.md`, `docs/socideas-phase-2c-economic-audit.md`, `src/lib/socideas.ts`, `EconomiaFicha.tsx`)

| Fuente | Bloque / indicadores | Estado en página |
|---|---|---|
| INE Tempus3/DPOP — población municipal, evolución, estructura edad/sexo, comparativas provincia/CCAA/España | Demografía (`population_total/_male/_female/_evolution/_age_sex/_density`, cambios 5y/10y, envejecimiento, dependencia) | **Disponible** (sincronizado por municipio; si no, estado honesto `pending`) |
| INE ADRH — renta neta/bruta media persona/hogar, Gini, P80/P20, serie 2015–2023, ref. 2023 | Renta y desigualdad | **En preparación / cobertura parcial** (catálogo 2B existe; carga nacional pendiente; Gini/P80P20 solo ≥100 hab.) |
| AEAT EDM — declaraciones, renta bruta/disponible media por declaración, >1.000 hab., territorio común (sin PV/Navarra), ref. 2023 | Renta por declaración | **En preparación** (conector implementado, a la espera de fichero base; sin scraping) |
| INE DIRCE 4721 — empresas total/industria/construcción/servicios/comercio-hostelería, ref. 1-ene-2025 | Tejido empresarial | **En preparación / cobertura parcial** (<1.000 hab. solo total) |
| INE Censo Agrario 2020 — SAU, tierra arable, leñosos, pastos, huertos, explotaciones, ganadería por especie + UG | Estructura agraria y ganadería | **Disponible parcial (estructural 2020)**; detalle por cultivos solo si hay descarga provincial |
| SEPE paro registrado | Empleo | **Pendiente** (diseño documentado, no cargar en 2B) |
| TGSS afiliación | Empleo | **Pendiente / futuro** (requiere verificación; regla `<5` → nunca 0) |
| MHacienda presupuestos/liquidaciones, BDNS ayudas, suelo industrial SEPES/CCAA | Finanzas locales / ayudas / suelo | **Pendiente / futuro** (sin fuente nacional homogénea) |
| IPC municipal homogéneo | Precios | **Sin cobertura** (INE solo provincial; no implementable) |
| Secciones censales: geometría INE OGC/WFS + indicadores por sección | Geometría bajo demanda | **En preparación** (geometría oficial bajo demanda; indicadores por sección solo con fuente a ese nivel) |

Categorías visibles reales en ficha: **Demografía** y **Economía** (`CategoryTabs`), + enlace **Secciones censales**. Filtros de ficha (año, evolución, pirámide, ámbitos) aplicados localmente tras cargar (`FichaFiltros`); Economía sin filtros.

## 7. Borrador exacto de secciones de “Cómo funciona” (IDs finales)

Ruta estática `src/app/socideas/como-funciona/page.tsx` (usa `SocideasHeader`, fondo grid tenue estático, sin curvas). Índice sticky → anchors reales. CTA `Ir al buscador municipal` → `/socideas`. Un único `h1` `Cómo funciona SOCideas`, subtítulo `Metodología, fuentes oficiales y arquitectura de consulta municipal.`

1. `#vision-general` — Hero: 2 párrafos (ficha por municipio; caracterización/análisis técnico; fuente+periodo+estado por indicador; ausencia ≠ cero).
2. `#que-consulta-el-usuario` — CCAA→provincia→municipio, búsqueda por nombre, ficha, categorías Demografía/Economía, secciones bajo demanda, filtros locales. Solo categorías implementadas.
3. `#arquitectura` — Diagrama accesible Usuario→App→Catálogo+trazabilidad→Documentos municipales→Fuentes oficiales + alternativa textual; alto nivel Vercel/Next.js, R2 documentos, Supabase catálogo/trazabilidad; actualizaciones protegidas, no públicas.
4. `#datos-y-fuentes` (+ alias `#fuentes` para nav) — Tabla Bloque│Indicadores│Fuente│Periodicidad│Cobertura│Periodo│Limitaciones│Estado; secreto estadístico nunca → 0; rezagos renta/empresa; sin IPC municipal.
5. `#flujo-de-datos` — Fuente→descarga→validación (INE 5 dígitos, periodo, rango, cobertura)→normalización→documento→ficha; consolidado vs provisional; actualización por bloque; revalidación selectiva.
6. `#actualizacion-calidad` — Periodicidad por fuente; controles (INE, periodos, no negativos, renta positiva, índices en rango); secreto `<5`; trazabilidad; actualización focalizada autorizada; sin fabricar provisionales.
7. `#cobertura-limitaciones` — Rezago, cobertura desigual, niveles territoriales, secreto, ausencia explícita, consolidado/provisional, secciones bajo demanda, no sustituye verificación normativa/jurídica/estadística.
8. `#rendimiento` — Catálogo optimizado, documento + caché selectiva, geometría bajo demanda, invalidación por municipio. Sin variables/TTL/tags/URLs.
9. `#privacidad-seguridad` — Estadística agregada pública, sin datos personales, mantenimiento protegido, sin credenciales en navegador, consulta separada de actualización. Sin promesas de certificación.
10. `#alcance-futuro` — Listas En evaluación / Preparado técnicamente / Futuro (renta, provisionales, focalizadas autorizadas, visualizaciones, capas). Sin fechas; nada no publicado como disponible.

Bloques de `Principio` / `Limitación` / `Trazabilidad`; tablas con `th` semánticos + scroll horizontal; `SourcePill` solo con fuentes/periodos reales.

## 8. Información sensible EXCLUIDA (nunca en la página)

Tokens, API keys, secretos, credenciales, nombres/valores de env (`SOCIDEAS_SYNC_TOKEN`, `service_role`, `NEXT_PUBLIC_*` privados…), URLs firmadas/privadas, buckets/cuentas/IDs de proyecto, SQL de servicio, RLS específico, cabeceras privadas, rutas admin, comandos/endpoints de sync ejecutables, datos personales, logs reales, temporales, máquinas locales, TTLs/tags exactos, URLs de infraestructura, vulnerabilidades explotables, fechas de publicación prometidas.

## 9. Matriz de accesibilidad del navbar

| Requisito | Implementación |
|---|---|
| Logo Ideas → `/` como link real, sin JS, con etiqueta `Ir a la página principal de Ideas Sostenibilidad`, foco visible, sin nueva pestaña | `Link href="/"` + `aria-label` exacto |
| Logo producto → origen del módulo, sin dropdown propio | `Link` directo (`/urbideas`, `/socideas`, `/asistencias`) |
| Submenús click-to-open, no hover | `button aria-expanded aria-controls` + panel `role="menu"`/`list`; hover solo visual, jamás único medio |
| Cierre Escape / click-fuera / navegación / otro menú | Keydown global, ref click-outside, `pathname` effect, apertura exclusiva |
| Teclado Tab/Shift+Tab/Enter/Space/Escape, sin trampas, foco visible | Botones nativos, `:focus-visible`, retorno de foco al trigger tras Escape |
| Estado activo accesible | `aria-current="page"` + estilo sobrio único (surface + hairline, sin pill+subrayado+lima) |
| Móvil abre/cierra, secciones expandibles por click, cierra al navegar/Escape, scroll-lock restaurado | Estado + cleanup en effect/unmount |
| `prefers-reduced-motion` | Sin transición larga/blur/parallax en header; `globals.css` ya anula duraciones |
| Próximamente no navegable | `span` con badge, `aria-disabled`, sin `href="#"` |

## 10. Matriz de pruebas (desktop / móvil / reduced motion)

| Área | Casos |
|---|---|
| Landing `/` | Logo Ideas→`/`, Inicio→`/`, URBideas→`/urbideas`, SOCideas→`/socideas`, Asistencias→`/asistencias`, corporativo intacto |
| URBideas (origen + hija p. ej. `/urbideas/municipios`) | Logo→`/urbideas`; Explorar abre por click (Municipios/Mapa); Recursos (Legislación/API-docs); Escape/fuera/navegación cierran; grupo activo correcto; Inicio no activo en hijas; contracción 48–72px, recupera arriba/subiendo |
| SOCideas hub `/socideas` | Logo→`/socideas`; sin enlaces contextuales rotos; Datos y metodología→Cómo funciona `#fuentes` `#actualizacion-calidad`; buscador OK |
| Ficha `/socideas/28079` (+ `?categoria=economia`) | Ficha contextual conserva `28079` (+categoría si razonable); Secciones→`/socideas/28079/secciones-censales`; metodología visible; sin regresión de carga |
| Secciones `/socideas/28079/secciones-censales` | Navbar contextual intacto; mapa bajo demanda OK |
| Cómo funciona | 10 anchors; h1 único; tablas `th`; diagrama con alternativa; CTA buscador; sin secretos (grep) |
| Asistencias | Nombre→`/asistencias`; Áreas abre por click; 5 ítems sin href ni `#`; contracción OK |
| Móvil 320/390/768 | Sin overflow-x; header compacto; submenús por click; foco visible; Escape/navegar cierran; ambos logos con destino correcto |
| Reduced motion | Emular `prefers-reduced-motion`; navbar cambia de estado sin animación larga; funcionalidad idéntica |
| Calidad | `npx eslint src/app src/components`, `npx tsc --noEmit`, `npm run build`, `git diff --check`, `git status --porcelain` literales |
