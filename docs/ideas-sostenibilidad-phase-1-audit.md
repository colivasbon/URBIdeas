# Auditoría Fase 1 — IDEAS Sostenibilidad (repositorio URBIdeas)

Fecha: 2026-09-03 · Rama: `feat/ideas-sostenibilidad-phase-1` · Base: `main` (46a5cc8)

## 1. Resumen del estado actual

Aplicación Next.js 16.3.3 (React 19) de consulta urbanística nacional: visor de mapa con
dictamen territorial (dibujar → cruzar → dictaminar → descargar PDF/Word/paquete), buscador
de municipios (8.132 municipios con código INE, provincia, CCAA, población y geometría según
contexto del encargo), legislación en 4 capas (estatal / autonómico / municipal / geoespacial),
panel `/admin` de gestión de fuentes y `/api-docs` con documentación REST. Estilo propio con
CSS variables (`globals.css`) + Tailwind v4, tema claro/oscuro, Leaflet + react-leaflet para
mapas. Sin autenticación visible en `/admin` (página `client` que lee Supabase directamente):
riesgo a revisar antes de exposición pública, pero fuera del alcance de esta fase.

## 2. Framework, dependencias y ejecución

- `package.json`: `next 16.3.3`, `react 19.2.8`, `leaflet 1.9.4`, `react-leaflet 5`,
  `@supabase/ssr 0.12.5`, `@supabase/supabase-js 2.112.4`, `@turf/turf 7`, `tailwindcss 4`,
  `typescript 5`, `eslint 9` + `eslint-config-next`.
- Scripts: `dev` / `build` / `start` / `lint` (`eslint` sin args → lint de todo el proyecto).
  No hay script `typecheck` dedicado; se usa `npx tsc --noEmit`. No hay tests (sin vitest/jest).
