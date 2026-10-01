# INCideas — Piloto de carga de datos reales (Benidorm, 03031)

Rama de origen: `feat/incideas-benidorm-piloto` (código integrado en `feat/incideas-piloto-datos`). Iteración centrada en demostrar el flujo
completo **fuente → extracción → transformación → normalización → almacenamiento →
detección de errores → revisión → exportación** con fuentes reales verificadas.

> **Estado: aplicado y cargado.** Con autorización expresa se han aplicado las
> migraciones `038_incideas_core.sql` y `039_incideas_pipeline.sql` en el proyecto
> Supabase `nkfepxuyrbcxolljykwk` y se ha ejecutado la carga real de Benidorm con `--go`.
> Los resultados reales están en las secciones 7 y 8-bis.

Documentación relacionada: [incideas-cerebro.md](./incideas-cerebro.md) (arquitectura,
orígenes de datos y ciclo de vida; versión web en `/incideas/arquitectura`) y
[incideas-agente-prompt.md](./incideas-agente-prompt.md) (prompt de continuación).

---

## 1. Diagnóstico de la implementación existente

- **Framework**: Next.js 16 (App Router), React 19, Tailwind 4, TypeScript.
- **Base de datos**: Supabase/PostgreSQL con **PostGIS habilitado** (`001_create_extensions.sql`).
- **`municipios`**: `geom GEOMETRY(Point,4326)` con índice GIST. `codigo_ine CHAR(5) UNIQUE`.
- **`incideas_registros`** (migración 038): `geometria GEOMETRY` genérica (sin SRID fijado) con índice GIST,
  `coordenadas JSONB`, `fuente_principal`, `fecha_dato`, `fecha_consulta`, `licencia`,
  `estado_validacion` (11 estados), `visibilidad`, `nivel_automatizacion`.
- **Almacenamiento de objetos**: Cloudflare R2 (patrón SOCideas), no usado en este piloto.
- **Sin autenticación de usuario**: los endpoints de escritura se protegen con token en cabecera.

**Carencias detectadas y corregidas en `039_incideas_pipeline.sql`:**

| Carencia | Corrección |
|---|---|
| No había identificador de origen | `id_origen TEXT` |
| No había huella para fuentes sin id estable | `huella TEXT` |
| No había ejecución asociada a cada fila | `id_ejecucion_ultima UUID` |
| Procedencia solo a nivel de ficha | `procedencia_atributos JSONB` (por atributo) |
| No había borrado lógico | `eliminado_en`, `motivo_baja` |
| No había marca de posible baja | `desactualizado_desde` |
| No había control de versión (concurrencia) | `version_registro INTEGER` |
| No había validación espacial persistida | `estado_espacial TEXT` |
| No había modelo de ejecuciones | tabla `incideas_ejecuciones` |
| No había extensiones por categoría | `incideas_ext_albergue`, `incideas_ext_veterinaria` |
| No había trazas de revisión humana | tabla `incideas_revisiones` |
| Sin red de seguridad anti-duplicado | índices únicos parciales por `id_origen` y `huella` |

---

## 2. Inventario de fuentes verificadas

Solo se registran fuentes cuyo **endpoint se ha consultado y cuya respuesta se ha comprobado**.

| Fuente | Organismo | Tipo | Endpoint verificado | Formato | Licencia | Respuesta comprobada |
|---|---|---|---|---|---|---|
| OpenStreetMap (Nominatim) | OSM Foundation | Colaborativa | `nominatim.openstreetmap.org/search?q=Benidorm&format=jsonv2&polygon_geojson=1&countrycodes=es` | JSON (MultiPolygon) | ODbL 1.0 | `relation 341148`, MultiPolygon devuelto |
| OpenStreetMap (Overpass) | OSM Foundation | Colaborativa | `overpass-api.de/api/interpreter` (POST, requiere User-Agent) | JSON | ODbL 1.0 | 608 elementos para Benidorm |
| INE — Padrón por municipio | INE | Oficial estructurada | `ine.es/jaxiT3/files/t/es/csv_bdsc/29005.csv` | CSV (ISO-8859-1) | Reutilización (Ley 37/2007) | `03031 Benidorm;Total;2025;77.327` |

