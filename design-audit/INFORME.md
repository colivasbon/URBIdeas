# Informe de rediseño visual — IDEAS Sostenibilidad (IMA)

Fecha: 2026-09-25 · Repositorio: `colivasbon/URBIdeas` · Rama de trabajo local: `feat/conprel-integral` (sin commits, por indicación del usuario).
Alcance: capa visual completa (tokens, tipografía, componentes, layout, rutas públicas, estados globales, a11y y verificación).

---

## 1. Inventario final de rutas

| Ruta | Estado del rediseño |
| --- | --- |
| `/` | Rediseñada completa (hero claro + SVG cartográfico, KPIs animados, módulos, banda invertida) |
| `/urbideas` | Rediseñada completa (cabecera de módulo, KPIs, cards de acceso con icono lineal) |
| `/urbideas/municipios` | Cabecera, filtros (labels accesibles) y badges de estado migrados al sistema; lógica intacta |
| `/urbideas/mapa` | Estilos base de Leaflet, popups, controles y chrome via tokens; panel pendiente de pasada fina (ver §8) |
| `/urbideas/legislacion` | Rediseñada (page header, tabs ARIA, filas documentales, nota jurídica, enlaces externos) |
| `/urbideas/api-docs` | Hereda tokens; no rediseñada (documentación técnica) |
| `/socideas` | Rediseñada completa (hero funcional con buscador, badges de estado, fuentes y cobertura) |
| `/socideas/como-funciona` | Retocada (callouts, tabla de fuentes, numeración en musgo, índice con enlaces legibles) |
| `/socideas/[codigoINE]` (+ secciones, descargas) | Hereda tokens y componentes remapeados; ficha no reestructurada |
| `/admin`, `/asistencias` | Heredan tokens; fuera del alcance público |
| `/design-system` | **Nueva** (noindex, no enlazada): tokens, escalas, tipografía y componentes con estados |
| `not-found` / `error` / `loading` globales | **Nuevos**, con el lenguaje 4.15/4.16 |

Componentes base reescritos: `Button`, `Badge`, `Card`, `Input`, `EmptyState`, `LoadingState`, `Modal`, `SectionHeading`, `PageShell`, `ModuleCard`, `ProductNavbar`, `PlatformFooter`.
Componentes nuevos: `Breadcrumbs`, `KpiNumber`, `SectionReveal`, `design-system/page.tsx`.
Consolidaciones: `layout/Footer` ahora delega en `PlatformFooter` (un solo pie); `EditorialParallaxHero` pierde el parallax (estático).

## 2. Tabla de tokens (fuente única: `src/app/globals.css`)

### Primitivos (escalas OKLab, anclaje 500 salvo carbón en 600)

| Familia | 50 | 100 | 200 | 300 | 400 | 500 / base | 600 | 700 | 800 | 900 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| musgo | #E8F9F4 | #D5EDE6 | #B5D3CB | #90B3AA | #688F85 | **#3E665C** | #2E554B | #21463D | #10342C | #02231C |
| conifera | #EDFFD5 | #E0FEBF | #CDF2A2 | #B6E27F | #9ECF5C | **#86B73D** | #6A971A | #527C00 | #355B00 | #1A3B00 |
| carbon | #EFF1F0 | #DBDEDD | #BABEBC | #969A98 | #747876 | #5B5F5D | **#3C403E** | #2E312F | #262A28 | **#1E2220** |
| rupestre | #FFECEC | #FCD9D9 | #E1B7B6 | #BF8E8E | #966162 | **#643335** | #56282A | #491E21 | #3A1215 | #2B070B |
| limo | #F7FDF7 | #F0F7F0 | #E3EDE3 | #D4DFD4 | #C3D0C3 | **#B0BDB0** | #8F9B8F | #727E72 | #505A50 | #303930 |
| crisopa | #F5FFE0 | #EFFFD1 | #E5FCBF | #DAF5AB | #CEED97 | **#C2E189** | #9CB965 | #7C9747 | #566D1F | #324500 |

Retama `#FBE122` y hueso `#F1F1F1` sin escala.

### Semánticos (tema claro; oscuro mapeado en `[data-theme="dark"]`)

