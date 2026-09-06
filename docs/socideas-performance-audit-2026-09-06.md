# Auditoría de rendimiento SOCideas — 2026-09-06

Rama: `feat/socideas-economia-phase-2c` · HEAD de partida: `d17b954`.
Solo lectura; sin métricas inventadas (no se ha medido con profiler ni con red real).

## A1. Client Components (`"use client"` en `src/components/socideas/`)

- `SocideasSearch.tsx:1`, `FichaFiltros.tsx:1`, `EconomiaFicha.tsx:1`,
  `CategoryTabs.tsx:1`, `MunicipioLoadingOverlay.tsx:1`, `SeccionesMap.tsx:1`,
  `CopyTableButton.tsx:1`.
- Sin directiva (Server Components puros): `EvolutionChart.tsx`,
  `PyramidChart.tsx`, `StatCard`, `StatusCard`, `Traceability`. Ojo: los que
  importa un Client Component (`EvolutionChart`, `PyramidChart`, `StatCard`,
  `Traceability` desde `FichaFiltros`/`EconomiaFicha`) viajan igualmente en el
  bundle cliente de la ficha.

## A2. Librerías pesadas en el bundle inicial

- **No hay `recharts` en el repositorio.** `EvolutionChart` (SVG propio,
  91 líneas) y `PyramidChart` (barras CSS, 54 líneas) son cero dependencias.
- **No hay `xlsx` en cliente.** `xlsx` solo se importa en libs de servidor
  (`lib/aeat-irpf.ts:12`, `lib/sepe-paro.ts:6`, `lib/tgss-afiliacion.ts:6`),
  usadas por la ruta de sync y scripts. No entra en ningún bundle cliente.
- **Leaflet no está en la ficha.** `SeccionesMap.tsx:56` lo importa con
  `await import("leaflet")` y `SeccionesMap` solo lo importa
  `app/socideas/[codigoINE]/secciones-censales/page.tsx:6`. La ficha
  (`app/socideas/[codigoINE]/page.tsx`) no lo importa ni lo hidrata.
- **GeoJSON:** solo se descarga tras pulsar "Cargar"
  (`SeccionesMap.tsx:37-50`); no hay fetch en montaje ni `IntersectionObserver`.
- Conclusión: `next/dynamic` sobre los gráficos no ahorra peso (son ~2-3 KB
  sin dependencias) y empeoraría la primera pintura (skeleton + waterfall).
  No se aplica; se documenta el porqué.

## A3. Categorías Demografía / Economía

- Selección en `app/socideas/[codigoINE]/page.tsx:125`:
  `?categoria=economia` → economía; cualquier otro valor → demografía
  (defecto). `CategoryTabs.tsx:22-27` conserva el resto de query params,
  usa `<Link>` (historial del navegador intacto) y `role="tab"` con
  `aria-selected`.
- Solo la categoría activa se obtiene (`page.tsx:127`: `getEconomia` solo si
  `categoria === "economia"`) y solo la activa se renderiza/hidrata
  (`page.tsx:210-240`, ramas excluyentes). **No hay montaje simultáneo.**
- Se serializa el perfil completo de la categoría activa, que sí se usa
  (`FichaFiltros` deriva tablas/gráficos en cliente desde `initial.valores`;
  `EconomiaFicha` igual). No hay datos de la categoría inactiva en el HTML.
- La pestaña de secciones es un enlace a ruta aparte
  (`CategoryTabs.tsx:46-52`), no un tab montado.

## A4. Fetches duplicados

- Ficha: `filtrosIniciales` (`page.tsx:59-88`) llama a `getPerfil` dos veces
  (base para años disponibles + perfil filtrado con `autoRefresh: true`).
  La lectura R2 pesada está deduplicada por `React.cache`
  (`socideas-r2.ts:212`); **pero** las consultas Supabase (`municipios` +
  `rpc get_municipio_coords`) se repiten, y `generateMetadata` (`page.tsx:90`)
  añade una tercera consulta de `municipios`. Además `autoRefresh`
  (`socideas-perfil.ts:232-247`) puede llamar al INE (Tempus3) en la segunda
  pasada. Es el principal coste de primera visita junto al JSON R2.
