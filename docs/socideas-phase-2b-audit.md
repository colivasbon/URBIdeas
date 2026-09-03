# Auditoría Fase 2B — SOCideas: economía, secciones censales y estética

Fecha: 2026-09-03 · Rama: `feat/socideas-phase-2a-1` (base) · Supabase: `urbideas` (`nkfepxuyrbcxolljykwk`, plan free 500 MB)
Sin commits, sin migraciones remotas, sin cargas, sin despliegues en esta fase salvo autorización expresa.

## 1. Estado actual de la arquitectura

- **Territorio**: `public.municipios` (8.130 filas, `codigo_ine character(5)` UNIQUE). Única fuente territorial. No se crea nada territorial nuevo.
- **Supabase SOCideas**: `statistical_sources` (catálogo, incluye `ine_tempus3`), `indicator_definitions` (8 indicadores demográficos, semilla 028), `municipal_indicator_values` (**vacía, legado sin escrituras** tras TRUNCATE autorizado), `data_sync_runs` (auditoría; `metadata.r2_key`).
- **R2**: bucket `socideas-data`, prefijo único `socideas/v2/municipios/{ine}.json` (~55 KB/municipio, ~0,5 GB total, 8.130/8.132 objetos). Lectura pública (`NEXT_PUBLIC_SOCIDEAS_R2_BASE`), escritura solo servidor/scripts (`R2_*`).
- **Envelope v2** (`src/lib/socideas-r2.ts`): `indicators[]`, `sources[]`, `source_urls[]`, `dimensiones[]`, `valores[][9]` = `[indIdx, anio, valor, unidad, dimIdx, urlIdx, tableId, serieId|null, estado]`. Lector v1+v2; ficha consume filas expandidas vía `expandV2Envelope`.
- **Demografía funcional**: DPOP op.22 (50 tablas provinciales `DPOP_PROVINCE_TABLES`), tabla 2853 (CCAA/España hasta 2021), tabla 33570 (pirámide hasta 2022). Sync 1 municipio/petición (`POST /api/socideas/sync/[codigoINE]`, token `x-sync-token`, lock 30 min), auto-refresh por novedad anual, re-batch con `scripts/sync-all-municipios.ts`.
- **Ficha** (`src/app/socideas/[codigoINE]/page.tsx`, server + `FichaFiltros` client): filtros por URL planos, gráficos SVG propios, tablas copiables, trazabilidad. Sin `?categoria=` todavía: la ficha actual es 100 % demográfica.
- **Estilos**: `globals.css` con variables CSS (`--color-*`, `--border-radius-*`, sombras, dark/light por `[data-theme]`), Tailwind v4 (`@import "tailwindcss"`, `@theme inline`). `PlatformHeader/Footer` compartidos. Sin librerías de gráficos (decisión vigente).

## 2. Componentes afectados por la Fase 2B