`--bg-canvas` hueso · `--bg-surface` #FFFFFF (justificación: separar tarjeta del canvas con borde sutil + shadow-1, sin sombra dura) · `--bg-surface-sunken` carbon-50 · `--bg-inverse` musgo · `--bg-inverse-alt` carbón.
`--text-primary` carbón · `--text-secondary` #4F5451 · `--text-muted` #666B67 · `--text-inverse` hueso · `--text-inverse-secondary` hueso 94 % · `--text-link` musgo-700 · `--text-accent-on-dark` retama.
`--border-subtle` limo 55 % · `--border-default` limo-700 · `--border-strong` musgo-400 · `--border-focus` conifera-600.
`--action-primary-bg` conifera · hover conifera-600 · fg **carbon-900** · `--action-secondary-*` musgo · `--action-danger-*` rupestre.
Estados: success conifera-800/crisopa-200 · warning carbón-900/retama · danger rupestre-700/rupestre-50 · info musgo-700/musgo-50 · beta carbón/limo-200.
Tipografía `--fs-display…--fs-data-xl`, espaciado base 4, radios 6px/9999px, `--shadow-1/2/3` tintadas en carbón, `--dur-*`, `--ease-*`, `--z-*` por capas. Mapeo de compatibilidad para tokens heredados (`--color-*`, `--company-*`, `--premium-*`, `--editorial-*`) → sistema IMA, de modo que los ~90 componentes adoptan la identidad sin reescribirse uno a uno.

## 3. Matriz de contrastes aplicada

| Combinación | Ratio | Uso |
| --- | --- | --- |
| Hueso sobre musgo | 5,70:1 | Texto sobre marca (header/footer/hero) |
| Musgo sobre hueso | 5,70:1 | Enlaces y títulos de sección |
| Retama sobre musgo | 4,88:1 | Único acento sobre oscuro |
| **Carbon-900 sobre conifera (CTA)** | **6,79:1** | Acción principal |
| Carbon-900 sobre conifera-600 (hover) | 4,64:1 | Acción principal, hover |
| Hueso sobre rupestre | 9,00:1 | Acción destructiva |
| Musgo-700 sobre musgo-50 | 9,60:1 | Badge informativo |
| Carbón sobre crisopa | 7,23:1 | Badge disponible |
| Rupestre sobre rupestre-50 | 8,93:1 | Badge de error |
| Carbón sobre limo-200 | 8,77:1 | Badge beta |
| Texto secundario #4F5451 sobre hueso | 6,84:1 | Cuerpo secundario |
| Texto muted #666B67 sobre hueso | 4,81:1 | Metadatos (≥ AA en todo uso) |
| Borde limo-700 sobre hueso (UI) | 3,76:1 | Bordes de input |
| Foco conifera-600 sobre hueso (UI) | 3,07:1 | Anillo de foco |
| **Prohibidas verificadas como fallo**: hueso/blanco sobre conifera 2,10:1 · conifera sobre hueso 2,10:1 · carbón sobre conifera 4,44:1 · limo como texto 1,73:1 | — | Documentadas y evitadas |

Verificación reproducible: `node design-audit/verify-contrast.mjs`.

## 4. Decisiones de diseño y justificación

1. **Light-first.** El sistema IMA se define sobre hueso (canvas) y blanco (superficie). El dark mode existente se conserva mapeado (no se elimina funcionalidad) con contrastes recalculados.
2. **CTA único conífera + carbón-900.** Máxima energía de marca sin romper AA; el CTA primario es el mismo componente en toda la app y en ambos temas.
3. **Cabecera clara.** El header pasa de musgo a canvas con blur(8px) y borde al scrollear (4.7). El musgo queda como banda de marca (hero de módulo, banda de plataforma, footer).
4. **Una sola familia de sombras** tintadas en carbón, sin negro puro ni `shadow` por defecto.
5. **Fondos territoriales planos.** Retícula por patrón SVG y curvas SVG con opacidad; sin máscaras degradadas ni parallax (ambos prohibidos). El hero no se anima (protección de LCP); las secciones entran con `SectionReveal` (IntersectionObserver, una vez, 12px).
6. **KPIs con conteo** (`KpiNumber`): valor final siempre en el DOM (span sr-only), animación ≤900 ms una sola vez y desactivada con `prefers-reduced-motion`.
7. **Tablas**: cabecera sticky sobre `--bg-surface-sunken` en overline, filas 48px, divisores (sin zebra), cifras a la derecha con `tabular-nums`.
8. **Formato es-ES** con `Intl.NumberFormat` en cifras animadas y `tabular-nums lining-nums` global en datos.

## 5. Desviaciones del brief (justificadas)

