# Informe de generación — Benidorm (03031)

Generado el 2026-10-05T08:55:35.808Z.

## Territorio

- Municipio: Benidorm
- Provincia: Alicante
- Comunidad autónoma: Comunitat Valenciana
- Comarca: No consta en la base
- Población: 77327
- Superficie: sin dato

## Contenido

- Registros: 1269
- Con coordenadas: 1111
- Sin coordenadas: 158
- Con nombre pendiente de revisión: 14
- Con nombre pendiente de registrar: 0
- Grupos con datos aparentemente duplicados: 40

## Reparto por categoría

| Categoría | Registros |
| --- | ---: |
| territorio | 54 |
| poblacion | 29 |
| necesidades_especiales | 0 |
| animales | 6 |
| infraestructuras | 628 |
| equipamientos | 509 |
| servicios_basicos | 39 |
| riesgos | 0 |
| medios_recursos | 4 |
| evacuacion | 0 |

## Fuentes

| Fuente | Organismo | Registros | Licencia |
| --- | --- | ---: | --- |
| OpenStreetMap (Overpass) | OpenStreetMap | 861 | Open Database License (ODbL) 1.0 |
| Plantilla municipal — Limpieza info (PTM Benidorm) | Ayuntamiento de Benidorm | 328 | Uso interno del proyecto |
| GVA - Centros docentes de la Comunitat Valenciana (ICV WFS) | Generalitat Valenciana, Institut Cartogràfic Valencià | 36 | Licencia de reutilización de la Generalitat Valenciana |
| INE - Padrón municipal (tabla 29005) | Instituto Nacional de Estadística | 29 | Licencia de uso con fines estadísticos |
| Geoportal de Gasolineras (MITECO, API REST) | Ministerio para la Transición Ecológica | 10 | Licencia de reutilización del Geoportal MITECO |
| GVA - Sistema Valenciano de Salud, centros sanitarios (ICV WFS) | Generalitat Valenciana, Institut Cartogràfic Valencià | 4 | Licencia de reutilización de la Generalitat Valenciana |
| OpenStreetMap (Nominatim) | OpenStreetMap | 1 | Open Database License (ODbL) 1.0 |

## Correcciones aplicadas en lectura

Ninguna de estas correcciones ha modificado la base de datos.

- Etiqueta del sistema de referencia: los 328 registros de la plantilla municipal declaran ahora ETRS89 UTM 30 (EPSG:25830), que es el sistema real de la plantilla. Sus coordenadas ya estaban en grados y no se han vuelto a convertir.
- Nombres numéricos: 14 registros conservan su cifra y se marcan como pendientes de revisión, porque no hay forma segura de saber a qué elemento concreto corresponden.
- Los enlaces solo se publican si el dominio está en la lista blanca.

## Avisos

- La geometría que guarda la tabla municipios es un punto, no el término municipal, así que la superficie no se puede calcular. El libro lo indica en lugar de publicar un valor aproximado sin respaldo.
- La base no tiene tabla de comarcas, así que la comarca figura como «No consta».
- Registros publicables leídos: 1269, de 1378 que tiene el municipio. La consulta se hace por páginas de 1000 porque el servidor corta los resultados largos.
- 109 registros dados de baja quedan fuera del libro.
- La tabla municipios guarda 1021 habitantes para este municipio, mientras que el padrón del INE de 2025 registra 77327. Se publica la cifra del INE y no la de la tabla, que parece corrupta. La corrección en la base queda pendiente de tu autorización.

## Ficheros

- Libro Excel: `Benidorm_03031_inventario.xlsx` (301.3 kB)
- CSV: `Benidorm_03031_inventario.csv` (340.8 kB)
- GeoJSON: `Benidorm_03031_inventario.geojson` (772.6 kB)
- GeoPackage: `Benidorm_03031_inventario.gpkg` (360.0 kB)
