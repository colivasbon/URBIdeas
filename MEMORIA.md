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

## 6. INCideas — auditoría de calidad (2026-10-01)

- **Fase 0 completada.** Auditoría en `docs/incideas-auditoria-calidad.md`.
- **Diagnóstico central:** el libro exporta el identificador interno como primer
  dato. `src/lib/incideas/exportacion.ts` proyecta `COLUMNAS_SELECT`, que empieza por
  `id` (UUID) y acaba en `posible_baja_desde`; el libro reproduce la fila de la base
  de datos en vez de construir una ficha. `huella` y `crs` (constante, y falsa en 437
  filas) son columnas sin información.
- **Cifras reales comprobadas** (Supabase `nkfepxuyrbcxolljykwk`, 03031):
  1.378 registros · 66 columnas · cobertura 1 de 8.132 municipios (0,017 %).
  `confianza` 0/1378 · `calidad` 0/1378 · `capacidad` 0/1378 · `accesibilidad` 0/1378
  · `horario` 45 (3,3 %) · `telefono_publico` 119 (8,6 %) · `posible_duplicado` 0
  · geometría PostGIS solo 1/1378 (el límite). `incideas_ext_albergue` y
  `incideas_ext_veterinaria` vacías.
- **42 registros con nombre numérico** (`nombre_oficial` = "1", "2", "24", "26"…); el
  primero que devuelve la API pública es uno de ellos. Importación municipal: la clave
  de partidas degenera y el nombre se sustituye por el número del área.
- **`crs_original` siempre `EPSG:4326`**, incluso en las 437 filas de la plantilla
  municipal que están en UTM 30N. El sistema de referencia de origen no se conserva.
