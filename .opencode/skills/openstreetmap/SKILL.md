---
name: openstreetmap
description: >
  Trabaja de forma correcta, legal y técnica con OpenStreetMap (OSM): mapa,
  geocodificación, Overpass, teselas, enrutado, GeoJSON, Leaflet, MapLibre,
  atribución ODbL y datos de España. USE WHEN el usuario pida mapas, OSM,
  OpenStreetMap, Overpass, Nominatim, geocoding, reverse geocoding, teselas,
  tiles, Leaflet, MapLibre, OpenLayers, OSRM, Valhalla, GraphHopper, POI,
  calles, direcciones, límites municipales, rutas, o cualquier consulta o
  visualización basada en datos de OpenStreetMap. No uses Google Maps, Mapbox
  por defecto, ni WMS catastral como si fueran OSM.
license: MIT
compatibility: Claude Code, OpenCode, Cursor, Copilot, Codex, Gemini CLI, Amp, any agent that loads SKILL.md
metadata:
  author: Carlos Olivas
  domain: openstreetmap
  version: "1.0"
---

# OpenStreetMap

Eres un agente que usa OpenStreetMap de forma correcta. OSM es una base de datos geográfica colaborativa, no un producto comercial de mapas y no es Google Maps. Los datos son libres bajo ODbL. Los servidores públicos de la OpenStreetMap Foundation (teselas, Nominatim, Overpass) son de capacidad limitada, se financian con donaciones y no son un backend de producción.

Antes de escribir código, elegir un servicio o inventar una consulta, aplica este documento entero. Si una petición exige un uso masivo, comercial, automático o de geocodificación genérica, no incrustes los servicios públicos de OSMF. Explica la restricción y elige una alternativa permitida.

## Decisión inmediata

Elige una sola vía según la tarea real:

Mostrar un mapa interactivo: teselas de un proveedor que lo permita, o teselas propias. No uses `tile.openstreetmap.org` en una aplicación con tráfico real, ni en un producto desplegado, ni para uso comercial. Atribución visible siempre.

Buscar un lugar o una dirección: no uses Nominatim público como buscador genérico de una app, ni como autocompletado, ni como geocodificación masiva. Para una consulta puntual, identificada, a menos de 1 petición por segundo, con caché y atribución, Nominatim puede usarse solo si el desarrollador lo decide de forma informada y se cita la política. En cualquier producto, prefiere Photon, Nominatim propio, Pelias, LocationIQ, Geoapify, MapTiler o un geocodificador comercial.

Obtener elementos OSM (edificios, comercios, carreteras, límites) en un área pequeña: Overpass API, con caja acotada, etiquetas reales y `out geom`. Nunca descargues un municipio entero "por si acaso", ni un país, ni todos los POI de una región.

Obtener un recorte grande (provincia, CCAA, país): descarga un extracto (Geofabrik u Osmium sobre PBF). Overpass no es un planet downloader.

Calcular una ruta: motor de enrutado (OSRM, Valhalla, GraphHopper) propio o de un proveedor. Las demos públicas no son API de producción.

Editar el mapa mundial: solo si el usuario lo pide de forma explícita. Nunca copies Google, Bing, HERE, Apple, Catastro gráfico como fuente de geometría para subir a OSM, ni hagas importaciones automáticas. La API 0.6 es para edición humana o importaciones acordadas con la comunidad, no para leer datos a granel.

Datos oficiales españoles (catastro, planeamiento, SIOSE, IGN): no son OSM. No los sustituyas por OSM ni mezcles licencias sin decirlo.

## Prohibiciones absolutas

No copies ni digitalices Google Maps, Google Satellite, Street View, Apple Maps, Bing, HERE u otras fuentes cerradas para crear o corregir OSM, ni para "mejorar" geometrías que luego se presenten como OSM.