**Descartadas en esta iteración (no verificadas o no utilizables como atributos):**
- IGN WFS `au:AdministrativeUnit`: responde pero **solo GML** y lento; pendiente de evaluar como alternativa oficial al límite.
- WMS/WMTS: sirven imágenes, no atributos; no se usan como fuente de datos.
- Google Maps: prohibido para extracción masiva.

---

## 3. Matriz de categorías y fuentes

| Categoría | Fuente en el piloto | Automatización | Estado |
|---|---|---|---|
| Territorio (límite) | OSM/Nominatim | media | Cargado (1 registro) |
| Población (padrón) | INE 29005 | alta | Cargado (29 registros) |
| Equipamientos (sanidad, educación, seguridad, cultura, deporte, alimentación) | OSM/Overpass | media | Cargado |
| Infraestructuras (alojamientos, campings, transporte) | OSM/Overpass | media | Cargado |
| Servicios básicos (estaciones de servicio) | OSM/Overpass | media | Cargado |
| Animales (clínicas veterinarias) | OSM/Overpass | media | Cargado |
| Necesidades especiales | — | baja | **Estructura y permisos listos; sin fuente automática** |
| Riesgos | — | alta | **Pendiente de fuente oficial verificada** |
| Medios y recursos / Evacuación | — | baja | **Estructura lista; requiere trabajo municipal** |

---

## 4. Arquitectura de conectores

```
src/lib/incideas/
  pipeline/
    types.ts          Contratos: RawFeature, NormalizedRecord, RegistroStore, EjecucionContext
    normalize.ts      Normalización + procedencia por atributo + mapeo OSM→categoría
    huella.ts         Huella determinista (sha256 de fuente+INE+categoría+nombre+coords)
    geo.ts            Validación espacial (ray casting, distancia a aristas, ejes)
    dedup.ts          Detección conservadora de duplicados (no fusiona)
    upsert.ts         Motor idempotente (inserta/actualiza/bajas, protege validados)
    runner.ts         Orquestación: ejecución → conector → normaliza → valida → persiste
    memory-store.ts   RegistroStore en memoria (tests y dry-run)
    store-supabase.ts RegistroStore sobre Supabase (PostgREST)
  connectors/
    types.ts          Interfaz Connector
    http.ts           fetch con User-Agent, timeout y reintentos
    nominatim-boundary.ts
    osm-pois.ts
    ine-poblacion.ts
    registry.ts       Catálogo de conectores
```

Un **conector** solo descarga y mapea a `RawFeature`; el `runner` normaliza, valida y
persiste de forma idempotente. El `RegistroStore` abstrae la persistencia, lo que permite
probar la lógica sin base de datos.

**Clave lógica de idempotencia**: `(codigo_ine, categoria, fuente_principal, id_origen)`.
Sin `id_origen`: `(codigo_ine, categoria, huella)`.

---

## 5. Migración propuesta

- `039_incideas_pipeline.sql` — columnas nuevas en `incideas_registros`, índices únicos
  parciales, tablas `incideas_ejecuciones`, `incideas_ext_albergue`,
  `incideas_ext_veterinaria`, `incideas_revisiones`.
- `040_incideas_atributos.sql` — columna `atributos JSONB` (líneas de bus, distrito/área,
  personal/alumnado) para no forzar columnas por cada fuente.

**Aplicadas** en el proyecto `nkfepxuyrbcxolljykwk` con autorización expresa.

---

## 6. Conectores implementados

| Conector | id | Versión | Categoría | Entrada | Salida |
|---|---|---|---|---|---|
| Límite municipal | `osm-boundary` | 1.0.0 | territorio | nombre de municipio | 1 feature con MultiPolygon + `boundary` para el resto |
| Equipamientos y servicios | `osm-pois` | 1.0.0 | equipamientos | bbox del límite | N features con punto y atributos OSM |
| Padrón municipal | `ine-poblacion` | 1.0.1 | poblacion | código INE | 1 feature por año (serie "Total") |

---

## 7. Registros cargados (Benidorm, dry-run)

| Conector | Leídos | Insertados | Categoría resultante |
|---|---|---|---|
| osm-boundary | 1 | 1 | territorio |
| osm-pois | 608 | 608 | equipamientos / infraestructuras / servicios_basicos / animales |
| ine-poblacion | 29 | 29 | poblacion |
| **Total** | **638** | **638** | |

---

## 8. Resultados de las ejecuciones

