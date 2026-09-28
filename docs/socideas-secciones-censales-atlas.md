# Atlas de secciones censales — fuente, ingesta y límites

Sustituye a `docs/socideas-phase-2b-secciones-censales.md` (§5 decía «solo geometría»
y §7 planteaba esta misma ingesta como trabajo futuro). Fecha: 2026-09-28.

## 1. Qué se publica y de dónde sale

**Geometría.** INE, cesión del seccionado, GeoServer público:

- Colecciones `WMS_INE_SECCIONES_G01:Secciones_<año>` (2020–2025 verificados).
- OGC API Features `…/ogc/features/v1`, filtro CQL `CUMUN='<ine5>'`.
- `CUMUN` = `municipios.codigo_ine` (5 dígitos). `CUSEC` = 10 dígitos:
  provincia(2) + municipio(3) + distrito(2) + sección(3).
- Atribución obligatoria: «Seccionado cedido por el Instituto Nacional de Estadística».

**Estadística.** INE, Atlas de Distribución de Renta de los Hogares (ADRH),
operación `1254736177088`. Descargas `jaxiT3/files/t/csv_bd/{tabla}.csv`, una tabla
provincial de renta y otra de Gini/P80-P20 (mapa en `src/lib/adrh-province-tables.json`,
52 provincias). Formato verificado, separador TSV, **codificación UTF-8 con BOM** (no
latin1: la `Í` de «Índice» se corrompía a `Ã` y el indicador se descartaba en silencio):

```
Municipios \t Distritos \t Secciones \t Indicadores… \t Periodo \t Total
```

La columna `Secciones` contiene `<CUSEC de 10 dígitos> <nombre>`: la **misma clave**
que publica la capa de seccionado. El join es por identidad de clave oficial, nunca
por parecido de nombres.

## 2. Indicadores realmente publicados a nivel de sección

Confirmados leyendo la columna de indicadores de los CSV del INE (no inferidos):

| id SOCideas | Etiqueta del INE | Unidad | Universo | Años |
|---|---|---|---|---|
| `renta_neta_media_persona` | Renta neta media por persona | euros | Declarantes IRPF | 2015–2023 |
| `renta_neta_media_hogar` | Renta neta media por hogar | euros | Hogares declarantes | 2015–2023 |
| `renta_bruta_media_persona` | Renta bruta media por persona | euros | Declarantes IRPF | 2015–2023 |
| `renta_bruta_media_hogar` | Renta bruta media por hogar | euros | Hogares declarantes | 2015–2023 |
| `renta_media_unidad_consumo` | Media de la renta por unidad de consumo | euros | Unidades de consumo | 2015–2023 |
| `renta_mediana_unidad_consumo` | Mediana de la renta por unidad de consumo | euros | Unidades de consumo | 2015–2023 |
| `indice_gini` | Índice de Gini | puntos | Declarantes de la sección | 2015–2023 |
| `p80_p20` | Distribución de la renta P80/P20 | ratio | Declarantes de la sección | 2015–2023 |

Todos son **promedios o índices**, no percentages: por eso `denominador` es `null` y
no se deriva ningún porcentaje. La renta media municipal **no** es el promedio simple
de secciones: procede de la fila municipal del mismo CSV provincial.

No se publica ningún indicador que el INE no difunda a ese grano. Un municipio sin
datos por sección se sirve con geometría y un estado vacío explícito, nunca con una
coropleta inventada.

## 3. Fallos del diseño anterior que esta versión corrige

1. **Truncamiento silencioso.** La ruta anterior pedía `limit=1000` sin paginar.
   Madrid devuelve 2483 features: se perdían 1462 secciones sin ningún aviso. Ahora
   `descargarSecciones` pagina con `startIndex` y **verifica el total contra
   `numberMatched`**,fallando si la lectura quedó incompleta.

2. **Agregados de distrito publicados como secciones.** La capa del INE incluye
   polígonos con `CSEC='000'` (`0200701000`, y 6 en Ceuta junto a 56 secciones
   reales). No son secciones: tratarlos como tales inventaría una fila que la fuente
   no publica. Se detectan con `esPoligonoDistrito` y se excluyen, informándolos.

3. **CRS supuesto, no detectado.** La documentación decía EPSG:25830, pero la API OGC
   con `f=json` devuelve **ya en EPSG:4326** (Alcalá del Júcar: `-1.3103392, 39.14491732`).
   Reproyectar a ciegas destruye la geometría (los valores pasaban a `~‑7.48°, 0.0004°`,
   el DMS de Greenwich). Ahora el CRS se **detecta** sobre la geometría cruda, solo se
   reproyecta si viene en uno proyectado, y la salida se valida contra el ámbito
   publicable antes de publicarse. `scripts/verify-secciones-proyeccion.ts` comprueba
   un round-trip con error de 0,32 mm y seis municipios reales.

4. **CSV leído como latin1 en vez de UTF-8 (indicadores descartados en silencio).** Las
   descargas `jaxiT3` son UTF-8 con BOM. Al decodificarlas como latin1, «Índice de Gini»
   llegaba como `Ãndice de Gini` y «Distribución de la renta P80/P20» como
   `DistribuciÃ³n…`, de modo que `normalizarEtiquetaIne` no casaba con la etiqueta del
   catálogo y **`indice_gini` y `p80_p20` se marcaban `publicadoPorSeccion: false`**
   aunque el INE los publica a nivel de sección (Alcalá del Júcar: 72 observaciones con
   los 8 indicadores; antes 54 sin ellos). Se decodifica UTF-8 y se retira el BOM.