No uses Nominatim público para autocompletado letra a letra, geocodificación por lotes, mallas de reverse geocoding, listas completas de códigos postales o municipios, reventa de geocodificación, ni como servicio genérico generado por una plataforma no-code / vibe-coding. La política de Nominatim lo prohíbe y el tráfico se bloquea.

No descargues teselas por adelantado, no hagas "guardar ciudad sin conexión" contra `tile.openstreetmap.org`, no hagas scraping de zoom alto, no uses HTTP (solo HTTPS), no envíes User-Agent de biblioteca (`python-requests`, `curl`, `okhttp`, `Go-http-client`).

No lances consultas Overpass en paralelo, no consultes cajas enormes, no uses `overpass-turbo.eu` como endpoint de API (es una interfaz; el endpoint es el interpreter). Si recibes 429, 504 o 406, espera al menos 30 segundos. No reintentes en bucle.

No inventes etiquetas OSM. Si no conoces la etiqueta, consulta Map Features y Taginfo. `amenity=shop` es incorrecto; las tiendas van con `shop=*`. Un restaurante es `amenity=restaurant`. Una carretera es `highway=*`, no `road=*`.

No trates OSM como WMS. No hay capas estilo Catastro. Los objetos son nodos, vías y relaciones con etiquetas.

No uses la API de edición (`api.openstreetmap.org/api/0.6`) para extraer datos de una zona. Esa API está pensada para editar, no para descargar ciudades.

No presentes OSM como si fuera cartografía oficial, ni límites municipales OSM como si sustituyeran al IGN o al registro. OSM es colaborativo y puede estar incompleto o desactualizado.

## Modelo de datos (obligatorio)

Tres elementos, y solo tres:

Un **node** es un punto (latitud, longitud). Un banco, un semáforo, un POI o un vértice de una vía.

Una **way** es una lista ordenada de nodos. Puede ser lineal (carretera, río) o cerrada (edificio, parque). Una way cerrada no siempre es un polígono: una rotonda es lineal. `area=yes` o el significado de la etiqueta deciden si es superficie. Una way tiene como máximo 2000 nodos.

Una **relation** agrupa otros elementos. Multipolígono (huecos), ruta de autobús, restricción de giro, frontera administrativa. El miembro tiene un rol (`outer`, `inner`, `from`, `to`, `stop`, etc.).

Las **tags** son pares clave=valor. Un elemento no puede tener dos veces la misma clave. Los identificadores de node, way y relation son espacios distintos: el node 100 y la way 100 no son el mismo objeto. Siempre identifica un objeto por tipo + id (`way/123`, `node/456`, `relation/789`).

Coordenadas: OSM y Overpass usan latitud, longitud. GeoJSON y muchas bases usan longitud, latitud. Leaflet usa `[lat, lng]`. MapLibre y Mapbox GL usan `[lng, lat]`. WMS/BBOX clásico suele ser `minx,miny,maxx,maxy` en el CRS del servicio. Nunca mezcles estos órdenes. Si un punto aparece en el océano o en África cuando debería estar en España, el orden está invertido.

Caja Overpass: `(sur, oeste, norte, este)` es decir `(minlat, minlon, maxlat, maxlon)`. Ejemplo Hellín: `(38.48, -1.72, 38.55, -1.64)`.

## Licencia y atribución

Los datos OSM se usan bajo Open Database License 1.0 (ODbL). Cualquiera puede usarlos, también con fines comerciales, con atribución y share-alike sobre bases derivadas.

En un mapa interactivo, coloca en una esquina, visible, un crédito del tipo «© OpenStreetMap contributors» con enlace a `https://www.openstreetmap.org/copyright`. No lo escondas detrás de un menú como única mención, no lo pongas fuera de pantalla, no des la impresión de que el mapa es de Google o de la app.

En una imagen estática, el mismo crédito sobre o junto a la imagen, salvo miniaturas, menos de 100 elementos o menos de 10 000 m².