- Variables (`/.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`. Existe `.env.local` en local (no se toca, no se commitea).
- Despliegue: `vercel.json` mínimo (`{ framework: nextjs }`); `render.yaml` solo para scraper
  mensual (`urbideas-scraper`, `npm run build:scraper` + `node scripts/runner.js`), no afecta al front.
- `next.config.ts`: solo `transpilePackages: [leaflet]` + `images.remotePatterns`
  (OSM, ign.es, arcgisonline). Sin `redirects` ni `rewrites` previos.
- `AGENTS.md`: bloque auto-generado de Next.js (no tocar).

## 3. Estructura de rutas existente (`src/app`)

| Ruta | Tipo | Notas |
|---|---|---|
| `/` (`page.tsx`, server) | Pública | Dashboard URBideas: `getStats()` (5 counts Supabase con service_role) + HeroParallax + stats bar + accesos a Municipios/Mapa/Legislación/API. Usa `Header` + `Footer` legacy. |
| `/mapa` (`page.tsx`, client, ~1000 líneas) | Pública | Visor Leaflet (dynamic ssr:false), cruce WMS, dictamen vía `/api/dictamen`, descargas. Lee/escribe `?lat&lng&zoom&capas&base&opacity&ambito` con `window.history.replaceState` usando `window.location.pathname` → compatible con rewrites. |
| `/municipios` + `/municipios/[codigoINE]/legislacion` | Pública | Filtro en cascada CCAA→provincia→municipio, comparador (hasta 10), ficha con planeamiento (`/api/planeamiento`), normativa (`/api/legislacion-aplicable`), capas (`/api/capas-aplicables`). Enlace interno `Ver en mapa` usa `/mapa?layers=...` absoluto. |
| `/legislacion` (client, tabs) | Pública | Estatal hardcodeado (15 leyes + 3 fuentes geo), autonómico vía `/api/legislacion?ambito=autonomico`, municipal vía `MunicipalTab`, geoespacial estático. |
| `/api-docs` (client) | Pública | Documentación de 7 endpoints. |
| `/admin` (client) | Supuestamente protegida, **sin guard de auth en código** | Lee `/api/fuentes`, `/api/capas-wms` + Supabase client directo (`municipios`, `normativa_vigente`, `geo_services`, `legal_sources`). Usa `Header`/`Footer` legacy. |
| `/api/*` (23 routes) | Técnicas | `municipios`, `municipios/[id]`, `busqueda`, `planeamiento`, `legislacion`, `legislacion-aplicable`, `capas-wms`, `capas-aplicables`, `fuentes`, `provincias`, `comunidades`, `comparar`, `export`, `territorio`, `catastro`, `siu`, `dictamen` (+`pdf`/`word`/`paquete`), `estado-servicios`, `directorio-ayuntamientos`, `wms-proxy`. Ninguna bajo grupo de ruta; todas absolutas `/api/...`. |

Componentes: `layout/Header` (nav: Dashboard, Municipios, Mapa, Legislación, API, Admin; logo Ideas Medioambientales; ThemeToggle; menú móvil), `layout/Footer` (Plataforma + aviso legal + copyright dinámico), `ui/*` (Badge, Button, Card, Input, Modal, Select, ThemeProvider, ThemeToggle, HeroParallax), `mapa/*` (VisorMapa, ControlCapas, FileLayerPanel…), `filtros/*`, `datos/MunicipalTab`, `admin/*`.
Lib: `supabase.ts` (anon, client), `supabase-server.ts` (service_role, solo server), `ambito`, `cruce`, `dictamen`, `familias`, `siu`, `getfeatureinfo`, `salida`, `tipos`.
`src/types/external.d.ts` solo declaraciones externas. `public/logo/` con logo corporativo.
`supabase/migrations/`: 001–026 (extensiones, CCAA, provincias, municipios, instrumentos,
normativa, capas WMS, geoportales, geo_services, legal_sources, capas familias, limpieza,
seeds, expedientes, resolver territorio…). **No se toca nada en esta fase.**

## 4. Rutas públicas vs protegidas

Todo es público en la práctica. `/admin` no tiene middleware, ni `proxy.ts`, ni check de
sesión/rol en su `page.tsx`: cualquier visitante puede abrir el panel (solo lectura en el
código actual, sin mutaciones). No existe `middleware.ts`. Conclusión: en Fase 1 `/admin`
se deja exactamente como está, sin exponerlo más (no se añade a la navegación de la
landing ni a alias `/urbideas/*`).

## 5. Integraciones Supabase

- Server (`/`, APIs): `createSupabaseServer()` con `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS).
  Tablas leídas: `municipios`, `instrumentos_planeamiento`, `capas_wms`, `legal_sources`,
  `geo_services`, `normativa_vigente`, `provincias`, `comunidades_autonomas`, etc.
- Client (`/admin`, `/municipios` dynamic map no, admin sí): `supabase` anon key directo.
- Sin Supabase Auth en el código inspeccionado; RLS no auditado en esta fase por prohibición
  expresa de cambios. Cualquier nueva lectura en landing debe evitar service_role si es
  posible; la landing nueva no consultará Supabase para no acoplar disponibilidad del portal
  a la BD.

## 6. Referencias visibles y técnicas a URBideas

Técnicas (25 matches `grep`): `package.json`/`package-lock.json` (`urbideas-app`),
`render.yaml` (`urbideas-scraper`), README (`urbideas-registro`, `URBIdeas`, `urbideas.vercel.app`),
`lib/ambito.ts` (`urbideas:ambitos:v1` en localStorage), `lib/familias.ts` (comentario),
`lib/siu.ts` + `api/catastro` + `api/estado-servicios` + `api/wms-proxy` (`User-Agent: URBIdeas/1.0`),
`ui/ThemeProvider.tsx` (`urbideas-theme`), `globals.css` + 3 componentes mapa (`.urbideas-popup`),
`api/dictamen/pdf` + `paquete` (pie `Urbideas — …`), script local con ruta Windows absoluta.
Visibles en UI actual: casi ninguna literal "URBideas" (la home dice "Área de urbanismo /
Ideas Medioambientales" y "Registro Urbanístico de España"); Footer dice
"Registro Urbanístico España v1.0". **Decisión: no renombrar claves técnicas
(localStorage, CSS, User-Agent) en Fase 1** para no romper sesiones/descargas/estilos;
solo se añade marca nueva en páginas nuevas + metadatos.

## 7. Riesgos de mover URBideas bajo `/urbideas`

1. **Rotura de imports/layouts**: mover `mapa/page.tsx` (1000+ líneas, dynamic imports,
   `Header`/`Footer` relativos por alias `@/`) es mecánicamente seguro con alias, pero
   cualquier `layout.tsx` intermedio cambiaría el contexto del visor.
2. **URLs absolutas internas**: `/mapa?layers=…` (municipios), `fetch("/api/…")` (estable),
   `window.location.pathname` en mapa (compatible con rewrite, pero un `redirect` 308 con
   query perdería estado del ámbito si no se preserva).
3. **Bucles de redirección**: ` / ↔ /urbideas` si se define mal `redirects`.
4. **SEO/ranking**: cambiar `/` sin mantener contenido URBideas accesible rompería enlaces.
5. **`/admin` y `/api/*`**: moverlas rompe contratos y expone admin.
6. **Hidratación**: el mapa es `client` + `dynamic(ssr:false)`; envolverlo en un layout
   server nuevo con metadatos es seguro, pero duplicar el componente en dos rutas
   duplica bundles y estados de localStorage.

## 8. Estrategia elegida (conservadora, resultado visible garantizado)

**Preservar + alias por `rewrites`, sin mover archivos existentes:**

- No se mueve ningún archivo de `mapa/`, `municipios/`, `legislacion/`, `admin/`,
  `api-docs/`, `api/`. Cero riesgo de regresión en visor, comparador, normativa y APIs.
- `/urbideas` (nuevo) = home del módulo: reutiliza el contenido actual de `/` (stats +
  hero + accesos) adaptado con navegación de plataforma. Es la única página con
  `getStats()` además de la landing (que será estática).
- `next.config.ts → rewrites`: `/urbideas/mapa` → `/mapa`,
  `/urbideas/municipios` → `/municipios`, `/urbideas/municipios/:path*` → `/municipios/:path*`,
  `/urbideas/legislacion` → `/legislacion`, `/urbideas/api-docs` → `/api-docs`.
  Así ambas URL sirven el mismo componente sin duplicar código ni romper `fetch("/api")`.
  Sin `redirects` (200 rewrite, no 308): no hay bucles ni pérdida de query; las rutas
  históricas siguen operativas tal cual exige el encargo.
- `/admin` y `/api/*` **sin alias ni cambios**. `/admin` no se enlaza desde la landing.
- Nuevos componentes compartidos `src/components/platform/*` (PlatformHeader,
  PlatformFooter, ModuleCard) solo usados por `/`, `/urbideas`, `/socideas`, `/asistencias`.
  `Header`/`Footer` legacy intactos para las rutas históricas.
- Metadatos globales → portal IDEAS Sostenibilidad; cada módulo declara los suyos propios
  en su `page.tsx`/`layout`.

## 9. Comprobaciones funcionales obligatorias al terminar

`/` · `/urbideas` · `/socideas` · `/asistencias` · `/urbideas/mapa` (rewrite) ·
`/mapa` · `/municipios` · `/urbideas/municipios` · `/legislacion` ·
`/urbideas/legislacion` · `/api-docs` · `/admin` (solo carga, sin cambiar permisos) ·
muestreo API (`/api/municipios?limit=1`, `/api/legislacion?ambito=autonomico`,
`/api/capas-wms`, `/api/estado-servicios`) sin cambiar contratos ·
`npm run lint` · `npx tsc --noEmit` · `npm run build` · sin errores de hidratación/consola ·
sin bucles ni enlaces rotos · responsive + teclado + contraste.