Ejecución doble consecutiva (`--repeticion 2`) para comprobar idempotencia:

```
Repetición 1: boundary insertados=1 · pois insertados=608 · ine insertados=29
Repetición 2: boundary sin_cambios=1 · pois sin_cambios=608 · ine sin_cambios=29
```

**La segunda ejecución idéntica no duplica filas.** Cada registro conserva fuente,
fecha de consulta, id_origen y estado de validación (`automatico_sin_revisar`).

## 8-bis. Resultado real en Supabase (aplicado)

Migraciones 038 y 039 aplicadas. Carga real de Benidorm ejecutada con `--go`.

| Comprobación | Valor real |
|---|---|
| Registros totales (03031) | **638** |
| Por categoría | equipamientos=393, infraestructuras=182, poblacion=29, servicios_basicos=27, animales=6, territorio=1 |
| Duplicados por `id_origen` | **0** |
| Estado espacial | valido=349, proximo_limite=160, fuera_municipio=99, sin_geometria=30 |
| Ejecuciones registradas | 7 (0 fallidas) |
| Trazas de historial | 668 |
| Fuentes en catálogo | 3 |
| Revisión de demostración | 1 registro validado + 1 traza en `incideas_revisiones` |

Comprobaciones en vivo contra el servidor de desarrollo (puerto 3000):
- `GET /api/incideas/registros?codigo_ine=03031` → 200, datos con procedencia.
- `GET /api/incideas/revision?codigo_ine=03031` → 200, conteos por bandeja.
- `GET /api/incideas/exportar?codigo_ine=03031&formato=geojson` → 200, 609 features
  (608 Points + 1 MultiPolygon), CRS84, con fuente/fecha/estado por feature.
- `POST /api/incideas/revision` sin token → **503** (control de acceso operativo).

**Protección de validados verificada en datos reales:** tras validar el registro
«Ayuntamiento de Benidorm» y relanzar el conector automático, el registro conservó
`estado_validacion=validado_tecnicamente`, recibió una traza `observar` (carga
automática ignorada) y **no fue sobrescrito**.

Las 8 posibles bajas detectadas en una pasada intermedia (volatilidad de OSM) quedaron
restauradas (`desactualizado_desde=null`) al reaparecer en la pasada siguiente.

## 8-ter. Importación de la plantilla municipal (XLSX)

`scripts/incideas/import-xlsx.ts` importa `Limpieza info.xlsx` (documento de trabajo del
PTM de Benidorm) de forma idempotente y con reproyección **UTM 30N → WGS84**
(`src/lib/incideas/pipeline/utm.ts`, sin dependencias).

| Hoja | Categoría / subcategoría | Registros |
|---|---|---|
| Núcleos_partidas | territorio / partida | 58 |
| Hoja4 | infraestructuras / parada_autobus | 199 |
| Farmacias | equipamientos / farmacia | 41 (5 hasta la corrección de claves de 2026-10-01) |
| Enseñanza | equipamientos / colegio·instituto·escuela_infantil·centro_formacion | 35 |

Fuente registrada como «Plantilla municipal — Limpieza info (PTM Benidorm)», estado
`contrastado`, con `atributos` (líneas de bus, distrito/área, personal y alumnado).
Total tras la importación: **935 registros** en Benidorm (297 de origen municipal).

Estos datos alimentan la memoria: 2.3.3 (partidas/distritos), 2.4.4 (paradas de autobús)
y 2.7.1 (centros educativos con personal y alumnado cuando la fuente lo aporta).

---

## 9. Duplicados detectados

`osm-pois` detecta **146 grupos** de candidatos (mayoría `varias_sedes_misma_entidad` y
`posible_duplicado`). **No se fusiona ninguno automáticamente**; quedan para revisión.
La detección usa nombre normalizado + categoría + distancia (aristas/vértices) + teléfono.

---

## 10. Errores detectados y tratados

- **INE tabla 2865** no contenía Benidorm (cobertura provincial). Se corrigió a la tabla
  nacional **29005**, verificada.
- **Overpass** devuelve 504 de forma intermitente: el cliente reintenta y usa endpoint
  espejo; si falla, la ejecución se marca `parcial` y **no** se marcan bajas.
- **Nominatim** requiere User-Agent: el cliente lo envía siempre.

---