Si geocodificas o enrutas con datos OSM, el producto debe acreditar OpenStreetMap.

Si redistribuyes datos OSM o una base derivada, sigue en ODbL. Un mapa renderizado es una Produced Work: puedes licenciar el gráfico como quieras, pero debes atribuir y, si te lo piden, indicar la procedencia de los datos.

Texto recomendado en interfaz:

`© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>`

Si usas un estilo o un proveedor de teselas ajeno, acredita también a ese proveedor, además de OSM.

## Identificación HTTP

Toda petición a un servicio OSMF desde servidor o script debe llevar un User-Agent propio, estable y contactable, nunca el de la biblioteca.

Ejemplo: `MiProyecto/1.0 (https://ejemplo.org; contacto@ejemplo.org)`.

Desde el navegador, no anules el Referer. No pongas `Referrer-Policy` que lo borre hacia los servidores de OSM.

## Teselas (el mapa de fondo)

URL canónica del estilo estándar OSMF, solo para pruebas locales leves o visualización comunitaria:

`https://tile.openstreetmap.org/{z}/{x}/{y}.png`

Requisitos si alguna vez se usa: HTTPS, atribución visible, User-Agent identificable, caché según cabeceras o mínimo 7 días, solo las teselas del viewport actual, sin prefetch, sin offline, sin `Cache-Control: no-cache`.

Para cualquier web, app, SaaS o tráfico no trivial, usa otra fuente: OpenFreeMap, Protomaps, Stadia Maps, MapTiler, Carto, Geoapify, un estilo propio con MapLibre, o teselas self-hosted (switch2osm). Leaflet + raster está bien en mapas simples. MapLibre GL JS es la opción correcta para vector. No uses Mapbox GL JS propietario sin cuenta y token de Mapbox.

No hardcodees el proveedor sin forma de cambiarlo. Un enlace «Reportar un error en el mapa» hacia `https://www.openstreetmap.org/fixthemap` es deseable.

## Nominatim (buscar por nombre)

Endpoint público: `https://nominatim.openstreetmap.org/`.

Política vigente que debes cumplir y, si sugieres este servicio, debes explicar al usuario: máximo 1 petición por segundo; User-Agent o Referer válido que identifique la aplicación; atribución; prohibido autocompletado; prohibidas consultas sistemáticas; prohibida la reventa; resultados en caché; un solo hilo; geocodificación masiva no fomentada; tareas largas o periódicas a 4 peticiones por minuto; las apps deben poder cambiar de proveedor sin actualizar el binario; uso en LLM solo si se explica esta política; el API público no debe incrustarse como geocodificador genérico de plataformas no-code.

Uso puntual correcto (una búsqueda disparada por una persona):

`https://nominatim.openstreetmap.org/search?q=Hell%C3%ADn&format=json&limit=1&addressdetails=1`

Reverse puntual:

`https://nominatim.openstreetmap.org/reverse?lat=38.512&lon=-1.701&format=json`

No uses `format=html`. No descargues la página de details. No hagas search-as-you-type. Parametriza `countrycodes=es` cuando el contexto sea España. No confíes en el primer resultado si el nombre es ambiguo: comprueba `class`, `type`, `boundingbox` y `display_name`.

Alternativas: Nominatim autoalojado, Photon (`photon.komoot.io` también tiene límites; para producto usa instancia propia), Pelias, LocationIQ, Geoapify, MapTiler Geocoding.

## Overpass (consultar objetos)

Endpoints públicos globales (elige uno; no martillees el principal):

`https://overpass-api.de/api/interpreter` (FOSSGIS; sobrecargado; uso ocasional pequeño)

`https://overpass.private.coffee/api/interpreter`

No uses Overpass para "todo Hellín", "toda España" o "todos los edificios de la provincia". Caja pequeña o `area` de un municipio, etiquetas concretas, `timeout` bajo (25–60), `out geom` o `out center`. Uso ocasional orientativo en overpass-api.de: muy por debajo de 10 000 consultas y 1 GB al día; si es periódico, dos órdenes de magnitud menos. Uso comercial: instancia propia o de pago.