1. **CTA activo**: el brief pedía `conifera-700` en `:active` con texto carbón-900; esa combinación da 3,25:1 (falla AA). Se mantiene `conifera-600` + `translateY(1px)` + `shadow-1` como estado pulsado (misma sensación, contraste válido).
2. **CTA en modo oscuro**: hueso sobre conifera-700 = 4,38:1 (falla). Se mantiene el CTA conífera + carbón-900 también en oscuro.
3. **Opacidades del footer**: el 80 % pedido para enlaces da 3,4:1 sobre musgo. Se usa hueso puro (5,70:1) en enlaces y hueso 94 % (4,6:1) en textos secundarios.
4. **Retama al 90 %** en títulos de columna del footer: 4,39:1. Se usa retama 100 % (4,88:1).
5. **`--border-default`**: limo puro no llega a 3:1 para componentes UI; se usa limo-700 (3,76:1) y limo se reserva a divisores decorativos.
6. **Radios**: se eliminaron las cápsulas `999px` de pestañas y pills (pasan a 6px); 9999px solo en circulares (puntos de estado, spinners, avatares).
7. **Mojibake**: se corrigieron erratas de codificación (UTF-8 doblemente codificado) en 160+ archivos. Es corrección de erratas evidentes, autorizada por el brief. Afectaba a copy visible ("Legislacií³n", "CÃ³mo funciona", "espaí±ola"…).

## 6. Verificación

### axe-core (WCAG 2.0/2.1/2.2 A+AA, viewport 1440)

| Ruta | Antes (producción) | Después (local) |
| --- | --- | --- |
| `/` | 1 violación (16 nodos de contraste) | **0** |
| `/urbideas` | 1 (16 nodos) | **0** |
| `/urbideas/municipios` | 2 (contraste 16 + selects sin nombre ×3) | **0** |
| `/urbideas/mapa` | 1 (target-size ×4) | **0** |
| `/urbideas/legislacion` | 2 (contraste + target-size) | **0** |
| `/socideas` | 1 (16 nodos) | **0** |
| `/socideas/como-funciona` | 1 (31 nodos) | **0** |
| **Total** | **9 violaciones / 90 nodos** | **0** |

Datos completos: `design-audit/before/axe.json` y `design-audit/after/axe.json`.

### Capturas

`design-audit/before/` (21 capturas de producción) y `design-audit/after/` (21 capturas locales), en 375, 768 y 1440 px por ruta (7 rutas). Formato JPEG (full page en 375, viewport en 768/1440).

> Nota técnica: en las capturas `fullPage` de Chromium pueden aparecer huecos en secciones con `position: sticky` (header) o reveals; la sección se verificó por separado (`design-audit/after/home-375-banda.jpg`) y mediante inspección del DOM (`data-visible="true"`, `opacity: 1`). Es un artefacto de la herramienta de captura, no del render.

### Build

`npm run build` compila sin errores ni warnings nuevos de TypeScript/ESLint en cada iteración.

## 7. Pendientes que requieren decisión humana

1. **Logo negativo/monocromo**: no existe en `/public/logo` una versión para fondo oscuro; el footer usa wordmark tipográfico. Pendiente de recibir el activo.
2. **Lighthouse móvil**: no ejecutado en este entorno (no hay Lighthouse ni Chrome canónico instalados; sólo Edge y disco limitado). Comando propuesto una vez disponible: `npx lighthouse https://urb-ideas.vercel.app/urbideas/mapa --form-factor=mobile --only-categories=performance,accessibility --view`. El rediseño reduce JS (se eliminó el parallax y su listener) y no añade dependencias de runtime, por lo que no se espera regresión >5 puntos.
3. **Iconografía**: no se migró a `lucide-react` (dependencia nueva). Se normalizó trazo 1,5 y tamaños 16/20/24 en los componentes tocados; el resto conserva SVG inline. Decisión pendiente: adoptar lucide o mantener inline.
4. **Generación backend de expediente/dictamen**: `/api/dictamen/pdf`, `/word`, `/paquete` generan documentos en servidor (pdf-lib); no se tocaron (fuera del alcance visual del front).
5. **Copy mejorable detectado** (no modificado, según el brief): "Registro Urbanístico España v1.0" (sustituido por contenido corporativo en el footer consolidado), descripciones de módulos con frases muy largas, uso de "dashboard" en el Header legado (componente sin uso tras la reestructuración).
6. **Pasada fina de dominio**: `urbideas/mapa` (panel lateral y controles), `admin`, `api-docs` y bloques internos de la ficha SOCideas heredan tokens vía remapeo, pero no han recibido una revisión componente a componente.
7. **Panel lateral del mapa**: el brief pide panel plegable 360–400 px y bottom sheet móvil; hoy el layout conserva su estructura original con el nuevo estilo. Requiere rediseño estructural (afecta a interacción, no a lógica de datos).

## 8. Herramientas dejadas en el repositorio

- `design-audit/00-auditoria.md` — auditoría de Fase 0.
- `design-audit/INFORME.md` — este informe.
- `design-audit/verify-contrast.mjs` — generador de escalas OKLab y verificador WCAG.
- `design-audit/capture.mjs` — capturas + axe (requiere `playwright-core` y `axe-core`; `playwright-core` se instaló con `--no-save`).
- `design-audit/before/` y `design-audit/after/` — capturas y resultados axe.
