# Fase 1.1 — Navegación interna de URBideas

Fecha: 2026-09-03 · Rama: `feat/ideas-sostenibilidad-phase-1-1` (base: `feat/ideas-sostenibilidad-phase-1`)

## 1. Problema original

En la Fase 1, `/urbideas/*` eran `rewrites` hacia los ficheros históricos
(`/mapa`, `/municipios`, …), que importan y renderizan directamente el `Header`
histórico. El rewrite no cambia qué componente se renderiza, así que el módulo
mostraba la navbar genérica en lugar de una navegación propia de URBideas.

## 2. Estrategia implementada

**Migración real con compatibilidad inversa** (se descartó un Header
"consciente del pathname": con rewrites el `usePathname` del cliente es
ambiguo y el Header legacy debe seguir intacto para `/admin`):

- Las páginas viven ahora en rutas canónicas
  `src/app/urbideas/{mapa,municipios,municipios/[codigoINE]/legislacion,legislacion,api-docs}/page.tsx`
  (movidas con `git mv`; sin layouts intermedios, imports con alias `@/`,
  sin metadatos por página: riesgo bajo).
- `next.config.ts`: las rutas históricas (`/mapa`, `/municipios/:path*`,
  `/legislacion`, `/api-docs`) son ahora alias por rewrite interno (200, sin
  redirección, sin bucles, query intacta) hacia las canónicas.
- Nuevo `src/components/platform/UrbideasHeader.tsx`: marca predominante
  **URBideas**, franja superior discreta con retorno a **IDEAS Sostenibilidad
  → /**, nav del módulo con prefijo `/urbideas`, menú móvil con cierre por
  enlace y tecla Escape, `aria-current="page"`, focos visibles y un solo
  `<header>` por página. Diferenciación visual: franja de retorno a plataforma
  + borde inferior en color secundario + pastilla de marca "U".
- Las páginas migradas usan `UrbideasHeader` y conservan el `Footer` legacy
  (coherencia visual; sus enlaces históricos siguen resolviendo vía rewrite).
- Enlaces internos actualizados al prefijo `/urbideas` en: `urbideas/page.tsx`,
  "Ver en mapa" (`municipios`), `TarjetaMunicipio`, `MunicipalTab` y
  breadcrumb de `[codigoINE]/legislacion`.
- `Header`/`Footer` legacy **intactos**: solo los usa ya `/admin` (las rutas
  históricas renderizan el componente canónico, luego muestran
  `UrbideasHeader`; contenido idéntico, cero URLs rotas).

## 3. Archivos

Creados: `src/components/platform/UrbideasHeader.tsx`,
`docs/urbideas-navigation-phase-1-1.md`.
Movidos: 5 `page.tsx` → `src/app/urbideas/...`.
Editados: `next.config.ts` (rewrites inversos), imports `<Header />` →
`<UrbideasHeader />` en las 5 páginas, enlaces en `urbideas/page.tsx`,
`urbideas/municipios/page.tsx`, `TarjetaMunicipio.tsx`, `MunicipalTab.tsx`,
`[codigoINE]/legislacion/page.tsx`, tabla de rutas en `README.md`.

## 4. Relación rutas nuevas ↔ históricas

| Ruta solicitada | Sirve | Cabecera |
|---|---|---|
| `/urbideas`, `/urbideas/mapa`, `/urbideas/municipios`, `/urbideas/municipios/*`, `/urbideas/legislacion`, `/urbideas/api-docs` | Componente canónico | `UrbideasHeader` |
| `/mapa`, `/municipios`, `/municipios/*`, `/legislacion`, `/api-docs` | Rewrite 200 al canónico | `UrbideasHeader` (mismo contenido) |
| `/` | Landing plataforma | `PlatformHeader` |
| `/admin` | Sin cambios | `Header` legacy |
| `/api/*` | Sin cambios | — |

## 5. Resultado de las pruebas

- `eslint` en archivos tocados: limpio. `tsc --noEmit`: limpio
  (nota: hubo que borrar `.next`, cuyo caché de tipos apuntaba a las rutas
  antiguas; es directorio ignorado, no afecta al repo).
- `npm run build`: correcto; rutas canónicas `/urbideas/*` generadas.
- Runtime (`next start`): 200 en `/`, `/urbideas`, las 4 secciones + anidada
  `28079/legislacion`, las 4 históricas, `/admin` y `/api/municipios?limit=1`
  (contrato intacto). 1 `<header>` por página, 1 `aria-current="page"` con
  enlace activo correcto (incluida anidada → Municipios), query
  `?lat&lng&zoom` preservada en `/urbideas/mapa`. Sin bucles ni doble header.

## 6. Limitaciones y pasos futuros

- Las páginas migradas heredan el título global (son client components sin
  metadatos propios); a futuro, añadir metadatos de módulo vía `layout.tsx`
  o conversión a server components.
- El `Footer` legacy en páginas del módulo enlaza a rutas históricas
  (compatibilidad deliberada: resuelven por rewrite). Si se quiere, crear un
  `UrbideasFooter` con prefijo `/urbideas`.
- `TarjetaMunicipio` enlaza a `/urbideas/municipios/[id]` pero no existe página
  de detalle por `id` (solo `[codigoINE]/legislacion`): enlace preexistente
  sin destino, componente sin usos. Decidir si se elimina o se crea la ficha.
- Migración definitiva: cuando se valide, convertir los rewrites históricos
  en redirects 308 hacia las canónicas y retirar el `Header` legacy salvo
  `/admin`.
