# Fase 2A — Contrato de datos: peligrosidad de inundación e hidrografía

> Alcance: Benidorm (03031, Comunitat Valenciana) y Murcia (30030, Región de
> Murcia). Solo lecturas públicas y artefactos locales en `salida/fase2a/`.
> Restricciones vigentes: SOCideas intacto, `municipios.poblacion` sin
> modificar, ninguna escritura en sistemas reales, ni publicación remota ni
> despliegue sin autorización.

## 1. Productos PATRICOVA (procedencia original: Generalitat Valenciana)

Tres productos distintos, no intercambiables. Definiciones literales del
catálogo oficial (`dadesobertes.gva.es`, verificadas el 2026-10-06):

1. **Peligrosidad por inundación** — «probabilidad de ocurrencia de una
   inundación, dentro de un período de tiempo determinado y en un área dada».
   6 niveles (1–6, de mayor a menor) **más un séptimo nivel de peligrosidad
   geomorfológica**. La peligrosidad geomorfológica es un nivel dentro de
   este producto, no un producto aparte.
2. **Riesgo de inundación** — «combinación de la peligrosidad por inundación
   y de la vulnerabilidad del uso del suelo», con factores económicos,
   sociales y medioambientales susceptibles de daño.
3. **Estudios de inundabilidad** — «concreción del riesgo de inundación en
   un determinado ámbito geográfico». Cada estudio delimita su propio
   ámbito; un estudio no es cobertura autonómica.

Capas físicas: `infraestructuras.gdb/orde_patricova_peligrosidad_inun`,
`…/orde_patricova_riesgo_inun`, `…/orde_patricova_estudios_inun`.

### Accesos realmente probados (2026-10-06, solo lecturas públicas)

| Vía | Resultado |
| --- | --------- |
| Recurso «Descarga en formato SHP» del catálogo (`descargas.icv.gva.es/…/index.html?...`) | **No es descarga directa**: devuelve `text/html` (6.484 bytes), una página que lanza una tarea asíncrona ArcGIS (`…/GPServer/tarea_descarga_datos/submitJob`) y publica el ZIP al terminar. Estado: **necesita mecanismo adicional** (el propio mecanismo oficial). La cadena lo ejecuta y deja evidencia. |
| Servicio WMS (`carto.icv.gva.es/…/ordenacion_territorial/MapServer/WmsServer`) | **Funciona** (`GetCapabilities` 200, ~112 KB). |
| PDF de definición de datos (`icvficherosweb.icv.gva.es/…orde_patricova_{peligrosidad,riesgo,estudios}_inun.pdf`) | **Funcionan** (139–152 KB cada uno). |
| ArcGIS REST `…/MapServer?f=json` | **Falla** desde este entorno (HTTP 400). Se registra, no se rodea. |

### Las «12 hojas»: verificación con el contenido real (2026-10-06)

Resuelto con evidencia, no como cobertura supuesta: cada producto PATRICOVA
se distribuye como **un único shapefile autonómico** (7 ficheros por ZIP:
`cpg/dbf/prj/sbn/sbx/shp/shx`; sin particiones en hojas):

- `orde_patricova_peligrosidad_inun0.*` — 8.590.509 bytes, 8.415 objetos.
- `orde_patricova_riesgo_inun0.*` — 5.084.154 bytes, 7.710 objetos.
- `orde_patricova_estudios_inun0.*` — 17.305 bytes, 207 objetos **puntuales**
  (localización del expediente, no polígonos de ámbito).

No existe ninguna distribución oficial en 12 hojas: ni el catálogo CKAN
(3 productos + 1 DANA), ni el WMS, ni la página de descarga, ni los PDF, ni
los ZIP. **No se presenta ninguna cifra de hojas como cobertura completa.**
La cobertura autonómica de cada SHP se verifica por su BBOX
(peligrosidad −1,53/37,85–0,51/40,79; riesgo similar; estudios en UTM 30N
reproyectado) y por recuento, todo en el informe de cada ejecución.

### Distribuidor alternativo

Cuando corresponda, la distribución nacional equivalente es **MITECO/SNCZI**
(láminas T10/T100/T500 y ARPSI). Procedencia: se conserva
**Generalitat/PATRICOVA como origen** y **MITECO/SNCZI como distribuidor**;
nunca se etiqueta un dato SNCZI como PATRICOVA ni viceversa.

### Aplicabilidad territorial

PATRICOVA solo es aplicable en la Comunitat Valenciana. Para Murcia (30030)
figura como **NO_APLICABLE por ámbito territorial** (ver §5).

## 2. Hidrografía (fuente: IGN, IGR Hidrografía v0, servicio WFS INSPIRE)

- Endpoint: `https://servicios.idee.es/wfs-inspire/hidrografia` (WFS 2.0.0,
  verificado 2026-10-06). 15 tipos; para esta fase se usan
  `hy-p:Watercourse` (aguas físicas, representación cartográfica) y
  `hy-n:WatercourseLink` (modelo de red, análisis espacial).
- CRS por defecto del servicio: `EPSG:4258` (ETRS89 geográfico).
- Los resultados son **objetos o tramos originales** hasta comprobar su modelo
  de identidad. Cada miembro WFS (`gml:id`) cuenta como objeto; varios
  miembros pueden compartir el mismo `hydroId`/`localId` sin que eso los
  fusione. Se publican separados, siempre:
  - `n_objetos` (miembros/tramos devueltos),
  - `n_con_nombre` (miembros con topónimo),
  - `n_nombres_distintos`,
  - `n_localid_distintos` (agrupación observada por hydroId; **no** es
    reconciliación),
  - `n_entidades_reconciliadas` = **no determinado** hasta validar el modelo
    de identidad. Un topónimo único **no** demuestra un cauce único, y un
    hydroId compartido tampoco fusiona tramos por sí solo.
