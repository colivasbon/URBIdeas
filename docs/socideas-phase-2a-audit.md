# Auditoría Fase 2A — SOCideas: base de datos, INE y ficha municipal

Fecha: 2026-09-03 · Rama: `feat/socideas-phase-2a` (base: `feat/ideas-sostenibilidad-phase-1-1`,
commit `8aedf47`) · Supabase: `urbideas` (`nkfepxuyrbcxolljykwk`)

## 1. Arquitectura actual relevante

- **Next.js 16.3.3 + React 19**, App Router. Sin librería de gráficos
  (no hay recharts/chart.js en `package.json`): los gráficos se harán con SVG
  propio (línea, barras, pirámide), sin dependencias nuevas.
- **Supabase**: `src/lib/supabase.ts` (anon, cliente) y
  `src/lib/supabase-server.ts` (`createSupabaseServer()` con
  `SUPABASE_SERVICE_ROLE_KEY`, solo servidor). Las rutas API usan el server
  client; `/admin` y partes de `/municipios` usan anon directo.
- **Sin autenticación efectiva**: no hay Supabase Auth ni middleware en el
  código. `/admin` no tiene guard. Decisión: tablas SOCideas nuevas con RLS
  activo y **sin políticas públicas** (denegación por defecto); lectura y
  escritura solo vía servidor (`service_role`). La ruta de sync se protege con
  token (`SOCIDEAS_SYNC_TOKEN`, solo servidor, 401 sin él).
- **Búsqueda municipal existente**: `GET /api/busqueda?q=&limit=` devuelve
  municipios con `id, nombre, codigo_ine, poblacion, provincia(+CCAA)`; patrón
  de respuesta `{ data, error, count }` + `X-RateLimit-*`. Se reutiliza el
  patrón para `/api/socideas/municipios` (solo municipios + filtros por
  provincia/código INE).
- **Tipado**: interfaces TS en `src/lib/types.ts` (estilo `snake_case` de BD);
  se añade `src/lib/socideas.ts` con tipos SOCideas.
- **Estados carga/error**: precedente en `[codigoINE]/legislacion` (spinner +
  bloque de error + enlaces de retorno). Se replica el patrón.
- **Tabla base**: `public.municipios` (8.132 filas, `codigo_ine char`,
  `provincia_id → provincias → comunidades_autonomas`, `poblacion`, `geom`
  PostGIS). Única fuente territorial; sin duplicar.
- **Enlace SOCideas → URBideas**: `/urbideas/mapa` solo consume
  `?lat=&lng&zoom…` (`readUrlParams`); los params `layers/center` del enlace
  "Ver en mapa" no tienen consumidor (preexistente, fuera de alcance). La ficha
  calculará el centroide en servidor (`ST_Centroid`) y enlazará
  `/urbideas/mapa?lat=..&lng=..&zoom=12` (mecanismo real existente).

## 2. Riesgos

1. **Mapeo INE erróneo** (tabla/variable equivocada → datos falsos). Mitigación:
   verificación en vivo de cada tabla Tempus3 (municipio, año, unidad, sexo,
   edad) antes de persistir el mapeo; URLs y `series_id` guardados por valor.
2. **Cobertura desigual**: extranjeros/migraciones pueden no existir a nivel
   municipal en Tempus3. Regla: si no hay cobertura verificada, bloque en
   estado "pendiente", nunca inventado.
3. **Densidad sin superficie validada**: `municipios` no tiene superficie.
   Si Tempus3/INE no ofrece superficie municipal verificada, densidad queda
   "Pendiente de integración de fuente de superficie".
4. **Sync concurrente/duplicada**: lock por `(municipio, indicador)` vía
   `data_sync_runs` en estado `running` + índice único anti-duplicados.
5. **RLS**: no tocar tablas existentes. Tablas nuevas: RLS desde migración,
   sin políticas anon/authenticated (lectura vía servidor). El `201`/`401` del
   sync no debe filtrar secretos.
6. **Volumen**: prohibida la sincronización masiva (8.132). Solo 1 municipio
   por petición, con timeout + reintentos limitados.
7. **Derivados sin base**: variaciones 5/10 años e índices solo si existen los
   años/grupos necesarios; si no, se omite el derivado con aviso.

## 3. Estrategia elegida

- Migraciones locales `027_socideas_core.sql` (esquema + RLS + índices) y
  `028_socideas_catalog_seed.sql` (fuente `ine_tempus3` + 8 indicadores),
  **preparadas pero NO aplicadas** (requiere autorización expresa).
- `src/lib/ine-tempus.ts`: adaptador servidor (timeout 15 s, 2 reintentos,
  validación de municipio/año/unidad, errores a `data_sync_runs`).
- Rutas: `GET /api/socideas/municipios` (búsqueda),
  `GET /api/socideas/perfil/[codigoINE]` (lectura Supabase + derivados),
  `POST /api/socideas/sync/[codigoINE]` (token, 1 municipio, registra run).
- UI: `/socideas` (hub + buscador + nota de fuentes) y
  `/socideas/[codigoINE]` (4 bloques + trazabilidad), gráficos SVG propios,
  `PlatformHeader/Footer` (sin navbar URBideas), responsive + `aria`.
- Pruebas: La Roda (02069, Albacete, CLM) + 3 municipios de CCAA distintas
  tras verificar `codigo_ine` en `municipios`. Sync real pendiente de
  autorización de migración.

## 4. Archivos previstos

Crear: `027_*`, `028_*`, `docs/socideas-phase-2a-audit.md` (este),
`docs/socideas-data-architecture.md`, `docs/socideas-security-phase-2a.md`,
`docs/socideas-ine-integration.md`, `src/lib/ine-tempus.ts`,
`src/lib/socideas.ts`, `src/app/api/socideas/municipios/route.ts`,
`src/app/api/socideas/perfil/[codigoINE]/route.ts`,
`src/app/api/socideas/sync/[codigoINE]/route.ts`,
`src/app/socideas/[codigoINE]/page.tsx`,
`src/components/socideas/*` (SearchMunicipios, StatCard, LineChart,
PyramidChart, TraceabilityBlock, SyncState).
Modificar: `src/app/socideas/page.tsx` (hub), `.env.example`
(`SOCIDEAS_SYNC_TOKEN`), `README.md` (sección beta).

## 5. Plan de pruebas

lint + `tsc --noEmit` + `build`; runtime: `/`, `/socideas`,
`/socideas/02069` (tras migración+sync autorizados), `/urbideas`,
`/urbideas/mapa`, `/municipios`, `/admin`, `/api/municipios?limit=1`,
`GET /api/socideas/municipios?q=roda`, `POST /api/socideas/sync/02069`
sin token → 401, con token → resumen seguro. Comparativas
provincia/CCAA/España: cálculo desde valores INE si la tabla lo permite;
si no, solo ámbito municipal con nota (sin inventar agregados).

## 6. Limitaciones conocidas

- Sin Auth efectiva: beta interna vía servidor; nada público nuevo.
- Tempus3 puede no cubrir extranjería/migración municipal → bloques
  pendientes, no ficticios. Comparativas y superficie sujetas a cobertura
  verificada. Años de referencia distintos por indicador (no contemporaneizar).
