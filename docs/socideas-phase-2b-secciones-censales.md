# Secciones censales Fase 2B — infraestructura sin datos inventados

## 1. Fuente de geometrías

INE, cartografía oficial del seccionado (verificada 2026-09-03):

- **OGC API Features**: `https://www.ine.es/geoserver/ogc/features/v1` — colecciones `Secciones_2024`, `Secciones_2025`, histórico 2007-…, Censos 2001/2011. Formatos: GeoJSON, HTML, CSV, KML, GML.
- **WFS 2.0**: `https://www.ine.es/geoserver/WMS_INE_SECCIONES_G01/wfs` (+ WMS de visualización).
- **Shapefiles** nacionales (descarga; NO se usan en la app: solo servicio bajo demanda).
- Atributos por sección: `CPRO` (2), `CMUN` (3), `CUMUN` (= CPRO+CMUN, 5 dígitos = nuestro `codigo_ine`), `CDIS`, `CSEC`, `CUSEC` (código completo), `NMUN`, `NPRO`, `TIPO`, `the_geom` (MultiPolygon, EPSG:25830).
- Atribución obligatoria: "Seccionado cedido por el Instituto Nacional de Estadística".
- Año de geometría = año de la colección (`Secciones_2025` → delimitación vigente 2025). Se muestra siempre.

## 2. Formato y códigos

- Código oficial de sección: `CUSEC` (p. ej. `4109101001`: 41 Sevilla + 091 municipio + 01 distrito + 001 sección). Municipio: `CUMUN` de 5 dígitos, join directo con `municipios.codigo_ine` sin tablas nuevas.
- Geometría: MultiPolygon EPSG:25830; el proxy la re-proyecta/simplifica a GeoJSON WGS84 ligero para Leaflet (tolerancia documentada en el código).

## 3. Asociación con municipios

Sin tabla nueva obligatoria. El proxy filtra por `CUMUN = {codigoINE}` (CQL_FILTER en WFS u OGC `filter`/bbox del término municipal). Opcional futuro (requiere autorización): índice ligero `secciones_censales(codigo_seccion PK, municipio_codigo_ine FK, distrito, anio_delimitacion)` SIN geometría, para conteo y estado de cobertura.

## 4. Estrategia de carga bajo demanda

```
Usuario abre /socideas/[ine]/secciones-censales
→ página server valida INE en municipios (+ centroide)
→ mapa/listado vacío con botón "Cargar secciones"
→ click → GET /api/socideas/secciones/[ine] (servidor)
→ servidor pide al INE solo ese municipio (filtro CUMUN + límite)
→ GeoJSON simplificado al cliente → Leaflet ligero (reutiliza leaflet, sin visor URBideas)
```

Nunca capa nacional en el navegador; caché `Cache-Control: public, max-age=86400` en el proxy; timeout 20 s + degradación a listado/error.

## 5. Datos disponibles por sección (fase 2B)

**Solo geometría + códigos + año + fuente.** ADRH publica indicadores por sección en descargas, pero la ingesta por sección queda fuera de 2B (volumen nacional y join geométrico pendientes de diseño). La ruta muestra por sección seleccionada: código oficial, distrito, municipio, año de delimitación, fuente y el mensaje: "Datos específicos por sección solo se incorporan cuando existe una fuente oficial que los publica con ese nivel territorial."

## 6. Limitaciones metodológicas (visibles en la UI)

- Las secciones cambian cada año (altas/bajas por población): el código no es estable en el tiempo; siempre se indica el año.
- Los límites municipales del seccionado son estadísticos, sin validez jurídica.
- Prohibido: repartir datos municipales entre secciones, estimar por proporcionalidad, presentar geometría sin año.

## 7. Evolución futura

Ingesta ADRH por sección (descargas provinciales, join por `CUSEC`) + índice ligero de cobertura + mapa coroplético de renta por sección. Requiere diseño de volumen y autorización; fuera de 2B.
