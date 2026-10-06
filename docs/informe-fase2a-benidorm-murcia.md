# Fase 2A — Entrega: Benidorm (03031) y Murcia (30030)

> Contrato: `docs/fase2a-contrato.md`. Hito no cerrado con el contrato:
> cadena vertical ejecutada en ambos municipios, artefactos locales,
> recuentos reconciliados y pruebas. Fecha: 2026-10-06.
> Restricciones cumplidas: SOCideas intacto, `municipios.poblacion` sin
> modificar (ni leído), ninguna escritura en sistemas reales, ni publicación
> remota ni despliegue. Rama: `feat/incideas-hidrografia`.

## 1. Lo investigado (acotado, solo lecturas públicas)

- **PATRICOVA**: el recurso «Descarga SHP» del catálogo **no es descarga
  directa** (HTML 6.484 bytes que lanza tarea asíncrona ArcGIS
  `GPServer/tarea_descarga_datos/submitJob`). WMS funciona (caps ~112 KB),
  los 3 PDF de definición funcionan (139–152 KB), ArcGIS REST `?f=json`
  falla (HTTP 400, registrado, no rodeado). Definiciones literales del
  catálogo: peligrosidad = probabilidad (6 niveles 1–6 + 7.º nivel
  geomorfológico); riesgo = peligrosidad + vulnerabilidad del uso del suelo;
  estudios = concreción en un ámbito. Procedencia: GVA origen.
- **Las «12 hojas» no existen** en la distribución oficial: cada producto es
  un único shapefile autonómico (verificado por contenido: 7 ficheros/ZIP;
  8.415 / 7.710 / 207 objetos). Los estudios son 207 **puntos**, no
  polígonos. Refutado como partición de descarga y como cobertura.
- **SNCZI/MITECO**: página de descargas OK; `wms.mapama.gob.es` y catálogo
  MITECO **inaccesibles desde este entorno** (`FUENTE_INACCESIBLE`,
  documentado, no confundido con ausencia). INSPIRE
  `wms-inspire/riesgos-naturales/inundaciones` funciona pero expone
  **cobertura raster** (`GRAY_INDEX`), no polígonos: sirve para consulta de
  mapa, no para áreas de contención. No hay WCS. Procedencia cuando
  corresponda: MITECO origen, IDEE distribuidor.
- **Hidrografía IGN** (`wfs-inspire/hidrografia`, WFS 2.0.0, CRS `EPSG:4258`):
  15 tipos; se usan `hy-p:Watercourse` (aguas físicas) y
  `hy-n:WatercourseLink` (red, `net:centrelineGeometry`). El servidor **no
  ofrece GeoJSON** (T3: HTTP 400) → lector GML 3.2 propio. Hallazgo de
  identidad: **varios miembros comparten hydroId** (hasta 5×) sin ser el
  mismo tramo → se cuenta por miembro (`gml:id`), no se fusiona.
- **Trampas T1/T2/T3** verificadas en vivo y convertidas en regresión:
  ejes lat,lon por servicio/versión/CRS (tabla en contrato, sin regla
  general); `resultType=hits` + GeoJSON incompatible en IGN AU (HTTP 500);
  `styles=default` rechazado en INSPIRE (`StyleNotDefined`, se usa vacío);
  páginas repetidas por `startIndex` más allá del total (deduplicación por
  miembro + partición espacial recursiva); `numberMatched=unknown` no es
  total. Límite de Murcia: el nombre coincidía con la CCAA; se corrigió a
  coincidencia exacta de `nationalCode` (4thOrder) + menor extensión.

## 2. Lo implementado y ejecutado

Código nuevo (tipado estricto, `tsc` + `eslint` limpios):
`scripts/incideas/fase2a/` — `contrato.ts` (estados, ejes, productos,
recuentos), `wfs.ts` (cliente con T1/T2/T3), `gml.ts` (lector GML),
`fuentes.ts` (IGN AU, IGN hidro con paginación adaptativa + partición
recursiva, PATRICOVA submitJob+PDF+WMS, INSPIRE raster), `geo-calc.ts`
(recorte por segmentos documentado, contención), `patricova-shp.ts`
(extracción SHP, UTM30→lon/lat con la función probada del repo, encoding
del `.cpg`), `exportar.ts` (Excel+GPKG+GeoJSON+mapa coherentes),
`pipeline.ts` (orquestador `--ine`, mismo código ambos municipios).
Pruebas: `scripts/tests/fase2a-contrato.test.ts`, **20/20 en verde**.

