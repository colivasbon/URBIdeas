# Hito 0 — Preservación y diagnóstico

## Árbol

Rama `feat/incideas-hidrografia` sobre 2b5f137. Modificados: `MEMORIA.md`,
`package.json` (scripts Fase 2A/3), `src/components/socideas/SeccionesAtlas.tsx`
(ajeno previo: no se toca ni se commitea). Sin push, merge ni despliegue.
Existe otro árbol en `URBIdeas-incideas`: no se ha tocado.

## Fase 2A verificada antes de usarla

Módulos (`scripts/incideas/fase2a/`, 8 ficheros), pruebas 20/20, `tsc` y
`eslint` limpios, exportaciones reales (Benidorm 13 ficheros, Murcia 9) y sus
informes. Decisiones cerradas respetadas (partidas, bajas, libro 1.269/1.378,
punto municipal no sustituido, límite IGN 99,713 %).

## Medición (punto de partida)

Supabase (`urbideas`, plan free 500 MB): ~178 MB ocupados — `asociaciones`
126 MB, `data_sync_runs` 31 MB, resto fragmentado; tablas INCideas pequeñas.
R2 (`socideas-data`): 147.256 objetos / 2,97 GB (secciones 2,25 GB, v2
municipios 513 MB). Los 6,5 GB churn de sincronizaciones no se tocan.

## Línea base y recuentos reconciliados

Fase 2A: Benidorm WC 372/WL 150, Murcia WC 3.835/WL 1.864 (miembros del
servicio, no cauces). Exposición 451/1.111: ubicaciones puntuales sobre
inventario no auditado — no es porcentaje de afección. PATRICOVA: SHP por
tarea async, 3 productos no intercambiables, estudios = puntos. Contención
T vectorial pendiente (INSPIRE raster). Convertido en regresión:
`fase2a-contrato.test.ts` (20) + `incideas-fase3-muestra.test.ts` (8).