Plantilla mínima. Sustituye etiquetas y bbox. Nunca dejes una bbox del tamaño de un país.

```
[out:json][timeout:25];
(
  nwr["amenity"="drinking_water"](38.48,-1.72,38.55,-1.64);
);
out geom;
```

Por área administrativa (más limpio que una caja si el nombre no es ambiguo):

```
[out:json][timeout:25];
area["admin_level"="8"]["name"="Hellín"]["boundary"="administrative"]->.a;
(
  nwr["shop"](area.a);
);
out geom;
```

Si el nombre se duplica, usa `wikidata` o, en España, `ine:municipio` cuando exista. No filtres solo por `name` a escala mundial.

Salida: `out geom` para dibujar vías y polígonos. `out center` si solo necesitas un punto. `out;` sin geom devuelve vías como lista de ids de nodos, inútiles para un mapa salvo que pidas también los nodos. Para GeoJSON, convierte con lógica de node / way cerrada / way abierta / relation multipolygon. Las relations no son polígonos mágicos: hay que ensamblar `outer` e `inner`.

Consulta por id estable:

```
[out:json][timeout:10];
way(123456789);
out geom;
```

En la práctica, prueba la consulta en Overpass Turbo (`https://overpass-turbo.eu/`) con el asistente, mira el recuento, y solo entonces la automatizas. Si la consulta tarda o corta, reduce el área o las etiquetas; no subas el timeout a 900 por costumbre.

Errores frecuentes de Overpass que debes evitar: olvidar `out geom`; usar `node["highway"="residential"]` (las calles son ways); usar `amenity=school` y perder `landuse=education` o `building=school` si el usuario pedía edificios escolares (pregunta qué necesita); usar `search` de Nominatim dentro de Overpass; pedir `out meta` sin necesidad (pesa más); concatenar decenas de consultas en un bucle.

## Etiquetas que sí existen (usa estas, no inventes)

Vías: `highway=motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|pedestrian|footway|cycleway|path|track|steps`. Nombre: `name`. Ref: `ref`. Un sentido: `oneway=yes`. Máxima: `maxspeed`.

Edificios: `building=yes` o valores como `house`, `apartments`, `industrial`, `church`. Dirección: `addr:street`, `addr:housenumber`, `addr:city`, `addr:postcode`.

Puntos de interés: `amenity=*` (cafe, restaurant, hospital, school, pharmacy, bank, toilets, parking, fountain, place_of_worship…). Tiendas: `shop=*`. Turismo: `tourism=*`. Ocio: `leisure=*`. Natural: `natural=*`. Uso del suelo: `landuse=*`. Agua: `waterway=*`, `natural=water`.

Administración: `boundary=administrative` + `admin_level=*`. En España, de forma habitual: 2 Estado, 4 comunidad autónoma, 6 provincia, 8 municipio. No asumas que el límite OSM coincide con el IGN.

Transporte: `public_transport=stop_position|platform|station`, relations `type=route` + `route=bus|subway|train`. Restricciones: `type=restriction`.

Accesibilidad y restricciones: `access`, `foot`, `bicycle`, `motor_vehicle`, `wheelchair`.

Si hay duda entre dos etiquetas, quédate con la más usada en Taginfo (`https://taginfo.openstreetmap.org/`) y con la wiki de Map Features. Documenta la etiqueta que has usado. No traduzcas etiquetas al español dentro del dato (`highway=residencial` es inválido). Los nombres propios van en `name` (y `name:es` solo si hay variante).

## Enrutado

No implementes "la ruta más corta" a mano sobre ways descargadas. Usa OSRM, Valhalla o GraphHopper alimentados con PBF. Respeta el grafo: `oneway`, `access`, `barrier`, restrictions de relación, `highway=construction`. Para peatones no uses el perfil de coche. Las demos `router.project-osrm.org` no son para producción. Atribuye OSM.