## 11. Interfaz de revisión

`/incideas/[codigoINE]/revision` — bandeja con conteos por vista: automáticos sin revisar,
sin coordenadas, fuera del municipio, próximos al límite, posibles duplicados, conflictivos,
posibles bajas. Permite abrir el registro, ver **procedencia por atributo** y ejecutar
acciones (validar, conflictivo, pendiente, obsoleto, observar, confirmar baja).

API: `GET /api/incideas/revision` (conteos) y `POST /api/incideas/revision`
(protegido con `INCIDEAS_REVIEW_TOKEN`; registra en `incideas_revisiones` e `incideas_historial`).

---

## 12. Mapa de control de calidad

`/incideas/[codigoINE]/mapa` — Leaflet con límite municipal, puntos coloreados por estado
(automático / validado / fuera del municipio / próximo al límite / coordenadas sospechosas),
selector de categoría y de estado, y popup con fuente, fecha y estado. Uso de control, no decorativo.

---

## 13. Exportaciones

`GET /api/incideas/exportar?codigo_ine=03031&formato=geojson|csv|json|xlsx`
Conserva id, INE, categoría, nombre, dirección, coordenadas, geometría, CRS, fuente,
id_origen, huella, fechas, estado, advertencias y licencia. **Excluye datos restringidos.**

---

## 14-15. Pruebas realizadas y resultado

`npx tsx --test scripts/tests/incideas-pipeline.test.ts` → **40/40 pasan** (pipeline, conectores, exportación y memoria).

| Prueba | Resultado |
|---|---|
| Normalización de nombre, teléfono, dirección, CP | ✔ |
| Mapeo OSM→categoría | ✔ |
| Huella determinista y sensible a la fuente | ✔ |
| Validación espacial (dentro/fuera/sin geometría/ejes/próximo) | ✔ |
| Detección de duplicados (mismo recurso vs varias sedes) | ✔ |
| **Segunda ejecución idéntica no duplica** | ✔ |
| Actualiza solo campos cambiados | ✔ |
| **No sobrescribe registro validado** | ✔ |
| Marca posibles bajas y las restaura | ✔ |
| No marca bajas si la respuesta es parcial | ✔ |

Dos bugs reales detectados por los tests y corregidos: el reemplazo de abreviaturas de vía
dejaba el punto (`avda.`→`avenida.`), y la distancia al límite se calculaba a vértices en
lugar de a aristas.

---

## 14-bis. Reutilización de datos transversales (SOCideas)

INCideas **no duplica** lo que ya publica SOCideas. `src/lib/incideas/fuentes-socideas.ts`
lee el envelope R2 de SOCideas (`socideas/v2/municipios/<INE>.json`) y expone sus indicadores.
Para Benidorm (03031) se reutilizan, entre otros: `population_total` (77.327), `population_male`,
`population_female`, `population_evolution`, `population_age_sex`, `area_km2` y `density_per_km2`.

Estos alimentan directamente las secciones 2.1 (superficie) y 2.3 (población, evolución,
estructura por edad y densidad) de la memoria, con la fuente SOCideas/INE y su fecha de generación.
El mismo mecanismo sirve para cualquier municipio con envelope en R2.

## 15-bis. Presentación documental (memoria estilo PTM)

A partir de `25B0335 PTM Benidorm - v2.docx` se replica la estructura del Plan Territorial
Municipal. Nueva ruta `/incideas/[codigoINE]/memoria` con:

- Secciones numeradas (2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, Anexo) y subsecciones.
- Tablas con los encabezados del plan (p. ej. recursos con Nombre/Dirección/Coordenadas/Fuente/Estado).
- Pies de fuente y fecha en cada bloque.
- Bloques de **carencia** explícitos donde no hay fuente verificada (fisiografía, hidrología,
  vías, redes de operadores, riesgos, medios y recursos), en lugar de datos inventados.
- Reutilización de SOCideas para población y superficie.

Primitivas reutilizables en `src/components/incideas/Documento.tsx`
(`SeccionDoc`, `SubseccionDoc`, `TablaDoc`, `TablaClaveValor`, `Carencia`, `PieFuente`).

## 16. Limitaciones