- Se distingue `n_intersectan_termino` (intersección real con el polígono
  municipal) de `n_solo_bbox` (entra en el BBOX pero no toca el término).
- El recorte conserva la **geometría e identificador originales** y añade la
  geometría recortada + longitud municipal (m). Nada se repara ni se fusiona.

## 3. Escenarios de inundación T10 / T100 / T500

- **El número de polígonos nunca es prueba de crecimiento físico.**
- La comparación solo vale entre escenarios **del mismo estudio y versión**;
  se comparan extensión y geometrías y se cuantifican las áreas de cada
  escenario que **no quedan contenidas** en el superior
  (`T10 ∖ T100`, `T100 ∖ T500`), documentando discrepancias **sin reparar
  los datos** para forzar el resultado.
- Caudal, hipótesis, modelo, escala y fecha de aprobación se conservan
  **únicamente** cuando están presentes y correctamente interpretados en los
  atributos de origen; no se propagan a objetos que no los traen.
- Vía raster verificada (INSPIRE `wms-inspire/riesgos-naturales/inundaciones`,
  capas `NZ.Flood.FluvialT10/T100/T500`): el `GetMap` exige `styles` vacío
  (`styles=default` → `StyleNotDefined`); el `GetFeatureInfo` devuelve
  cobertura raster (`GRAY_INDEX`). Es consulta de mapa, no geometría
  vectorial: no produce áreas de contención.

## 4. Consultas y cobertura

### Tabla de orden de ejes (por servicio, versión y CRS; sin reglas generales)

| Servicio | Versión | CRS del BBOX | Orden exigido |
| --- | --- | --- | --- |
| IGN hidrografía WFS | 2.0.0 | `urn:ogc:def:crs:EPSG::4258` | lat,lon (minLat,minLon,maxLat,maxLon) |
| IGN hidrografía WFS | 1.1.0 | `EPSG:4326` | lat,lon (el servidor aplica el orden EPSG) |
| INSPIRE inundaciones WMS | 1.3.0 | `EPSG:4326` | lat,lon |
| INSPIRE inundaciones WMS | 1.3.0 | `CRS:84` | lon,lat |
| INSPIRE inundaciones WMS | 1.1.1 | `EPSG:4326` (`srs=`) | lon,lat |

«Latitud, longitud» **no** es regla general: cada consulta declara
servicio + versión + CRS y ordena en consecuencia. El intercambio de ejes es
la trampa T1 y tiene prueba de regresión.

### Trampas convertidas en regresión (`scripts/tests/fase2a-contrato.test.ts`)

- **T1 orden de ejes**: la misma consulta con ejes correctos e
  intercambiados no puede dar el mismo conjunto; el pipeline detecta el caso
  degenerado (cero resultados o mar) y lo registra.
- **T2 filtros ignorados**: toda consulta filtrada se acompaña de su control
  sin filtro y de `resultType=hits`. Un resultado idéntico al control
  **impide afirmar que el filtro se aplicó** (`filtro_verificado=false`).
- **T3 parámetros incompatibles**: combinaciones que el servidor rechaza
  (`styles=default` en el WMS INSPIRE, `typenames` inexistente, CRS no
  ofertado…) deben aflorar como excepción registrada, nunca como éxito
  silencioso.

Paginación: se usan `resultType=hits` (totales), `count`/`startIndex` y se
registran `numberMatched`/`numberReturned`; si el servidor trunca, el
informe lo dice y el recuento se marca provisional.

### Estados de consulta (exhaustivos y excluyentes)

`CONSULTA_VALIDA` (éxito con resultados) · `VALIDA_CERO` (consulta válida,
cero resultados) · `FUENTE_INACCESIBLE`
(red/servidor inalcanzable desde el entorno) · `CONSULTA_FALLIDA`
(el servidor responde error) · `COBERTURA_NO_DETERMINADA` (sin evidencia de
cobertura) · `AUSENCIA_CONFIRMADA` (publicación inexistente, verificada) ·
`NO_APLICABLE` (fuera de ámbito territorial, p. ej. PATRICOVA en Murcia).

## 5. Ejecución: cadena vertical por municipio

Por municipio, con el mismo código y sin reglas ad-hoc:

1. Descarga oficial (límite IGN AU, hidrografía IGN, PATRICOVA si aplicable,
   SNCZI/INSPIRE raster, evidencias con hash y URL).
2. Normalización + evidencia (objetos originales intactos).
3. Recorte municipal (intersección real; longitudes/áreas municipales).
4. Exposición con el inventario activo y público (Benidorm: artefactos
   locales `salida/incideas_03031`; Murcia: sin inventario publicado →
   `COBERTURA_NO_DETERMINADA`, mismo código).
5. Consulta en mapa (`mapa.html` local) y tablas (Excel).
6. Exportación coherente Excel + GeoPackage (+ GeoJSON): misma foto
   (`snapshot_utc`), mismos recuentos en todos los formatos.
7. Pruebas independientes (`fase2a-contrato.test.ts` + informe de ejecución).

Murcia ejecuta el mismo pipeline; PATRICOVA figura como `NO_APLICABLE`.
Ninguna regla específica de municipio para obtener coincidencias.
