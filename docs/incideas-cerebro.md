# INCideas — Cerebro del sistema

Documento de arquitectura viva de INCideas: de dónde sale cada dato, cómo entra, dónde
se guarda, cómo se mantiene y qué falta. Verificado contra el código de la rama
`feat/incideas-cerebro` (base: `feat/incideas-piloto-datos`). Complementa a
[incideas-piloto.md](./incideas-piloto.md), que recoge el piloto de Benidorm (03031).

La versión navegable está en `/incideas/arquitectura`; el catálogo vivo de fuentes, en
`/incideas/fuentes`.

---

## 1. Vista por capas

```
CAPA 0  Plataforma compartida (IDEAS Sostenibilidad)
        Supabase: municipios (geom Point/4326), provincias, comunidades_autonomas
        SOCideas: envelope R2 socideas/v2/municipios/<INE>.json
CAPA 1  Fuentes externas
        Oficiales:   INE jaxiT3 29005 (padrón) · MITECO Geoportal de Gasolineras (REST)
                     GVA/ICV WFS: centros docentes · centros sanitarios del SVS
        Municipal:   plantilla XLSX («Limpieza info», UTM 30N)
        Colaborativa: OSM Nominatim (límite) · OSM Overpass (POIs, transporte, emergencias)
CAPA 2  Conectores                    src/lib/incideas/connectors/
        registry → osm-boundary · osm-pois · ine-poblacion · osm-movilidad ·
                   osm-emergencias · minetur-carburantes · gva-centros-docentes ·
                   gva-centros-sanitarios
        http.ts (User-Agent, timeout, reintentos) · overpass.ts (área por INE, espejo)
        gva-icv.ts (WFS ICV, EPSG:25830 → WGS84)
CAPA 3  Pipeline                      src/lib/incideas/pipeline/
        normalize → huella → geo (validación espacial) → upsert → dedup
        runner · store-supabase · memory-store · utm
CAPA 4  Almacenamiento (Supabase PostGIS)
        incideas_registros · incideas_fuentes · incideas_ejecuciones ·
        incideas_historial · incideas_revisiones · incideas_importaciones ·
        incideas_ext_albergue · incideas_ext_veterinaria
CAPA 5  API                           src/app/api/incideas/
        registros (GET público) · revision (GET; POST con token) ·
        exportar (json · csv · geojson · xlsx) · importar (POST)
CAPA 6  UI                            src/app/incideas/
        portada · municipios · metodologia · fuentes · arquitectura ·
        [INE] · [INE]/[categoria] · [INE]/memoria · [INE]/revision · [INE]/mapa
CAPA 7  Operación (CLI, tsx)          scripts/incideas/
        seed-fuentes · run-connector · import-xlsx · deps
        tests: scripts/tests/incideas-pipeline.test.ts (40)
```

Regla de dependencia: cada capa solo conoce a la inmediatamente inferior. Un conector
descarga y mapea a `RawFeature`; no persiste. El `runner` normaliza, valida y persiste a
través de la interfaz `RegistroStore`, lo que permite probar la lógica sin base de datos.

## 2. Flujo de datos

```mermaid
flowchart TD
  subgraph EXT[Fuentes externas]
    INE[INE 29005<br/>padrón]
    MIT[MITECO<br/>Geoportal Gasolineras]
    GVA[GVA / ICV WFS<br/>docentes · sanitarios]
    XLS[Plantilla municipal XLSX]
    NOM[OSM Nominatim<br/>límite]
    OVP[OSM Overpass<br/>POIs · transporte · emergencias]
  end
  subgraph CON[Conectores]
    C1[ine-poblacion]
    C2[minetur-carburantes]
    C3[gva-centros-docentes<br/>gva-centros-sanitarios]
    C4[osm-boundary]
    C5[osm-pois · osm-movilidad<br/>osm-emergencias]
  end
  subgraph PIPE[Pipeline]
    NRM[normalize + procedencia] --> HUE[huella] --> GEO[validación espacial] --> UPS[upsert idempotente]
    UPS --> DED[dedup]
  end
  subgraph SB[(Supabase PostGIS)]
    REG[incideas_registros]
    FUE[incideas_fuentes]
    EJE[incideas_ejecuciones]
    HIS[incideas_historial]
    REV[incideas_revisiones]
  end
  SOC[(R2 · SOCideas)]
  INE --> C1 --> NRM
  MIT --> C2 --> NRM
  GVA --> C3 --> NRM
  NOM --> C4 --> NRM
  OVP --> C5 --> NRM
  XLS -->|import-xlsx| NRM
  UPS --> REG
  REG --> HIS
  REG --> REV
  FUE --> EJE --> REG
  REG --> MEM[memoria.ts + seleccion-fuentes.ts]
  FUE -->|rango de fuente| MEM
  SOC -->|lectura| MEM
```

