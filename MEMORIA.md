# MEMORIA — Proyecto IDEAS Sostenibilidad / URBIdeas / SOCideas

> Documento de transferencia de contexto para nuevas conversaciones con el
> agente. Última actualización: 2026-09-03. Rama activa: `feat/socideas-phase-2a-1`
> (sincronizada con origen). `main` intacto. **NUNCA hay secretos en este
> fichero**: viven solo en `.env.local` (gitignored) y en Vercel.

## 1. Qué es esto

- **IDEAS Sostenibilidad**: plataforma del Área de Sostenibilidad de Ideas
  Medioambientales (`/`). Módulos: **URBideas** (`/urbideas`, análisis
  territorial/urbanístico/geoespacial) y **SOCideas** (`/socideas`,
  caracterización sociodemográfica municipal, beta interna Fase 2A/2A.1),
  más **Asistencias** (landing futura).
- Stack: Next.js 16.3.3 + React 19 + Tailwind 4 + Leaflet, Supabase
  (Postgres+PostGIS), Cloudflare R2 (datos masivos), Vercel (despliegue).
- Repo `colivasbon/URBIdeas`. Ramas: `main` + `feat/ideas-sostenibilidad-phase-1`
  + `feat/ideas-sostenibilidad-phase-1-1` + `feat/socideas-phase-2a` +
  `feat/socideas-phase-2a-1` (trabajo actual).

## 2. Infraestructura y accesos (sin secretos)

- **Supabase proyecto `urbideas`**, id `nkfepxuyrbcxolljykwk`, org
  `kqckqonwqtyzlmfjxbeu`, región eu-west-1, **plan free (500 MB)**.
  BD actual ~27–41 MB. Tablas base: `municipios` (8.130 tras limpiar 2
  duplicados), `provincias` (50), `comunidades_autonomas` (17), `capas_wms`,
  `legal_sources`, `geo_services`, etc. SOCideas: `statistical_sources`,
  `indicator_definitions`, `municipal_indicator_values` (**vacía desde el
  TRUNCATE, legado**), `data_sync_runs` (auditoría de syncs).
- **Cloudflare R2**: cuenta con OAuth wrangler (`wrangler login` hecho),
  bucket **`socideas-data`** (WEUR), URL pública
  `https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev`, claves S3 en
  `.env.local` (`R2_*`). Grueso: `socideas/v2/municipios/{ine}.json`
  (~55 KB c/u tras formato v2; v1 borrados).
- **Vercel**: CLI autenticada (`colivasbon-3540`, proyecto `urb-ideas`,
  repo vinculado en `.vercel/`). Env R2 puestas en Preview+Production por CLI.
  Las previews tienen **protección con login** (no tocar). Hubo que
  redesplegar tras añadir env `NEXT_PUBLIC_*` (se fijan en build).
- MCPs disponibles: supabase (lectura/escritura SQL, migraciones, advisors),
  vercel (limitado: no veía equipos; la CLI sí funciona), cloudflare docs.

## 3. Decisiones arquitectónicas (no reabrir sin motivo)

- Fuente territorial única: `municipios.codigo_ine` (`character(5)`).
- SOCideas lee de **R2** (JSON por municipio) + Supabase (territorio,
  catálogo, runs). Supabase free no daba para 8 M de filas (~5 GB).
- Formato **v2 compacto** (catálogos una vez arriba, filas como tuplas;
  −91% bytes, idéntico al decimal). Lector entiende v1 y v2.
- Seguridad: RLS activo sin políticas públicas en tablas SOCideas; todo vía
  `service_role` en servidor; sync HTTP con `SOCIDEAS_SYNC_TOKEN`; anon nunca
  escribe. No tocar RLS/tablas preexistentes (auditado: vista SECURITY
  DEFINER, `search_path` mutable, `spatial_ref_sys` sin RLS → auditoría
  específica pendiente antes de apertura externa).
- Sin librería de gráficos (SVG propios) ni dependencias nuevas salvo
  `@aws-sdk/client-s3` (solo servidor/scripts).
- INE Tempus3 verificado en vivo (nada de memoria): DPOP op.22 (50 tablas
  provinciales mapeadas en `DPOP_PROVINCE_TABLES`), tabla 2853 (19 CCAA +
  total 16473; **CCAA/España llegan a 2021**), tabla nacional 33570
  (pirámide 2003–2022). Filtros `tv=` exigen **Id numérico** (no código);
  `DATOS_SERIE` no existe (404); PostgREST topa en **1000 filas** (paginar).
- Reglas de datos: nunca inventar; H+M=Total exacto; años no contemporáneos
  se advierten; `Sevilla 2026 no existe` (DPOP definitivo 2025); densidad,
  extranjería y migraciones pendientes sin cobertura municipal.
- UX: navbar URBideas propia y compacta; SOCideas sin navbar URBideas;
  comparativa por defecto **solo municipio** (leyenda "X · Municipio");
  tablas visibles + copiar (HTML nativo Word/Excel); buscador por municipio
  Y provincia, insensible a acentos + alias (Araba, Vizcaya…).
- Frescura: check barato de novedad por visita + sync solo si hay año nuevo;
  re-batch anual con `scripts/sync-all-municipios.ts --stale-days 365`.

## 3B. Formato de los JSON del INE en R2 (NORMA OBLIGATORIA para lo que venga)