| Área | Archivos |
|---|---|
| R2 (lectura multi-fuente) | `src/lib/socideas-r2.ts` — **bug detectado**: `expandV2Envelope` usa siempre `sources[0]` e ignora el índice de fuente por valor. Con Demografía (1 fuente) es invisible; con Economía (4-5 fuentes) rompería la trazabilidad. Corrección obligatoria y retrocompatible. |
| Tipos/perfil | `src/lib/socideas.ts` (slugs economía), nuevo `src/lib/socideas-economia.ts` (constructor de perfil económico desde filas R2, sin self-fetch) |
| Adaptadores (solo servidor) | Nuevos: `src/lib/aeat-irpf.ts`, `src/lib/ine-adrh.ts`, `src/lib/ine-dirce.ts`, `src/lib/ine-censo-agrario.ts`; reutilizan patrón `ine-tempus.ts` (timeout 15 s + 1 reintento, `IneError`, validación de municipio/año/unidad) |
| Sync | Nuevo `src/lib/socideas-sync-economia.ts` (lee JSON v2 existente, extiende bloque economía, preserva demografía, escribe idempotente) + ruta `POST /api/socideas/sync-economia/[codigoINE]` (mismo token y lock) |
| Catálogo | Migración `029_socideas_economia_catalog.sql` **preparada, NO aplicada** (4 fuentes + ~20 indicadores; ver §7) |
| Ficha | `src/app/socideas/[codigoINE]/page.tsx` (parámetro `?categoria=demografia\|economia`, por defecto demografía), cápsula de categorías, nuevos componentes `src/components/socideas/Economia*` |
| Secciones | Nueva ruta `src/app/socideas/[codigoINE]/secciones-censales/page.tsx` + proxy servidor `GET /api/socideas/secciones/[codigoINE]` (INE OGC API Features/WFS con filtro por municipio; geometría solo bajo demanda) |
| Estética | `src/app/page.tsx`, `src/app/socideas/page.tsx`, ficha, `globals.css` (solo tokens), componentes plataforma. **URBideas intacto** salvo tokens compartidos seguros |
| Docs | Este archivo + `socideas-phase-2b-economic-sources.md` + `socideas-phase-2b-r2-schema.md` + `socideas-phase-2b-secciones-censales.md` + `socideas-phase-2b-performance.md` + `ideas-sostenibilidad-ui-audit-phase-2b.md` + `README.md` |

## 3. Formato exacto de JSON R2 que se mantendrá

Envelope v2 sin cambios incompatibles (detalle en `socideas-phase-2b-r2-schema.md`):

- Mismo objeto por municipio, misma clave `socideas/v2/municipios/{ine}.json`, `version: 2`.
- Economía = **nuevos `slugs`** en `indicators` + **nuevas entradas** en `sources` (AEAT, ADRH, DIRCE, Censo Agrario) + **nuevas dimensiones** (`sector`, `tipo_renta`, `especie`, `categoria_agraria`…) + **nuevas tuplas** en `valores`.
- Tupla de 9 posiciones intacta; URLs deduplicadas en `source_urls`; sin `fecha_referencia`/`municipio_codigo_ine`/`valor_texto` redundantes.
- `expandV2Envelope` corregido para resolver **la fuente por índice de cada tupla** (compatible con JSON existentes de 1 fuente).
- Presupuesto: ≤ ~150 KB adicionales por municipio (medido con `JSON.stringify().length` antes de `putMunicipioJson`); si se supera, se detiene y documenta.

## 4. Estado de la carga demográfica

8.130/8.132 JSON v2 en R2 (~0,5 GB). 2 códigos fantasma eliminados (Murcia/Ponferrada duplicadas). 1 partial legítimo (Usansolo). Lotes de carga en el PC del usuario (reanudables). **La sincronización económica debe preservar íntegramente este bloque**: lectura del envelope existente + fusión por `slug` de indicador (reemplazo solo de slugs económicos) + escritura idempotente. Si una fuente económica falla, se conservan los datos anteriores y el run queda `partial`/`error` sin tocar Demografía.

## 5. Riesgos

- **Compatibilidad**: lector v2 con varias fuentes (bug `sources[0]`). Mitigación: corrección + tests de expansión con envelope multi-fuente + lectura de JSON antiguos.
- **Tamaño JSON**: Censo Agrario municipal detallado puede disparar el tamaño (decenas de categorías × especies). Mitigación: selección agregada y trazable (5 categorías agrarias, 5 grupos ganaderos × 2 medidas), medición previa al guardado, tope 150 KB.
- **Rendimiento**: ficha hace 1 lectura R2 + 1-2 consultas Supabase (territorio, último run); Economía no añade lecturas (mismo JSON). Secciones: geometría solo bajo demanda vía proxy con filtro municipal (nunca capa nacional en el navegador).
- **Fuentes externas**: AEAT publica HTML + ficheros base (xlsx) por ejercicio, sin API JSON; automatización = descarga controlada en el sync (dependencia `xlsx` ya instalada). ADRH municipal = descargas CSV por tabla (no Tempus3 a nivel municipal; Tempus3 solo nacional/CCAA/provincia/islas, tabla 53688 verificada en vivo). DIRCE municipal = Tempus3 tabla 4721 (respuesta >5 MB sin filtro: obligatorio `tv=` por municipio). Censo Agrario 2020 = tablas jaxiT3 + CSV (estructural, año único). SEPE = CSV/XLS mensuales nacionales (~10 MB): **no se ingieren en 2B** (conector futuro documentado).
- **Cobertura**: AEAT solo municipios >1.000 hab. y territorio fiscal común (sin País Vasco/Navarra); ADRH Gini/P80P20 solo ≥100 residentes; DIRCE desglose por tamaño (<1.000 solo total); Censo Agrario umbral 5 ha SAU. Todo "sin dato" se muestra como estado, nunca como cero.
- **Interfaz**: no romper Demografía ni URBideas. Estrategia: pestaña `?categoria=` con valor por defecto, componentes nuevos aislados, tokens CSS existentes.