## 3. Origen, entrada y mantenimiento de cada dato

| Dato | Fuente | Conector | Destino (categoría/subcategoría) | Actualización | Rango |
|---|---|---|---|---|---|
| Límite municipal | OSM/Nominatim | `osm-boundary` | territorio/limite_municipal | manual | colaborativa |
| Padrón (serie anual) | INE 29005 | `ine-poblacion` | poblacion | anual | oficial |
| Población, estructura, superficie, densidad | SOCideas | lectura R2 | no se copia | al sincronizar SOCideas | oficial |
| Centros docentes no universitarios | GVA (Educación) vía ICV WFS | `gva-centros-docentes` | equipamientos/colegio, instituto, escuela_infantil, educacion_especial, centro_formacion | mensual (origen) | oficial |
| Hospitales, centros de salud y de especialidades (red pública) | GVA (Sanidad) vía ICV WFS | `gva-centros-sanitarios` | equipamientos/hospital, centro_salud, centro_especialidades | mensual (origen) | oficial |
| Estaciones de servicio | MITECO, Geoportal de Gasolineras | `minetur-carburantes` | servicios_basicos/estacion_servicio | diaria (origen) | oficial |
| Núcleos, partidas, paradas, farmacias, centros educativos | Plantilla municipal XLSX | `import-xlsx` | territorio/partida, infraestructuras/parada_autobus, equipamientos/* | por revisión del plan | municipal |
| Equipamientos, alojamientos, combustible, veterinarias | OSM/Overpass (bbox) | `osm-pois` | equipamientos, infraestructuras, servicios_basicos, animales | manual | colaborativa |
| Paradas de autobús, tren y tranvía, taxi, helipuertos | OSM/Overpass (área INE) | `osm-movilidad` | infraestructuras/parada_autobus, estacion_ferrocarril, parada_tranvia, parada_taxi, helipuerto | manual | colaborativa |
| Hidrantes, puntos de agua, DEA, ambulancias, socorrismo, puntos de encuentro | OSM/Overpass (área INE) | `osm-emergencias` | servicios_basicos/hidrante, punto_agua_incendios; medios_recursos/*; evacuacion/punto_encuentro | manual | colaborativa |

Resultado en Benidorm (2026-10-01): 36 centros docentes y 4 centros sanitarios oficiales,
10 estaciones de servicio oficiales, 247 elementos de transporte y 6 de emergencias de OSM.
OSM no tiene hidrantes mapeados en el término; la ausencia no significa inexistencia.

Notas de fuente:

- **MITECO** identifica el municipio con un código interno (`IDMunicipio`), no con el INE. Se
  resuelve por nombre (con variantes bilingües y artículos) y, si no hay coincidencia única,
  filtrando la provincia por el límite municipal. Los precios no se guardan: cambian a diario
  y generarían una actualización por estación en cada ejecución.
- **GVA/ICV** publica en EPSG:25830; se reproyecta con `utm.ts` (ETRS89 ≈ WGS84 a esta escala).
  Las capas se filtran por `cod_ine_mun`. Solo aplican a las provincias 03, 12 y 46
  (`aplica()`); el CLI las omite fuera de la Comunitat Valenciana.
- **Overpass**: `osm-movilidad` y `osm-emergencias` consultan por el área OSM con
  `ine:municipio=<INE>`, sin capturar municipios vecinos (Benidorm: 9 gasolineras en el término
  frente a 27 por bbox). Si el área no existe, recurren al bbox y lo indican. `osm-pois` mantiene
  el bbox a propósito para conservar recursos próximos (hospital comarcal), marcados
  `fuera_municipio` o `proximo_limite`.

## 4. Modelo relacional

```
municipios(codigo_ine) ──1:N──> incideas_registros(codigo_ine)      ON DELETE CASCADE
municipios(codigo_ine) ──1:N──> incideas_ejecuciones(codigo_ine)    ON DELETE CASCADE
municipios(codigo_ine) ──1:N──> incideas_importaciones(codigo_ine)  ON DELETE CASCADE
incideas_fuentes(id)   ──1:N──> incideas_ejecuciones(id_fuente)     ON DELETE SET NULL
incideas_registros(id) ──1:N──> incideas_historial(registro_id)     ON DELETE CASCADE
incideas_registros(id) ──1:N──> incideas_revisiones(registro_id)    ON DELETE CASCADE
incideas_registros(id) ──1:1──> incideas_ext_albergue(registro_id)
incideas_registros(id) ──1:1──> incideas_ext_veterinaria(registro_id)
```

`incideas_registros.id_ejecucion_ultima` referencia lógicamente a la última ejecución,
pero no es clave foránea. `categoria` y `subcategoria` no tienen restricción CHECK: las
subcategorías nuevas no requieren migración.

Claves de idempotencia (índices únicos parciales, solo filas no dadas de baja):

- `(codigo_ine, categoria, fuente_principal, id_origen)` cuando hay `id_origen`.
- `(codigo_ine, categoria, huella)` cuando no lo hay.

Identificadores de origen: `node|way|relation/<id>` (OSM), `IDEESS/<id>` (MITECO),
`codcen/<código de centro>` (GVA docentes), `cen_cod/<código>` (GVA sanitarios).

## 5. Ciclo de vida de un registro

1. **Ejecución.** Cada carga es una fila de `incideas_ejecuciones` (conector, versión,
   contadores, errores, resumen de calidad).
2. **Idempotencia.** `findByIdOrigen`, después `findByHuella`, después insertar o actualizar.
   - La huella solo empareja registros guardados sin `id_origen` (o con el mismo). Dos homónimos
     sin coordenadas y con distinto identificador (partidas que abarcan varias áreas) son
     entidades distintas y no se sobrescriben entre sí.
   - La comparación de campos es canónica (claves ordenadas): JSONB no conserva el orden de
     inserción y, sin esto, cada pasada contra Supabase marcaba `atributos` como cambiado.
3. **Protección de validados.** Con `estado_validacion` en `validado_tecnicamente`,
   `validado_ayuntamiento` o `restringido`, la carga automática no sobrescribe: deja una traza
   `observar`.
4. **Posibles bajas.** Lo que desaparece de la fuente se marca (`desactualizado_desde`,
   `motivo_baja`), nunca se borra, y se restaura si reaparece. Reglas:
   - El **ámbito** lo declara cada conector (`ambito`: categorías y subcategorías de su fuente
     de las que es responsable). Así dos conectores con la misma fuente (tres de Overpass) no
     se marcan bajas entre sí, y un conector que emite varias categorías las cubre todas.
   - Una respuesta **parcial**, o **vacía con errores**, nunca genera bajas y deja la ejecución
     como `parcial`.
   - Un registro emparejado por huella cuenta como visto aunque su clave guardada difiera.
   - `desactualizado_desde` conserva la fecha de la **primera** ausencia.
   - La memoria no presenta las posibles bajas como inventario vigente (indica cuántas excluye);
     la exportación las incluye con la columna `posible_baja_desde`.
5. **Historial.** Una fila de `incideas_historial` por campo cambiado (valor anterior y nuevo).
6. **Revisión.** `POST /api/incideas/revision` (cabecera `x-review-token`,
   `INCIDEAS_REVIEW_TOKEN`). Acciones: `validar`, `validar_ayuntamiento`, `marcar_conflictivo`,
   `marcar_pendiente`, `marcar_obsoleto`, `aceptar_valor`, `rechazar_valor`,
   `corregir_categoria`, `corregir_geometria`, `observar`, `confirmar_baja`.
7. **Caducidad.** Definida por categoría en `categorias.ts` (`caducidad_meses`).

Estados:

- `estado_validacion` (11): `automatico_sin_revisar`, `contrastado`, `validado_tecnicamente`,
  `validado_ayuntamiento`, `incompleto`, `conflictivo`, `potencialmente_obsoleto`,
  `no_disponible`, `restringido`, `estimado`, `pendiente_municipal`.
- `estado_espacial`: `valido`, `fuera_municipio`, `proximo_limite`, `sin_geometria`,
  `geometria_invalida`, `coordenadas_sospechosas`, `localizacion_aproximada`.
- `visibilidad`: `publica`, `tecnica`, `restringida`, `personal_protegida`. Las dos últimas
  no salen nunca por API pública ni por exportación.

Titularidad normalizada: `publica`, `privada`, `mixta` (concertado). En OSM se toma de
`operator:type`; la mera presencia de `operator` ya no implica titularidad privada.

## 6. Selección de fuente en la memoria

Varias fuentes describen el mismo recurso (un colegio está en GVA, en la plantilla municipal y
en OSM). La memoria no los mezcla: para cada `categoria/subcategoria` usa solo el grupo de
fuentes de mayor rango presente, según el tipo registrado en `incideas_fuentes`:

1. `oficial_*` · 2. municipal, operador u otros · 3. `colaborativa`.

El resto queda como contraste y el pie de cada tabla lo cuantifica, junto con la atribución
ODbL cuando se usa OSM (`src/lib/incideas/seleccion-fuentes.ts`). Personal y alumnado, que solo
aporta la plantilla municipal, se incorporan a la tabla oficial cuando el nombre normalizado
coincide. La numeración sigue la del PTM de referencia (2.1–2.8, 5.9, Anexo II).

## 7. OpenStreetMap: alcance y límites

| Tema OSM | Etiquetas | Estado |
|---|---|---|
| Equipamientos, sanidad, educación, seguridad, alojamientos, combustible, veterinarias | `amenity`, `healthcare`, `office`, `tourism`, `shop` | `osm-pois` |
| Paradas y estaciones, taxi, helipuertos | `highway=bus_stop`, `railway`, `amenity=taxi`, `aeroway` | `osm-movilidad` |
| Hidrantes, puntos de agua, DEA, ambulancias, socorrismo, puntos de encuentro | `emergency=*` | `osm-emergencias` |
| Red viaria, ferrocarril (trazado), hidrografía, usos del suelo | `highway`, `railway`, `waterway`, `landuse` | pendiente |

Las capas lineales y poligonales exigen `out geom`, volumen mucho mayor, simplificación y
decidir si se guardan en `incideas_registros` o en una tabla de geometrías aparte.

Licencia y uso: ODbL 1.0 (atribución «© OpenStreetMap contributors» y share-alike), registrada
en cada registro y en la hoja «Léame» del XLSX. OSM no es dato oficial: entra como
`automatico_sin_revisar`. Overpass responde a veces 200 con HTML de error cuando está saturado;
`overpass.ts` lo detecta y prueba el espejo.

## 8. Lecturas masivas y paginación

PostgREST trunca en silencio cada respuesta al máximo configurado (1.000 filas en Supabase).
Benidorm ya supera las 1.300. Toda lectura masiva (memoria, exportaciones, ficha, listados por
categoría y claves para detectar bajas) pasa por `src/lib/incideas/paginar.ts`, con orden total
por `id`. La API pública `registros` ya paginaba (máximo 200 por página, con total).

## 9. Exportaciones

`GET /api/incideas/exportar?codigo_ine=<INE>[&categoria=<id>]&formato=json|csv|geojson|xlsx`

Todos los formatos conservan id, INE, categoría, subcategoría, nombre, dirección, coordenadas,
fuente, id_origen, huella, fechas, estados, licencia y advertencias; excluyen visibilidad
restringida o personal protegida y registros dados de baja. El XLSX añade `geometria_wkt` y una
hoja «Léame» con fuentes, licencias, atribución ODbL y advertencias.

## 10. Actualización automática: recomendación

Hoy los conectores se lanzan por CLI:

```bash
npx tsx scripts/incideas/run-connector.ts --conector all --ine <INE>            # dry-run
npx tsx scripts/incideas/run-connector.ts --conector all --ine <INE> --go       # escribe
npx tsx scripts/incideas/run-connector.ts --conector gva-centros-docentes,minetur-carburantes --ine <INE> --go
```

Con credenciales en `.env.local`, el dry-run lee de la base el límite y el nombre del municipio
(solo lectura). Recomendación: **GitHub Actions programado** que invoque el CLI por municipio,
con frecuencia por fuente (MITECO y GVA semanal o mensual; OSM mensual; INE anual). Vercel Cron
encaja mal con la duración de Overpass y `pg_cron` no puede ejecutar la lógica, que vive en
TypeScript. No implementado: requiere secretos y autorización.

## 11. Carencias conocidas

- Sin autenticación de usuario: la revisión usa un token compartido.
- Límite municipal desde OSM, no oficial (IGN WFS solo GML).
- Duplicados entre fuentes: la memoria elige fuente, pero no hay fusionar/separar en la bandeja.
  Las paradas de autobús de OSM generan muchos «posibles duplicados» por parejas de paradas
  homónimas en sentidos opuestos.
- Sin camas, cartera de servicios ni consultorios auxiliares en sanidad; sin alumnado ni
  personal en la fuente oficial docente.
- Sin fuente verificada para riesgos, hidrantes (servicio de aguas), DEA (registro autonómico),
  servicios sociales, necesidades especiales (agregadas) y capacidades de albergue.
- Fuentes autonómicas solo para la Comunitat Valenciana.
- Sin planificación automática de conectores (sección 10).
- El mapa de control carga como máximo 200 puntos por filtro (API paginada); con municipios
  grandes conviene agrupación o carga por teselas.