5. **Separador de millares leído como decimal (renta 1000× menor).** En las descargas
   `jaxiT3` el punto es SIEMPRE separador de millares y la coma es decimal. Patrones
   reales: renta `DD.DDD`/`D.DDD`, Gini `D,D`/`DD,D`. El parser anterior solo trataba el
   punto como millares si además había coma, así que `"20.516"` se guardaba como
   `20,516` en lugar de `20516`: toda la renta quedaba dividida por mil. Ahora se
   retiran los puntos de millares y se convierte la coma decimal, con guarda para que
   un marcador residual (`.`) siga siendo ND y nunca 0.

## 4. Estados de dato y reglas que no se rompen

- Un ND, un secreto estadístico o una celda vacía son `no_difundido` con
  `value: null`. **Nunca 0.** Un 0 publicado por la fuente se conserva como 0.
- Ningún ND entra en las clases de color: tiene relleno `limo-500`, contorno
  `limo-800` y trama diagonal, y su propia entrada en la leyenda.
- El año de la **geometría** (`Secciones_2025`) y el **periodo estadístico** (2023)
  son campos distintos, se exponen por separado y se muestra el desfase.
- El agregado municipal de renta **no** es la media simple de las secciones: sale de
  la fila municipal del mismo CSV.
- No se suman ni se restan celdas para reconstruir un valor protegido.

## 5. Cobertura publicada

10 municipios, verificado con read-back independiente desde la URL pública de R2
(`scripts/verify-secciones-r2.ts`) y por HTTP contra producción
(`scripts/verify-secciones-produccion.mjs`). Los 8 indicadores, Gini y P80/P20
incluidos, tienen valores observados desde la corrección de codificación (§3.4):

| Municipio | Secciones | Observaciones | ND |
|---|---|---|---|
| 02003 Albacete | 117 | 8424 | 176 |
| 02007 Alcalá del Júcar | 1 | 72 | 0 |
| 16016 Almendros (Cuenca) | 1 | 72 | 0 |
| 16211 Torrejoncillo del Rey | 1 | 72 | 0 |
| 28079 Madrid | 2462 | 175 896 | 2583 |
| 41091 Sevilla | 522 | 37 512 | 1559 |
| 45090 Manzaneque | 1 | 72 | 0 |
| 46250 València | 588 | 42 264 | 293 |
| 51001 Ceuta | 56 | 4032 | 32 |
| 52001 Melilla | 44 | 3168 | 5 |

Prefijo: `socideas/secciones/v1/municipal/{INE-5}.json`, manifiesto en
`socideas/secciones/v1/manifests/`. Escritura solo con `--confirm-r2-write`.
`latest-successful.json` es la cobertura **acumulada** entre corridas (se fusiona por
INE, no se reemplaza), de modo que una ingesta por provincia no borra del manifiesto
los municipios ya publicados.

## 6. Almacenamiento: por qué el objeto es compacto

Una `SeccionObservacion` serializada ocupa ~485 bytes, pero solo ~30 son únicos: la
clave, el municipio, la operación, la tabla, la unidad, el denominador, la URL, la
fecha y el checksum se repetían en las 131 922 observaciones de Madrid. Repetirlos
convertía el objeto en 75 MB.

En R2 se guarda una forma **columnar** (`series`: sección → indicador → lista de
`{p, v, s}`), y `expandirObservaciones` reconstruye el contrato completo al leer.
Madrid baja de 75 MB a 7,8 MB (×9,6) sin perder un solo dato: el cargador verifica
que la forma expandida tiene exactamente el mismo número de secciones que la leída
del CSV antes de publicar.

## 7. Límites conocidos

- Cobertura nacional **no** publicada: 10 municipios, no los 8130. La ingesta está
  preparada (`--provincias=`, `--lote=`, reanudable) pero no se ha ejecutado a escala
  nacional. «Todavía no ingerido» y «no publicado por el INE a escala de sección» son
  estados distintos y la interfaz los muestra por separado.
- Solo ADRH renta/desigualdad. Educación, actividad y vivienda **no** están porque no
  se ha verificado una tabla seccional del INE con definición y cobertura suficiente.
- `indice_gini` y `p80_p20` **sí** se publican a nivel de sección: lo confirma la propia
  columna `Secciones` de las tablas 30656/37678 (Albacete: 2160 filas de sección,
  2080 observadas). Los pilotos los mostraban sin dato por el fallo de codificación de
  §3.4, ya corregido; ya no hay indicadores en el catálogo marcados «no publicado por
  sección».
- El seccionado cambia cada año: los códigos de sección no son estables en el tiempo.
  Las claves estadísticas sin polígono en la geometría vigente se cuentan y se informan
  (`filasSinPoligono`), no se inventan ni se unen con ceros a ciegas.
- Los límites son estadísticos, sin validez jurídica.

## 8. Comandos

```bash
# verificación
npx tsx scripts/verify-secciones-proyeccion.ts   # 71 checks: CRS, paginación, territorio
npx tsx scripts/verify-secciones-r2.ts           # 137 checks: read-back público + contrato
npx tsx scripts/verify-secciones-xlsx.ts         # ND nunca 0, ceros iniciales, anchos
npx tsx scripts/qa-secciones-browser.ts 02007    # navegador: mapa, tabla, PNG, 390/768/1440

# ingesta
npx tsx scripts/load-secciones-atlas.ts --pilotos                  # dry-run
npx tsx scripts/load-secciones-atlas.ts --pilotos --confirm-r2-write
npx tsx scripts/load-secciones-atlas.ts --provincias=02,16 --puerto=50 --lote=0
```