## 6. Estrategia de interfaz

- Cápsula Demografía/Economía (+ enlace "Secciones censales") en la cabecera de la ficha; URL canónica con `?categoria=`.
- Economía con jerarquía Contexto → Visión general → 5 subbloques autónomos → Pendientes (empleo, afiliación, presupuestos, ayudas, suelo industrial) con texto formal prescrito.
- Tarjetas de estado (`ok`/`partial`/`pending`/`error`) inequívocas y deliberadas; tablas copiables; SVG propios con leyenda/unidad/año; fuente+enlace+nota metodológica sin dominar la ficha.
- Estética global: sistema de roles de color sobre variables existentes, jerarquía tipográfica, landing menos "tres tarjetas iguales", buscador como foco, responsive + accesibilidad (foco visible, aria, tablas con scroll horizontal, sin color como único indicador).

## 7. Estrategia de pruebas

- `npm run lint` (archivos tocados), `npx tsc --noEmit`, `npm run build`. Sin tests en el repo (sin vitest/jest): verificación manual de rutas (§12 del encargo) + revisión de envelopes de prueba en memoria (nunca escritura remota sin autorización).
- Municipios de prueba (tras confirmar `codigo_ine` en `municipios`): La Roda (02069), Villarrobledo (02081), Albacete (02003), Sevilla (41091), Zaragoza (50297), Santiago (15078). Cubren grande/mediano/pequeño, con/sin cobertura AEAT (<1.000 hab. no aplica en la muestra; se probará el estado pendiente con un municipio foral o <1.000 hab. adicional si se autoriza).

## 8. Lista precisa de archivos previstos

Crear: `docs/socideas-phase-2b-*.md` (6), `docs/ideas-sostenibilidad-ui-audit-phase-2b.md`, `supabase/migrations/029_socideas_economia_catalog.sql` (preparada, no aplicada), `src/lib/aeat-irpf.ts`, `src/lib/ine-adrh.ts`, `src/lib/ine-dirce.ts`, `src/lib/ine-censo-agrario.ts`, `src/lib/socideas-sync-economia.ts`, `src/lib/socideas-economia.ts`, `src/app/api/socideas/sync-economia/[codigoINE]/route.ts`, `src/app/api/socideas/secciones/[codigoINE]/route.ts`, `src/app/socideas/[codigoINE]/secciones-censales/page.tsx`, `src/components/socideas/Economia*.tsx` (visión general, renta, desigualdad, empresas, agrario, ganadería, estado pendiente), `src/components/socideas/CategoryTabs.tsx`, `src/components/socideas/SeccionesMap.tsx`.
Modificar: `src/lib/socideas-r2.ts` (fix multi-fuente), `src/lib/socideas.ts` (slugs), `src/app/socideas/[codigoINE]/page.tsx` (categoría), `src/app/socideas/page.tsx`, `src/app/page.tsx`, `src/app/asistencias/page.tsx` (retoques), `src/app/globals.css` (tokens), `README.md`.
No tocar: `/admin`, APIs históricas, RLS, vistas, funciones, PostGIS, `.env.local`, `main`.