> Todo bloque futuro (renta, paro, empresas, afiliación, agrario…) DEBE usar
> este mismo formato. Es lo que mantiene R2 en ~0,5 GB con 8.130 municipios
> en vez de ~5 GB. Código: `src/lib/socideas-r2.ts`
> (`toV2Envelope` / `expandV2Envelope`).

**Clave**: `socideas/v2/municipios/{codigoINE_5_digitos}.json` (un objeto por
municipio, sobrescritura idempotente, `Cache-Control: public, max-age=86400`).
**Lectura**: pública sin credenciales (`NEXT_PUBLIC_SOCIDEAS_R2_BASE`); con
fallback a v1 durante transiciones. **Escritura**: solo SDK S3 con `R2_*`
(servidor/scripts).

**Envelope v2** (ejemplo real: Sevilla = 95 filas en 55 KB frente a 635 KB):

```json
{
  "version": 2,
  "codigo_ine": "41091",
  "generado_en": "2026-09-03T14:00:00.000Z",
  "indicators": [{ "slug": "population_total", "nombre": "Población total", "unidad": "personas" }],
  "sources": [{ "slug": "ine_tempus3", "organismo": "Instituto Nacional de Estadística", "nombre": "API JSON Tempus3" }],
  "source_urls": ["https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/2895?nult=...&tv=19:16473"],
  "dimensiones": [{ "ambito": "municipio" }, { "ambito": "municipio", "sexo": "hombres" }],
  "valores": [[0, 2025, 689423, "personas", 0, 0, "2895", "DPOPxxx", "validado"]]
}
```

**Tupla `valores[i]` (orden FIJO, 9 posiciones)**: `[indIdx, anio, valor,
unidad, dimIdx, urlIdx, tableId, serieId|null, estado]` donde `indIdx`,
`dimIdx`, `urlIdx` son índices a `indicators`, `dimensiones`, `source_urls`.
`valor` es número o null; `anio` entero; `estado` siempre `"validado"` (lo
demás no se persiste).

**Reglas para nuevos bloques**:
1. Nuevos `slugs` en `indicator_definitions` + entradas en `indicators` del
   JSON. NO crear otro fichero ni otro prefijo: todo va en el mismo JSON del
   municipio (una lectura por ficha).
2. Nuevas dimensiones (`sector`, `rama`, `sexo`…) como objetos en el array
   `dimensiones` (se deduplican solos). NO añadir columnas ni romper el orden
   de la tupla.
3. `source_urls` una vez cada una (la misma URL salía 953 veces en v1).
   `fecha_referencia` (=`anio`-01-01), `municipio_codigo_ine` y
   `valor_texto` NO se guardan (se derivan al expandir).
4. Presupuesto: **~150 KB por municipio y bloque grande**; si un bloque lo
   supera, revisar antes de subir (medir con `JSON.stringify(v2).length`).
5. `expandV2Envelope` debe seguir devolviendo filas con la forma exacta que
   consume la ficha (`anio_referencia`, `valor_numerico`, `dimensiones`,
   `indicator.slug`, `source.organismo`, `source_url`, `source_table_id`,
   `source_series_id`, `estado_validacion`, `obtenido_en`).
6. Cambio incompatible → `version: 3` + lector que entienda 3 y 2 (nunca
   romper lectura de lo ya subido).

## 4. Estado de la carga (2026-09-03 noche)

- **8.130/8.132 JSON v2 en R2** (~0,5 GB). Faltan solo 2 códigos fantasma de
  la semilla, **ya borrados** (`30045` Murcia y `24126` Ponferrada duplicadas;
  verificadas contra el INE + cero FKs hijas). 1 partial legítimo (Usansolo,
  pueblo de 2023 sin pirámide histórica posible).
- Scripts: `sync-all-municipios.ts` (8 lotes, reanudable, caché de catálogo
  por provincia, timeouts 30/60 s), `export-valores-to-r2.ts`,
  `convert-r2-v1-to-v2.ts`. Los lotes viven en el PC del usuario (si se
  apaga, relanzar mismos comandos; retoman solos).
- Verificado: La Roda 15.643, Sevilla 689.423, Santiago 100.965, Zaragoza
  693.091; fichas 200 con pirámide/evolución/trazabilidad.

## 5. Gotchas (lecciones pagadas)

- `<title>` con hijos múltiples rompe React 19 → template literals.
- No pasar `URLSearchParams` (ni objetos no planos) a Client Components.
- `numeric` de PostgREST llega como string → normalizar una vez al leer.
- Self-fetch HTTP a uno mismo en serverless puede tumbar la página → llamar
  a la lógica directamente + `try/catch` que degrade a "no encontrado".
- `NEXT_PUBLIC_*` exige redeploy; previews con login no se pueden probar
  desde fuera (probar logueado).
- No existe municipio "Álava" (solo provincia); Alicante ciudad es
  `03014 Alacant/Alicante`. Cuidado con PowerShell y listas `01,02` sin
  comillas (las convierte en array).
- Métricas R2/dashboard tardan ~24 h (0B no significa vacío); medir por API.

## 6. Pendiente

- Probar última preview con datos; merge a `main`; Fase 2B (economía:
  renta/AEAT, paro/SEPE, empresas, afiliación, agrario); dominio
  `sostenibilidad.ideasmedioambientales.com`; re-batch anual; auditoría de
  seguridad pre-apertura; `.env.local` conserva R2_* y tokens (no commitear).
- Convenciones con el usuario: push/merge/deploy/migraciones/remoto solo con
  orden expresa; sin datos ficticios; informe final por entrega.