- Sin autenticación de usuario real: la revisión se protege con token compartido.
- Límite municipal desde OSM (colaborativa), no oficial. IGN WFS queda pendiente como alternativa oficial.
- OSM no es fiable para capacidades, aforos, personal ni situación operativa.
- El conector OSM consulta por bbox rectangular, por lo que captura recursos de municipios
  vecinos; la validación espacial los marca como `fuera_municipio` (99 en Benidorm) en lugar
  de descartarlos, según lo previsto.
- `INCIDEAS_REVIEW_TOKEN` está configurado en `.env.local` (local). Para el despliegue hay que
  añadirlo en Vercel; el servidor de desarrollo en marcha debe reiniciarse para leerlo.
- Detección de duplicados heurística; requiere revisión humana.
- No hay conectores autonómicos (Comunitat Valenciana) en esta iteración.

## 17. Información pendiente de obtención manual

Personas con necesidades especiales (agregada), animales de compañía por hogar, hidrantes,
saneamiento, centros de transformación, recursos municipales y de empresas, capacidades
reales de albergue, contactos operativos, cartografía oficial de riesgos (PATRICOVA/SNCZI).

---

## 17-bis. Ampliación de fuentes (2026-10-01)

Detalle completo en [incideas-cerebro.md](./incideas-cerebro.md). Resumen:

| Conector | Fuente | Tipo | Benidorm |
|---|---|---|---|
| `gva-centros-docentes` | GVA, centros docentes (ICV WFS, CC BY 4.0) | oficial | 36 |
| `gva-centros-sanitarios` | GVA, Sistema Valenciano de Salud (ICV WFS, CC BY 4.0) | oficial | 4 |
| `minetur-carburantes` | MITECO, Geoportal de Gasolineras (REST) | oficial | 10 |
| `osm-movilidad` | OSM Overpass, área `ine:municipio` | colaborativa | 247 |
| `osm-emergencias` | OSM Overpass, área `ine:municipio` | colaborativa | 6 |

Cargados con `--go` y verificada la idempotencia en Supabase (segunda pasada: `sin_cambios`).
`--nombre-municipio` ya no es necesario si hay credenciales: el nombre se lee de `municipios`.

Correcciones del pipeline:

- **Comparación de campos**: JSONB reordena claves y `JSON.stringify` es sensible al orden,
  por lo que cada pasada real marcaba `atributos` como actualizado (versión e historial
  espurios). Ahora la comparación es canónica.
- **Ámbito de bajas por conector**: antes se acotaba por la categoría declarada del conector, de
  modo que `osm-pois` nunca marcaba bajas en infraestructuras, servicios básicos ni animales, y
  un segundo conector Overpass habría marcado como bajas los registros del primero.
- **Respuesta vacía con errores** (Nominatim sin resultados, límite ausente): ya no genera bajas.
- **Titularidad**: errata «pubica» de la plantilla, «privado concertado» → mixta, y OSM toma
  `operator:type` en lugar de inferir «privada» de `operator`.

Encontrados al verificar con datos reales:

- **Truncado a 1.000 filas**: memoria, exportaciones, ficha y listados leían una sola página de
  PostgREST; con 1.238 registros, la memoria mostraba 7 de 10 gasolineras y la exportación se
  cortaba. Ahora todas las lecturas masivas paginan (`paginar.ts`).
- **Importación de la plantilla**: la clave de farmacia era el nombre, y casi todas las filas se
  llaman «Farmacia»: 41 filas colapsaban en 5 registros. La de partidas omitía el área. Claves
  corregidas (dirección; distrito, partida y área); los registros colapsados quedan como posibles
  bajas para revisión (63), sin borrar. Resultado: 41 farmacias y 58 partidas vigentes.
- **Huella como respaldo**: emparejaba homónimos sin coordenadas aunque tuvieran distinto
  `id_origen`, sobrescribiéndolos en cada pasada. Ahora solo empareja registros sin identificador.
- **Fecha de posible baja**: se reescribía en cada pasada; ahora conserva la primera ausencia.
- **CSV**: `nombre_oficial`, `fuente_principal`, `observaciones` y `crs_original` salían vacías
  (se buscaban con claves distintas). El CSV usa ahora las mismas claves que GeoJSON y XLSX.
- **Página pública de categoría**: no filtraba visibilidad restringida ni bajas.

La memoria sigue ahora la numeración del PTM de referencia y elige fuente por subcategoría.

## 18. Procedimiento para añadir otro municipio