### Benidorm (03031) — `salida/fase2a/03031/` (12 ficheros)

- Límite IGN AU (`nationalCode`, 4thOrder): 38,48 km².
- Watercourse: **372 miembros** (253 con nombre, 33 nombres distintos,
  101 hydroIds distintos, reconciliadas=null) — **169 intersectan** (203
  solo BBOX), 61,76 km municipales. WatercourseLink: **150** (70 con
  nombre, 31 distintos, 150 hydroIds) — **46 intersectan**, 51,55 km.
- PATRICOVA: peligrosidad 8.415 CV → **33 polígonos / 8,18 Mm²** en término
  (niveles observados 4, 6 y geomorfológicos; `n_pelig` 4/6/7); riesgo 7.710
  CV → **17 / 0,83 Mm²** (Muy Bajo…Muy Alto); estudios 207 puntos CV →
  **0 en término** (cero municipal válido, no ausencia).
- Exposición (1.111 inventario): bandas <50 m: 51 · <100 m: 82 · <250 m:
  219 · resto 759; dentro de peligrosidad: 451 (por nivel en informe);
  dentro de riesgo: 106 (Bajo 72, Medio 34).
- Exports coherentes (misma foto): Excel 8 hojas, 2 GeoJSON + 2 GPKG hidro,
  2 GeoJSON + 2 GPKG PATRICOVA (cabecera GP válida), `mapa.html`, límite,
  `informe.json/md`. Paridad verificada en ejecución.

### Murcia (30030) — `salida/fase2a/30030/` (9 ficheros)

- Mismo pipeline, sin reglas ad-hoc. Límite IGN AU (4thOrder): 884,6 km².
- Watercourse: **3.835 miembros** (2.272 con nombre, 403 distintos, 1.196
  hydroIds, reconciliadas=null) — **1.774 intersectan**, 1.298 km.
  WatercourseLink: **1.864** (963 con nombre, 252 distintos) — **812
  intersectan**, 923 km. Descargas completas (`descarga_completa=true`).
- **PATRICOVA = NO_APLICABLE** por ámbito territorial (sin descarga, por
  diseño del contrato). Exposición = COBERTURA_NO_DETERMINADA (sin
  inventario publicado; mismo código).
- Exports coherentes: Excel 6 hojas (5.700 filas de tramos), 2 GeoJSON + 2
  GPKG, mapa, límite, informes. Paridad verificada.

Sobre «277 Benidorm / 973 Murcia»: se tratan como objetos originales de
otras consultas, sin equipararlos; los recuentos de esta entrega son
reproducibles con evidencia (URLs, hits, jobIds, hashes en cada
`informe.json`).

## 3. Lo pendiente (distinguido, sin tapar)

1. **Contención T10∖T100/T100∖T500 sobre vector oficial**: el comparador
   (`areaInterseccion` + `deficitContencion`, solo mismo estudio/versión)
   está implementado y probado con fixtures (incluye caso no contenido),
   pero no hay distribución vectorial accesible (INSPIRE=raster,
   MITECO directo inaccesible desde aquí). Estado honesto:
   `COBERTURA_NO_DETERMINADA` (vectorial). No se usan conteos de
   polígonos ni píxeles como prueba de crecimiento.
2. **`n_entidades_reconciliadas`**: pendiente de validar el modelo de
   identidad IGR (`inspireId` + red). Se publica `n_localid_distintos`
   como agrupación observada, sin reconciliar.
3. **Caudal/hipótesis/modelo/escala/fecha**: solo lo publicado en origen
   (estudios PATRICOVA trae `fecha_aprb` por expediente; se conserva por
   objeto, sin propagar).
4. **Inventario de Murcia** para exposición: pendiente de publicación del
   inventario; el código ya lo consume cuando exista.
5. Propuestas previas intactas: corrección de `municipios.poblacion` (migración
   propuesta sin aplicar) y auditoría de seguridad pre-apertura.

## 4. Reproducción

```sh
npm run fase2a:benidorm   # --ine 03031
npm run fase2a:murcia     # --ine 30030
npm run fase2a:test       # 20 pruebas
npx tsc --noEmit -p tsconfig.json
npx eslint scripts/incideas/fase2a/ scripts/tests/fase2a-contrato.test.ts
```

Todo en local (`salida/fase2a/`, gitignored; `tmp/fase2a/`, evidencias de
proceso). Sin secretos nuevos; sin cambios en SOCideas, `main` ni despliegues.