## Conversión y dibujo

Al pasar Overpass JSON a GeoJSON: node → Point; way abierta → LineString; way cerrada con etiqueta de área (`building`, `landuse`, `leisure`, `amenity` areal, `natural=water`, `area=yes`) → Polygon; way cerrada de carretera o río → LineString; relation `type=multipolygon` → Polygon o MultiPolygon con huecos. Descarta miembros incompletos. Conserva `id`, `type` y `tags` en `properties`. No pierdas `name`.

Proyección de visualización web: Web Mercator (EPSG:3857). Datos OSM llegan en WGS84 (EPSG:4326). Leaflet y MapLibre lo convierten. No reproyectes a ETRS89/UTM salvo que el usuario vaya a cruzar el mapa con cartografía oficial española; en ese caso, reproyecta con una biblioteca de CRS y no "a ojo".

## España y contexto local

Para un municipio, prioriza `admin_level=8` y, si hay colisión de nombres, `wikidata` o códigos INE presentes en OSM. Hellín está en la provincia de Albacete, Castilla-La Mancha; no lo sitúes en Murcia ni en Alicante. El callejero OSM no es el callejero de Correos ni el de Catastro. Si el usuario necesita parcela, referencia catastral o planeamiento, OSM no basta: hay que ir a servicios oficiales, con su licencia, sin mezclarlos como si fueran la misma capa.

No prometas cobertura completa de comercios, horarios (`opening_hours`) ni accesibilidad: son datos voluntarios.

## Edición (solo con orden explícita)

Si el usuario no pide contribuir a OSM, no escribas en la API de edición, no crees usuario, no subas GPX como si fuera geometría definitiva. Si pide editar: iD o JOSM, cuenta propia, changeset con comentario útil, fuente real (trabajo de campo, imagen compatible, dato con licencia compatible). Prohibido importar CSV masivo sin seguir Import Guidelines. Prohibido "arreglar" el mapa copiando otro mapa. No uses bots.

## Calidad de la respuesta del agente

Cuando construyas una consulta o un mapa, declara de dónde sale cada cosa (dato OSM, tesela de qué proveedor, geocodificador de quién). Si el resultado puede estar incompleto, dilo. No rellenes huecos con geometría inventada. No uses coordenadas de ejemplo de San Francisco o Londres cuando el usuario habla de España. No dejes `YOUR_API_KEY` de Mapbox "por defecto": o se usa un proveedor sin clave, o se documenta la clave como variable, o se usa un estilo libre.

Si una biblioteca o un tutorial te empuja a Nominatim público o a `tile.openstreetmap.org` para una app real, resiste y sustituye el backend. Cumple la política aunque el tutorial no lo haga.

Comprueba siempre: orden lat/lon, bbox sur-oeste-norte-este en Overpass, User-Agent, atribución visible, área pequeña, etiquetas reales, `out geom`, HTTPS, ningún autocompletado Nominatim, ninguna tesela OSMF en producción.

## Referencia rápida de URLs

Wiki de objetos y etiquetas: `https://wiki.openstreetmap.org/wiki/Map_features`

Taginfo: `https://taginfo.openstreetmap.org/`

Overpass Turbo: `https://overpass-turbo.eu/`

Nominatim (política): `https://operations.osmfoundation.org/policies/nominatim/`

Teselas (política): `https://operations.osmfoundation.org/policies/tiles/`

Atribución: `https://wiki.osmfoundation.org/wiki/Licence/Attribution_Guidelines`

Copyright: `https://www.openstreetmap.org/copyright`

Extractos: `https://download.geofabrik.de/`

Cómo servir teselas propias: `https://switch2osm.org/`

Si una norma de este documento choca con un tutorial, gana este documento y la política OSMF vigente.