- **Despliegue:** `urb-ideas` READY en producción desde `main`. `vercel.json` vacío
  (`{}`), sin `maxDuration`. Exportación sí funciona en Vercel (json 4,8 s · csv 2,1 s
  · geojson 2,5 s · xlsx 2,9 s); la ingesta no (Overpass ya pide 100 s de espera).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` está en `.env.example` pero no en `.env.local`.
- **Documentos de referencia leídos:** `25B0335 PTM Benidorm - v2.docx` (275 págs,
  87.080 palabras, 142 tablas → 94 esquemas, 64 imágenes; coordenadas en formato
  `coord. (749923; 4269043)` y columna «Mapa de encuadre nº») y `Limpieza info.xlsx`
  (9 hojas; Hoja6 = **Catastro INSPIRE** con `N_PLANTAS`/`N_SOTANOS`/`REFCAT`;
  436 hipervínculos a la web del operador).
- **Decisiones ya tomadas:** identificador técnico a columna final «ID técnico» + hoja
  oculta; migración aditiva reversible para UTM/huso/precisión/fecha de edición en
  origen/enlace OSM/`refcat`/confianza y geometría PostGIS real; ingesta por lotes
  fuera de la web (Overpass + Geofabrik) escribiendo en Supabase y R2, la web solo
  lee; el modelo de salida se construye desde las tablas del PTM, que prevalecen
  sobre la lista del encargo; estilo heredado de `socideas-xlsx.ts` (no se crea un
  segundo estilo de libro).
- **Rama de trabajo:** `feat/incideas-calidad`. No tocar `src/components/socideas/SeccionesAtlas.tsx`
  (modificación ajena previa).

## 6.1 INCideas — libro municipal, Fase 1 (2026-10-01)

- **Migración aditiva 041 aplicada en producción** (commit `2494f87`). 11 columnas
  nuevas y 3 tablas (`incideas_correcciones_propuestas`, `incideas_control_carga`,
  `incideas_cambios`). 77 columnas, 1.378 filas, **0 filas modificadas**. Script de
  reversión en `supabase/migrations/041_incideas_calidad_down.sql`, probado en el
  esquema `ensayo`. Copias previas conservadas como `incideas_copia_*_20261001`.
- **Libro municipal implementado y verificado** en `src/lib/incideas/libro-municipal.ts`.
  17 hojas: portada con índice navegable, resumen, una hoja por cada una de las diez
  categorías del PTM, carencias, fuentes, metodología, control de calidad y una hoja
  oculta con los identificadores técnicos. Estilo heredado de `socideas-xlsx.ts`.
- **Cuatro formatos generados** con `npm run incideas:libro -- 03031`: Excel (318 kB),
  CSV con `;` y marca UTF-8 (368 kB), GeoJSON (681 kB) y GeoPackage (332 kB, escrito
  con `node:sqlite`, sin dependencias nuevas). Se vuelcan en `salida/`, que no se
  versiona.
- **Script de generación:** `scripts/incideas/generar-libro.ts`. Lee, no escribe: las
  correcciones se aplican en memoria. Imprime comprobaciones de calidad antes de
  escribir nada y deja un `informe.md` con lo que se ha publicado y lo que no.
- **Corrección de la etiqueta CRS.** Las 437 filas de la plantilla municipal
  declaran ahora ETRS89 UTM 30 (`EPSG:25830`), que es su sistema real. Sus
  coordenadas ya estaban en grados y no se han vuelto a convertir. De esas 437, 199
  tienen punto; las otras 238 no tienen ninguna coordenada.
- **Nombres numéricos.** 42 registros tienen en el nombre una cifra suelta: 28 de la
  plantilla municipal (partidas de limpieza) y 14 paradas de autobús de OpenStreetMap.
  Todos conservan su cifra y se marcan «por revisar» con la causa anotada, en lugar de
  inventar un nombre. Hay además 3 paradas cuyo nombre es una lista de líneas de
  autobús («2, 24, 30, 31»); ese dato se considera útil y no se marca.
- **Paginación obligatoria.** El servidor corta a 1.000 filas; se reutiliza el
  paginador compartido `leerTodas`. Sin esto el libro salía con 1.000 de 1.378
  registros sin avisar. Hay una prueba de paginación que lo fija.
- **Pruebas:** `scripts/tests/incideas-libro.test.ts`, 30 casos. Suite previa de
  INCideas, 40 casos. Todas en verde, junto con `tsc` y `eslint`.

### Hallazgos de datos que hay que corregir en su día

- `municipios.poblacion` dice **1.021** habitantes para Benidorm. El padrón del INE que
  ya está en `incideas_registros` registra **77.327 (2025)**. El libro publica la
  cifra del INE y avisa de la discrepancia; la tabla `municipios` sigue sin tocar.
- `municipios.geom` es un **punto** (el centro), no el término municipal, así que la
  superficie municipal no se puede calcular. El libro lo dice en vez de publicar un
  valor aproximado.
- No existe tabla de comarcas: la comarca figura como «No consta en la base».
- 10 registros tienen punto fuera del término (gasolineras y un local de la Nucía).
  No son un error: los servicios municipalmente citados losumoto también.
- 102 grupos de registros con categoría, tipo, nombre y dirección coincidentes.

### Errores reales encontrados y corregidos por las pruebas

- **`latLngToUtm` calculaba la UTM desviada unos cientos de kilómetros.** Le faltaba
  el desplazamiento falso de 500.000 m y multiplicaba la diferencia de longitud sin
  el coseno de la latitud (`A = cos φ₁ · (λ − λ₀)` en Snyder). Benidorm salía en
  E 322.760 en vez de E 753.416. Reescrita con la serie completa. Se comprueba contra
  el meridiano central (X = 500.000 exactos), la escala en el ecuador y el ejemplo de
  coordenadas que publica el propio PTM.
- `enriquecerFila` existía pero no se llamaba, así que la UTM salía vacía.
- La población se calculaba en una copia local del libro, de modo que los formatos
  abiertos y el Excel podían contradecirse. Ahora se calcula una vez, en el cargador.
- Clave foránea del GeoPackage mal definida: referenciaba una columna suelta donde el
  estándar pide la clave compuesta. `VACUUM INTO` además borraba la cabecera
  GeoPackage; ahora el fichero lleva el `application_id` que reconoce GDAL.
- La hoja de metodología afirmaba dos cosas que no eran ciertas: que se comprobaba
  cada punto contra el polígono del término municipal (no existe: la base guarda un
  punto) y que había «cuarenta y dos» nombres numéricos (la cifra está ahora en 42 y
  sale de los datos, no escrita a mano). Los recuentos de la metodología se calculan
  desde las filas del libro para que no puedan contradecirlo.

## 6.2 INCideas — línea de base, descarga web y defectos reales (2026-10-02)

Rama `feat/incideas-calidad`, sobre `541bb22`. Toda la verificación es local y de
lectura: no se ha escrito en la base ni en el despliegue.

### Línea de base reproducida

`scripts/incideas/qa-linea-base.ts` relee el Excel adjunto y lo reconcilia con el libro
nuevo. Todas las cifras del encargo se reproducen exactamente: 1.378 filas, 20 columnas,
dos hojas; 1.110 con coordenadas y 268 sin ellas; 940 `automatico_sin_revisar`, 437
`contrastados`, 1 `validado_tecnicamente`; 99 `fuera_municipio` y 264 `proximo_limite`;
42 nombres de solo cifras; 62 grupos de huellas repetidas con 165 filas y 103
repeticiones adicionales por fuente + huella. Informe en
`docs/informe-linea-base.md`.

**La diferencia de una coordenada (1.110 frente a 1.111) está identificada.** Es el
registro `territorio/limite_municipal` «Benidorm», de OpenStreetMap Nominatim
(`osm:relation/341148`). En el adjunto no tiene `lat`/`lng` porque su geometría es un
`MULTIPOLYGON` de 697 vértices que vive en la columna de texto; el generador nuevo toma
un punto representativo de esa geometría. No hay conversión de coordenadas ni
desplazamiento: los otros 1.377 registros coinciden uno a uno por identificador.

### Causa de las 103 repeticiones, que no son duplicados

Los 62 grupos se descomponen en **62 filas caducadas y 103 activas**. Las caducadas son
la misma entidad física importada dos veces: se cargaron con una clave de importación
de tres campos (`partida|distrito|nombre`, y `farmacia|nombre`) y, cuando la clave pasó a
incluir el área y a basarse en la dirección, la segunda carga creó filas nuevas en vez de
actualizar las anteriores. Están marcadas `posible_baja_desde` y nunca borradas. Las 103
activas son entidades distintas con identificador de origen propio: una partida puede
abarcar varias áreas y la plantilla lo documenta. Fusionarlas sería incorrecto.

### Origen de los nombres numéricos: dos bloques y un encabezado repetido

La hoja `Núcleos_partidas` de `Limpieza info.xlsx` tiene **dos bloques con distinto
desplazamiento de columnas**: las filas 2 a 82 guardan la partida en la columna B, y desde
la fila 84 la guardan en la columna A, con la fila 83 como encabezado repetido
(`Partida | Distrito | Subsector`) y siete filas en blanco entre bloques. El importador
leía índices fijos, así que desde la fila 83 leía el distrito como nombre de partida: de
ahí salen las partidas llamadas «2», «3» o «4» y la fila llamada «Distrito», y los 53
nombres reales del segundo bloque nunca entraban.

`src/lib/incideas/plantilla-partidas.ts` resuelve el caso de forma estructural y
determinista: detecta cada encabezado, fija el desplazamiento del bloque, descarta las
filas que son encabezado y no inventa columnas si la hoja no tiene cabecera. Sobre el
documento real lee **127 partidas con sus nombres reales y 92 claves únicas**, frente a
128 filas de las que 54 no eran partidas. La corrección está probada pero **no aplicada a
la base**: importarla cambia 1.378 registros y necesita autorización.

### La descarga web entrega el libro nuevo

`/api/incideas/exportar` usaba el generador antiguo de dos hojas y veinte columnas,
mientras que el libro municipal solo era alcanzable por línea de comandos. Ahora todos los
formatos salen de **una sola lectura** (`cargarLibroMunicipal`), de modo que el Excel, el
CSV, el GeoJSON y el JSON describen el mismo conjunto con la misma marca de tiempo, que
además viaja en la cabecera `X-Incideas-Snapshot`. Comprobado contra el servidor de
desarrollo: JSON 1.378 filas (antes truncaba en 1.000), Excel de 17 hojas, CSV de 1.378
filas y GeoJSON de 1.111 entidades. El formato `crudo` conserva la proyección plana de la
tabla para consumidores de máquina.

### Defectos reales corregidos

- **El cargador no filtraba ni la visibilidad ni las bajas.** Leía `*` sin condiciones, así
  que un registro `restringida` o `personal_protegida` habría salido en el libro público.
  El filtro vive ahora en `paginarRegistros`, no en cada formato, y hay pruebas con un
  cliente falso que demuestran que no se puede saltar. Hoy hay 0 filas afectadas.
- **El cargador descartaba toda la geometría** (`geometria_wkt` se escribía siempre
  vacía), de modo que el límite municipal, los cauces y cualquier polígono se perdían al
  exportar y solo quedaba el punto representativo. Se conserva el WKT de la fuente y se
  añade `wktAGeoJSON`, con pruebas de ida y vuelta para los seis tipos. El GeoJSON pasó
  de 681 a 773 kB y ahora incluye el límite como `MultiPolygon`.
- **La cabecera del BLOB del GeoPackage no cumplía el estándar OGC.** Insertaba ocho bytes
  de texto hexadecimal donde va el `srs_id` y desplazaba el WKB; el fichero llevaba la
  firma «GP» y, aun así, ningún SIG podía leer la geometría. Ahora la cabecera es la de
  la tabla 3 de OGC 12-128r19: versión, indicadores, `srs_id` y envolvente XY de 32 bytes.
  Se verifica byte a byte y recorriendo la geometría completa.
- **`geometriaAWKT` escribía un `MULTILINESTRING` mal formado**, con un paréntesis de
  menos. El fallo estaba oculto porque nadie leía el WKT de vuelta.
- Los contadores del WKB se escribían con `new Uint32Array`, que usa el orden de la
  máquina; ahora se fijan en little endian con `writeUInt32LE`. En x86 no cambiaba nada,
  pero dejaba la corrección en manos de la plataforma.
- Los dos contadores de exclusión del cargador estaban intercambiados. Lo detectó una
  prueba propia: `excluidos_baja` salía con el número de las restringidas.

### Separación de módulos

`formato-abierto-gpkg.ts` se crea aparte porque el GeoPackage necesita `node:sqlite`, que
no existe por debajo de la versión 22 y no tiene que ver con una petición web. Antes,
importar el CSV desde una ruta arrastraba SQLite. El GeoPackage es un artefacto de trabajo
por lotes y solo lo genera el CLI.

### Pruebas

`scripts/tests/incideas-aceptacion.test.ts`, 27 casos, todos en verde. Cubren la línea de
base contra los documentos reales, la lectura de los dos bloques de la hoja de partidas,
la identidad canónica frente a los artefactos de lectura, la ida y vuelta del WKT, la
paginación por encima del millar con cliente falso, el filtro de visibilidad, el de bajas
duras y el de bajas lógicas, la paridad entre formatos y la cabecera del GeoPackage leída
byte a byte. Con las suites previas son **97 casos** (40 del pipeline, 30 del libro, 27 de
aceptación), con `tsc` y `eslint` limpios.

## 7. Pendiente

- Probar última preview con datos; merge a `main`; Fase 2B (economía:
  renta/AEAT, paro/SEPE, empresas, afiliación, agrario); dominio
  `sostenibilidad.ideasmedioambientales.com`; re-batch anual; auditoría de
  seguridad pre-apertura; `.env.local` conserva R2_* y tokens (no commitear).
- INCideas: Fases 1 a 6 según `docs/incideas-auditoria-calidad.md`.
- Convenciones con el usuario: push/merge/deploy/migraciones/remoto solo con
  orden expresa; sin datos ficticios; informe final por entrega.

## 8. Cierre de las correcciones de Benidorm (2026-10-05)

Detalle completo en `docs/informe-reparacion-partidas.md`.

### Lo que estaba mal y por qué

**El área estaba dentro de la clave de la partida.** La hoja documenta cada
partida dos veces: el primer bloque repite una fila por área y el segundo la da
con la lista completa («El Saladar» con 10, luego con 12, luego como «9, 10, 12»).
Con el área en la clave eran tres entidades. La clave real es distrito y nombre;
el área se acumula como lista en `atributos.area`. 127 filas de la plantilla
son 53 entidades, con 35 duplicados dentro de la propia hoja.

**Veinticinco registros no eran lugares.** Tienen por nombre `1`, `2`, `3`, `4` o
`Distrito`, y sus claves `partida|4, 5|4|` tienen el área donde va el distrito y el
número de distrito donde va el nombre: son una lectura del segundo bloque
desplazada una columna. La prueba es directa: la columna Distrito de ese bloque
solo tiene cuatro valores distintos. No se renombraron porque no hay forma de
saber qué partida nombraban.

**La plantilla tiene una errata.** Las filas 25 y 86 de `Núcleos_partidas`
documentan el mismo núcleo como «Amanello» y «Armanello». Manda «Armanello»,
que es la grafía del resto del libro (parada «357 - C. Armanello», calle «C/
Armanello», «Camí de l'Armanello»). Vive en `ORTOGRAFIA_PARTIDAS`, en la librería,
con su motivo; no se deduce en ejecución.

**El libro publicaba las bajas lógicas.** El cargador filtraba `eliminado_en` y
visibilidad, pero no `desactualizado_desde`, así que mostraba 157 partidas
cuando había 53 vigentes. Añadido el filtro a `paginarRegistros`, con prueba.

### Dos decisiones que conviene no volver a plantear

**Revivir, no reescribir claves.** Se prefirió revivir las 52 filas que ya
tenían la clave correcta antes que cambiar la clave de las 74 activas. Es menos
invasivo y, sobre todo, evita un fallo real: la búsqueda del pipeline usa
`maybeSingle()` y filtra solo por `eliminado_en`, de modo que dos filas con la
misma `id_origen` —la activa reparada y su baja histórica— la harían fallar.

**No tocar `municipios.poblacion`.** Guarda 1021 habitantes para Benidorm frente
a los 77327 del INE de 2025. La columna está sistemáticamente corrupta: 6.034 de
8.130 municipios tienen menos de 1.000 habitantes y solo 6 superan 500.000. Y no
hay dónde registrar la trazabilidad, porque `incideas_correcciones_propuestas`
tiene clave foránea a `registro_id` y un municipio no tiene registro. Corregir solo
Benidorm taparía una columna rota en unas 6.000 filas. Queda propuesta la
migración, sin aplicar.

### Resultado

Base: 53 partidas vigentes, 0 nombres numéricos, 0 claves duplicadas, 1.378
registros totales — no se borró nada. Libro: 53 partidas, 1.269 filas, 1.111 con
coordenadas. Reimportación idempotente (0/0/328 en la segunda pasada). 97
pruebas en verde.

El informe `docs/informe-linea-base.md` lo regenera `incideas:qa-linea-base`, así
que no se edita a mano. Con el filtro de bajas lógicas, el adjunto tiene 1.378
filas y el libro 1.269: las 109 que no aparecen son exactamente las bajas
lógicas — 104 partidas y 5 farmacias — que el libro deja de publicar por
propio diseño. Antes de la reparación eran 0, porque el libro las incluía.

Un aviso que conviene leer bien: el informe del pipeline marca
`insertados=0 actualizados=53 sin_cambios=275 posibles_bajas=109`. Los 109 no son
bajas nuevas, son filas que ya estaban dadas de baja y el contador no distingue
nuevas de previas. Ninguna baja nueva.

El límite municipal se contrastó con el WFS del IGN
(`au:AdministrativeUnit`, GeoJSON, CC BY 4.0, sin autenticación): 99,713 % de
solape y 66,75 m de Hausdorff con el recinto oficial, −0,039 % de área. La
geometría se conserva; solo se corrigieron `estado_espacial`, `fecha_dato` y
`metodo_obtencion`. La pista de que ese servicio solo devolvía GML está
superada: ya entrega GeoJSON.

### Cómo reproducirlo

`incideas:plan-reimportacion` copia y calcula el plan sin escribir;
`incideas:reparar-partidas` lo aplica con `--go` y acepta `--solo-limite`. El
script de reparación lee `plan.json` y no decide por su cuenta: si el estado no
coincide con el que el plan asumía, aborta.

## 9. Fase 2A — peligrosidad de inundación e hidrografía (2026-10-06)

Rama `feat/incideas-hidrografia`. Detalle: `docs/fase2a-contrato.md` (contrato)
e `docs/informe-fase2a-benidorm-murcia.md` (entrega). Solo lecturas públicas y
artefactos en `salida/fase2a/` (gitignored): SOCideas intacto,
`municipios.poblacion` ni leído, nada escrito en sistemas reales ni despliegues.

**Investigado (acotado):** PATRICOVA publica 3 SHP vía tarea asíncrona ArcGIS
(`submitJob`, no descarga directa) + WMS + 3 PDF; definiciones literales del
catálogo (peligrosidad 6 niveles + 7.º geomorfológico; riesgo =
peligrosidad+vulnerabilidad; estudios = concreción en ámbito). Las «12 hojas»
no existen: cada producto es un único shapefile (8.415/7.710/207 objetos; los
estudios son puntos). SNCZI: `wms.mapama` y catálogo MITECO inaccesibles desde
aquí (registrado, no confundido con ausencia); INSPIRE inundaciones es raster
(`GRAY_INDEX`), no vector. Hidrografía IGN (`hy-p:Watercourse`,
`hy-n:WatercourseLink`, GML 3.2): varios miembros comparten hydroId sin ser el
mismo tramo → se cuenta por miembro. Trampas T1/T2/T3 en regresión.

**Ejecutado (mismo `pipeline.ts --ine`, sin reglas ad-hoc):** Benidorm 03031:
WC 372 miembros (169 intersectan, 61,76 km), WL 150 (46, 51,55 km);
PATRICOVA peligrosidad 33 polígonos/8,18 Mm², riesgo 17/0,83 Mm², estudios 0
en término; exposición sobre 1.111 inventario. Murcia 30030: WC 3.835 (1.774,
1.298 km), WL 1.864 (812, 923 km); PATRICOVA NO_APLICABLE; sin inventario →
exposición no determinada. Excel+GPKG+GeoJSON+mapa coherentes por municipio
(paridad verificada en ejecución).

**Pruebas:** `fase2a:test` 20/20, `tsc` y `eslint` limpios.
**Pendiente:** contención T10/T100/T500 sobre vector oficial (comparador
implementado+probado, sin vector accesible); validar modelo de identidad IGR;
inventario de Murcia; propuestas previas (población, auditoría) intactas.

## 10. INCideas Fase 3 — plataforma nacional, muestra Fase 1 (2026-10-06)

Rama `feat/incideas-hidrografia`, sin commit/push/merge/despliegue. Informes:
`docs/fase3-propiedad.md`, `fase3-contrato-bloques.md`,
`fase3-matriz-bloques.md` (142 tablas, 0 sin regla), `fase3-hito0/1/2.md`,
`fase3-auditoria-poblacion.md`, `fase3-informe.md` (final, con commit
preparado). Agentes B/C/D en `tmp/agente-*/` (solo lectura + sus tmp).

**H0:** árbol verificado (Fase 2A 20/20, exports 13+9 ficheros), medición
(Supabase ~178/500 MB con `asociaciones` 126 MB; R2 147.256 obj/2,97 GB),
tabla de propiedad y contratos. **H1:** migraciones 042–045 (bloques,
fuentes_nac —la `incideas_fuentes` del piloto no se toca—, cobertura,
snapshots, entidades, aportaciones; 045 lectura pública), ensayadas en
`ensayo` con reversión probada y `ensayo` devuelto a su estado. Aplicadas a
`public` (tablas nuevas, ~248 KB). **H2:** muestra 6 municipios
(Benidorm/Murcia/Lagrán/SCT/Pamplona/Ceuta), plan 64 pares, lote 64/64,
snapshot aprobada `incideas:snap:e92540e4be4df78`. Conectores nuevos:
REGCESS (titulares anonimizados), NAP (12.038 sites), MINETUR (IDPovincia +
ARABA/ÁLAVA), PRTR (parcial honesto), RCD (sin bulk; Navarra/GVA CSV),
autonómico genérico CKAN+CSV/GeoJSON. **H5:** 4 plantillas + validador en
`salida/plantillas/`. **H6:** `/incideas/[codigoINE]/bloques`,
`/incideas/cobertura`, API exportar (XLSX/CSV/JSON) y actualizar;
`next build` compila; verificado contra servidor local. **J:** QA 0 bloqueos
(7 iniciales corregidos); suites 20+8+30+27 en verde; `tsc`+`eslint` limpios.
**§6:** `municipios.poblacion` auditada sin escritura (511×667, Benidorm
1.021 frente a 77.327 INE); propuesta de migración reversible pendiente.
Restricciones: SOCideas intacto (salvo importaciones de lectura),
`SeccionesAtlas.tsx` ajeno no tocado, `municipios.poblacion` ni leída por
Fase 2A y solo comparada en Fase 3.

## 11. INCideas Fase 3 — oleada CV completa y sellada (2026-10-07)

Rama `feat/incideas-hidrografia` (fusionada a `main` por fast-forward,
desplegada). Ámbito: 542 municipios (03/12/46), 3.919 pares cargados; edición
continua `oleada-cv-01` para combustible/recarga.

**Incidencias y correcciones.** (a) La escritura por municipio había quedado
anidada en el bloque PATRICOVA-CV: los municipios no-CV no escribían nada;
corregido con prueba de regresión (`26f8d4c`). (b) El WFS de hidrografía del
IGN fluctuó (total 291→0→144 en el mismo BBOX; caída masiva 18:03–18:15 del
06): hasta 3 intentos con espera creciente y limpieza de marcadores
`fuente_caida` superados (`03b3b0e`). Reintento final de 137 hidro de Alicante
y 4 educación de Valencia: ok=145, fallos=0; control sin `fuente_caida`.

**QA (paginada, 3.957 pares R2↔control) y sellado.** La QA topaba con el
límite de 1.000 filas de PostgREST (auditaba solo el primer millar): ahora
pagina y admite `--prefijos`; bloquea si queda algún `fuente_caida` en el
ámbito. La regla de teléfono pasó a ventana de contacto (≤60 caracteres) y
forma estricta (9–15 dígitos con ≥2 separadores o +34/0034) tras falsos
positivos reales: IDs NAP («2024000484»), decimales de área
(«hectares»:3.82177378) y palabras sueltas («móviles» de caravanas,
«Movilsa»). QA final: 0 bloqueos, 0 avisos. Snapshot aprobada:
`incideas:snap:67f95a51fa5b3e9d` (sello desde control, 542 municipios).

**Herramientas nuevas.** `sellar-snapshot.ts` (aprueba una oleada desde
`incideas_cobertura` sin re-descargar; orden canónico propio),
`generar-lotes.ts` (lotes por provincia; complejidad por número de municipios,
al estar `municipios.poblacion` auditada como no fiable), `driver-oleada.ps1`
(desatendido: STOP, `.hecho`, `--continuar`, cierre QA+sello). npm:
`fase3:sello`, `fase3:lotes`. En PowerShell, citar `--prefijos`/`--solo` con
ceros iniciales (`'03,12,46'`): sin comillas, `03,12,46` llega como `3,12,46`.

## 12. INCideas Fase 3 — oleada 2 en marcha (2026-10-07)

48 lotes por provincia, 7.584 municipios restantes (8.132 − 548 ya en control),
ordenados por número de municipios creciente (Melilla primero). Forales
(01/20/48/31), insulares (07/35/38) y ciudades autónomas (51/52) marcados en
`tmp/oleada2/indice.json`; el cargador ya aplica sus fuentes propias. Driver
con STOP y cierre automático (QA completa + sello aprobado) al terminar.
Estimación: ~2–3 días de ejecución desatendida.