- No hay `useEffect` que re-fetchee al cambiar de pestaña: el cambio de
  categoría es navegación servidor nueva. `SocideasSearch` blinda la doble
  navegación con el flag `abriendo` (+ desbloqueo a los 10 s si falla,
  `SocideasSearch.tsx:95-99`) y usa `router.push` o `<Link>`, no ambos.
- `/api/socideas/perfil/[codigoINE]` no tiene consumidores en `src`
  (la página usa el lib directamente). Se deja intacta (fuera de alcance).

## A5. Respuesta de `/api/socideas/municipios`

- Rama de búsqueda ya devuelve forma mínima
  (`route.ts:150-155`): `codigo_ine, nombre, poblacion, provincia.nombre,
  provincia.comunidad_autonoma.nombre`. Sin IDs internos (`prov_ine` se
  excluye explícitamente).
- Rama exacta (`codigo_ine` / `provincia_id`, `route.ts:107-120`) devuelve
  las filas crudas de Supabase con el mismo juego de campos visibles, sin
  IDs internos. `poblacion` viaja aunque `SocideasSearch` no la pinta
  (se conserva por compatibilidad; es un escalar).
- Único consumidor en `src`: `SocideasSearch.tsx:54,117`. Filtros
  provincia/CCAA intactos si se mantiene la forma.
- Cabeceras CDN solo en 200 (`route.ts:97,119,125,156`); 400/500 sin caché.

## A6. R2 y Data Cache

- Lectura con `next: { revalidate: 3600, tags: [socideas-muni-<ine>] }`
  (`socideas-r2.ts`), fallback v2→v1, timeout 15 s con `AbortController` +
  `clearTimeout` en `finally`, `React.cache` por request. `PUT` fija
  `CacheControl: public, max-age=86400` en el objeto.
- **Riesgo confirmado (fuente: `node_modules/next/dist/server/lib/patch-fetch.js`,
  `createCachedDynamicResponse`/`createCachedPrerenderResponse`): Next
  persiste cuerpo + estado de la respuesta con `next.revalidate/tags` **sin
  distinguir estado HTTP**. Un 404 (municipio aún no sincronizado) quedaría
  servido desde Data Cache hasta 1 h. Los timeouts/aborts lanzan excepción
  antes de responder y no se cachean.
- Mitigación prevista en FASE B: sonda `HEAD` con `cache: 'no-store'` antes
  del `GET` cacheado; solo los 200 llegan a Data Cache. El hot-update ya
  purga con `revalidateTag(tag, { expire: 0 })`, que también cubre el caso
  "404 cacheado → municipio sincronizado por batch".

## A7. Secciones censales

- Filosofía confirmada: descarga solo con clic explícito. No se añade
  `IntersectionObserver` ni auto-fetch (alteraría la hidratación inicial).
- `SeccionesMap` no se importa en la ficha; placeholder ligero en `idle`
  (`SeccionesMap.tsx:94-110`), estado `cargando` con `role="status"`
  (`SeccionesMap.tsx:111-115`) y error recuperable con reintento
  (`SeccionesMap.tsx:116-129`). La ruta proxy valida el INE (400), verifica
  el municipio en Supabase (404) y responde 502 si el INE falla.

## A8. Decisiones de FASE B (cambios seguros)

1. Normalizar la rama exacta de `/api/socideas/municipios` a la misma forma
   mínima que la búsqueda (mismos campos, sin IDs internos).
2. Sonda `HEAD` `no-store` en `fetchR2Key`: los 404 no llegan a Data Cache.
3. Logs `console.debug` solo en desarrollo (`NODE_ENV !== 'production'`):
   duración/estado/bytes de lectura R2, duración/colección/n de secciones.
   Sin tokens, URLs firmadas, contenidos ni datos personales.
4. No se toca: `force-dynamic` de la ficha, overlay, anti-doble navegación,
   gating `NEXT_PUBLIC_SOCIDEAS_INTERNAL`, `SOCIDEAS_SYNC_TOKEN`, parsers,
   migraciones, contratos R2 ni apariencia.