```bash
npx tsx scripts/incideas/run-connector.ts --conector all --ine <INE5> \
  --nombre-municipio "<Nombre>" --repeticion 2            # dry-run
# tras aplicar la migración y con autorización:
npx tsx scripts/incideas/run-connector.ts --conector all --ine <INE5> \
  --nombre-municipio "<Nombre>" --go
```

## 19. Procedimiento para añadir otra comunidad autónoma

1. Verificar y documentar el endpoint oficial (esquema + respuesta real).
2. Registrar la fuente con `scripts/incideas/seed-fuentes.ts` (añadir a `FUENTES`).
3. Implementar un conector en `src/lib/incideas/connectors/` que mapee a `RawFeature`.
4. Registrarlo en `registry.ts` y añadir un test si aporta normalización específica.
5. No codificar reglas de una CCAA en el núcleo: encapsular en el conector.

## Procedimiento para añadir una categoría

1. Añadir la entrada en `src/lib/incideas/categorias.ts`.
2. Si necesita campos propios, crear tabla de extensión (patrón `incideas_ext_*`).
3. Añadir el mapeo correspondiente en los conectores.
4. Añadir el slug a `CATEGORIAS_VALIDAS` en `[categoria]/page.tsx`.

## Procedimiento de importación manual

`POST /api/incideas/importar` (multipart: `archivo`, `codigo_ine`, `categoria`) sube el
archivo y crea una fila en `incideas_importaciones` en estado `pendiente`. La publicación
no es automática. El componente `ImportacionManual` está disponible para incrustarlo.

## Reglas de protección de datos

- Nunca se almacenan nombres, DNI, direcciones particulares, teléfonos personales,
  diagnósticos, medicación individual ni localización exacta de personas identificables.
- Necesidades especiales: solo agregados por municipio/distrito/sector.
- El endpoint público `/api/incideas/registros` y las exportaciones excluyen
  `visibilidad in (restringida, personal_protegida)`.

---

## Cómo ejecutar

```bash
npm run incideas:test           # 40 tests (pipeline, conectores, exportación y memoria)
npm run incideas:seed-fuentes   # dry-run del catálogo de fuentes (--go para escribir)
npm run incideas:dry-run        # pipeline completo contra fuentes reales, 2 pasadas, sin escribir
```

---

## Archivos de esta iteración

**Nuevos**
- `supabase/migrations/039_incideas_pipeline.sql`
- `supabase/migrations/040_incideas_atributos.sql`
- `src/lib/incideas/pipeline/{types,normalize,huella,geo,dedup,upsert,runner,memory-store,store-supabase,utm}.ts`
- `scripts/incideas/{deps,import-xlsx}.ts`
- `src/lib/incideas/connectors/{types,http,nominatim-boundary,osm-pois,ine-poblacion,registry}.ts`
- `src/app/api/incideas/registros/route.ts`
- `src/app/api/incideas/revision/route.ts`
- `src/app/incideas/[codigoINE]/revision/page.tsx`
- `src/app/incideas/[codigoINE]/mapa/page.tsx`
- `src/components/incideas/RevisionInbox.tsx`
- `src/components/incideas/MapaControlCalidad.tsx`
- `src/components/incideas/Documento.tsx` (primitivas de presentación documental)
- `src/lib/incideas/fuentes-socideas.ts` (reutilización de datos SOCideas)
- `src/lib/incideas/memoria.ts` (ensamblado de la memoria)
- `src/app/incideas/[codigoINE]/memoria/page.tsx` (memoria estilo PTM)
- `scripts/incideas/{seed-fuentes,run-connector}.ts`
- `scripts/tests/incideas-pipeline.test.ts`
- `docs/incideas-piloto.md`

**Modificados**
- `src/app/api/incideas/exportar/route.ts` (GeoJSON + trazabilidad)
- `src/app/incideas/[codigoINE]/page.tsx` (accesos a revisión/mapa/exportación)
- `src/app/incideas/[codigoINE]/[categoria]/page.tsx` (slug correcto)
- `package.json` (scripts `incideas:*`)

**No incluidos** (trabajo ajeno en el árbol de trabajo): cambios de `socideas/secciones`,
branding de módulos (`src/app/page.tsx`, `ModuleBrandGrid`, `brand-modules.ts`, `public/logo/*`).
