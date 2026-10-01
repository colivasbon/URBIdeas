# INCideas — Auditoría de calidad y plan de corrección de la salida

Documento de trabajo de la Fase 0. Recoge lo leído, lo comprobado en el código, en la
base de datos, en el despliegue y en los documentos de referencia, y fija la tabla
comparativa que manda sobre el resto del plan.

Fecha de la auditoría: 2026-10-01. Alcance comprobado: municipio 03031 (Benidorm),
código de la rama activa en ese momento, proyecto Supabase `nkfepxuyrbcxolljykwk` y
despliegue de producción `urb-ideas`.

Ninguna cifra de este documento procede de estimaciones: todas salen de consultas
ejecutadas sobre la base de datos, de volcados de los ficheros entregados o de
peticiones al despliegue en producción.

---

## 1. Qué se ha leído

### 1.1 Documentación del repositorio

| Fichero | Contenido que fija |
|---|---|
| `AGENTS.md` | Bloque de reglas de Next.js generado por `next dev`. El aviso «Este no es el Next.js que conoces» obliga a leer la guía correspondiente en `node_modules/next/dist/docs/` antes de escribir código de rutas o de servidor. |
| `CLAUDE.md` | Solo una línea: incluye `AGENTS.md`. |
| `MEMORIA.md` | Plataforma IDEAS Sostenibilidad. Tres módulos: URBideas, SOCideas y —en desarrollo— INCideas. Decisiones arquitectónicas que no se reabren sin motivo: fuente territorial única `municipios.codigo_ine` con cinco dígitos; SOCideas publica sus datos consolidados en Cloudflare R2 y INCideas debe leerlos sin duplicarlos; no se toca el RLS de las tablas preexistentes; nunca se inventan datos; los lotes de ingesta viven en el equipo del usuario, no en el servidor. |
| `README.md` | Rutas canónicas de los módulos, procedimiento de alta en Supabase y lista de geoportales autonómicos. |
| `docs/incideas-agente-prompt.md` | Reglas de continuidad del módulo: no tocar trabajo ajeno, no sobrescribir validaciones, no borrar (marcar bajas), atribución ODbL y fecha en todo dato de OSM, no escribir en Supabase de producción sin autorización expresa, no hacer commit ni push sin presentar antes un resumen. |
| `docs/incideas-cerebro.md` | Arquitectura en siete capas: fuentes → conectores → pipeline → Supabase → API → interfaz → operación por línea de comandos. Verificado contra el código. Documenta once carencias conocidas, entre ellas el límite municipal tomado de OSM en lugar de una fuente oficial y la ausencia de fuentes autonómicas fuera de la Comunitat Valenciana. |
| `docs/incideas-piloto.md` | Traza del piloto con datos reales de Benidorm: 638 registros en la primera carga, 935 tras importar la plantilla municipal, cuarenta pruebas automáticas en verde. Registra los errores reales encontrados y corregidos (truncado de PostgREST a 1.000 filas, colapso de forty-one farmacias en cinco registros por usar el nombre como clave). |

### 1.2 Código de INCideas

Núcleo (`src/lib/incideas/`): `categorias.ts` (doce categorías con sus campos obligatorios
y deseables y su caducidad), `types.ts` (66 campos del modelo `RegistroINCideas` y los
11 estados de validación), `ficha.ts`, `registros.ts`, `exportacion.ts` (generador del
libro actual), `seleccion-fuentes.ts` (jerarquía oficial → municipal → colaborativa),
`fuentes-socideas.ts` (lectura del sobre JSON de SOCideas en R2 sin duplicarlo),
`memoria.ts`, `paginar.ts` (lecturas masivas paginadas porque PostgREST trunca en
silencio a 1.000 filas).

Conectores (`src/lib/incideas/connectors/`): `overpass.ts` (consulta por área
`ine:municipio` con repliegue a rectángulo envolvente; detecta la respuesta HTML con
código 200 que devuelve Overpass saturado y prueba un espejo), `osm-pois.ts` (consulta
por rectángulo envolvente a propósito, para conservar recursos próximos), `osm-movilidad.ts`,
`osm-emergencias.ts`, `nominatim-boundary.ts`, `ine-poblacion.ts` (tabla 29005 del padrón),
`minetur-carburantes.ts` (resuelve el municipio por nombre con variantes y, si no hay
coincidencia única, por pertenencia al polígono), `gva-centros-docentes.ts` y
`gva-centros-sanitarios.ts` (servicio web del Institut Cartogràfic Valencià, filtrado por
`cod_ine_mun`, limitado a las provincias 03, 12 y 46), `gva-icv.ts`, `http.ts` (User-Agent
identificable, tiempo de espera y reintentos), `registry.ts`.

Canalización (`src/lib/incideas/pipeline/`): `normalize.ts` (normalización de nombre,
teléfono, dirección y código postal, con las erratas «pubica» y «privado concertado»
tratadas), `huella.ts` (huella determinista con la fuente dentro, para que dos fuentes
que describan el mismo lugar no colisionen), `geo.ts` (pertenencia al polígono por
lanzamiento de rayo y distancia al límite en metros), `dedup.ts` (detección conservadora
que nunca fusiona), `upsert.ts` (motor idempotente con dos claves, protección de los
registros validados, comparación canónica de campos JSONB y reglas de posible baja),
`runner.ts`, `store-supabase.ts`, `memory-store.ts`, `utm.ts` (convierte de UTM a
geográficas; no incluye el sentido inverso), `types.ts`.

Interfaz (`src/app/incideas/`): portada, buscador de municipios, metodología, catálogo de
fuentes, arquitectura, ficha municipal, página por categoría, memoria documental estilo
PTM, bandeja de revisión y mapa de control de calidad. API (`src/app/api/incideas/`):
`registros` (lectura pública paginada), `revision` (conteos públicos y acciones
protegidas por token), `exportar` (json, csv, geojson y xlsx) e `importar`.

Migraciones: `038_incideas_core.sql`, `039_incideas_pipeline.sql` y
`040_incideas_atributos.sql`. Operaciones: `scripts/incideas/run-connector.ts`
(dry-run por defecto, escribe solo con `--go`), `import-xlsx.ts`, `seed-fuentes.ts` y
cuarenta pruebas en `scripts/tests/incideas-pipeline.test.ts`.

### 1.3 Referencia interna de estilo: los libros de SOCideas

`src/lib/socideas-xlsx.ts` (993 líneas), `socideas-xlsx-charts.ts` (879 líneas),
`socideas-export.ts` (1.018 líneas) y `socideas-source-registry.ts` (195 líneas), más
los documentos `docs/socideas-xlsx-branding-and-layout-audit.md`,
`docs/socideas-xlsx-source-links.md` y
`docs/socideas-ficha-toolbar-and-municipal-xlsx.md`.

Elementos del contrato de estilo que INCideas debe reutilizar sin reinventar:

- Paleta en ARGB de ocho dígitos: musgo `FF3E665C` (franja de título y pestaña de hoja),
  conífera `FF86B73D` (línea de acento), hueso `FFF1F1F1` (fondo de banda y texto sobre
  musgo), carbón `FF3C403E` (texto), limo `FFB0BDB0` (borde fino), crisopa `FFC2E189`
  (relleno de cabecera y marca de dato no disponible), retama `FFFBE122`, rupestre
  `FF643335`. Tipografía Poppins. Tamaño de título 14, de bloque 12, de cabecera y
  cuerpo 11, de línea de fuente y de enlace 10.
- Separación estricta entre modelo y escritor: el escritor recibe el bloque ya
  ensamblado y solo lo maqueta, de modo que los gráficos no pueden desincronizarse de la
  tabla.
- Enlace de procedencia como hipervínculo real de ExcelJS con el texto visible
  «Ver ficha oficial ↗», negrita, subrayado y color conífera. Nunca la función
  `HYPERLINK()`, nunca un botón falso: si no hay fuente pública atribuible se escribe
  solo la línea de fuente, sin enlace.
- Lista blanca dedominios de origen (`ine.es`, `agenciatributaria.es`, `interior.gob.es`…)
  y lista negra (`localhost`, `supabase.co`, `vercel.app`, `r2.cloudflarestorage.com`,
  `cloudflare.com`, `github.com`), con comprobación de que la dirección es `https`.
- Fijado de paneles en la fila 2 de cada hoja, rejilla oculta, orientación apaisada,
  ajuste a una página de ancho, títulos de impresión repetidos y pie de página con
  municipio, código INE, esquema y fecha.
- Tablas nativas de Excel con filtros reales y anchos calculados a partir del
  contenido, con límites por papel de la columna (máximo 42, primera columna mínimo 30).
- «ND» en lugar de cero cuando el dato no está publicado, con la regla explícita de que
  la ausencia de dato nunca equivale a 0.
- Después de escribir el libro, un posproceso obligatorio sobre el ZIP que corrige los
  hipervínculos internos (`normalizeInternalHyperlinks`), porque ExcelJS escribe una
  relación externa espuria que hace que Excel proteste.

### 1.4 Documentos de referencia entregados

`INCIDEAS DOCUMENTOS` contiene tres ficheros. Ninguno es un PDF.

**«25B0335 PTM Benidorm - v2.docx»**, 36,1 MB. Es el Plan Territorial Municipal de
Emergencias de Benidorm. Se ha leído descomprimiendo el paquete OOXML y analysing
`word/document.xml` con la biblioteca estándar de Python: 275 páginas, 87.080 palabras,
1.129 párrafos, **142 tablas** y 64 imágenes (47 PNG, 14 JPEG, 1 EMF, 1 JPG y 1 WDP),
dos encabezados y cuatro pies. Metadatos: título «DOCUMENTO I: Fundamentos», autoría de
Andrea Resina Pomares, organización DGI, creado el 24/02/2022, revisado 34 veces e
impreso el 17/07/2026. Contiene 147 estilos definidos. Las 142 tablas se agrupan en
**94 esquemas distintos**.

Las 64 imágenes son fotografías georreferenciadas de cada punto (vistas aéreas y de
calle, con escala gráfica) y los mapas de encuadre del Anexo VI; el peso del documento es
mayoritariamente imagen.

**«Limpieza info.xlsx»**, 132 KB, nueve hojas. Es el fichero de trabajo municipal, no un
documento de producto: mezcla datos limpios con hojas auxiliares sin rotular.

| Hoja | Filas | Contenido real |
|---|---|---|
| Hoja1 | 672 | Paradas de autobús: número de parada, nombre, líneas que la sirven, calle o ámbito, y coordenadas UTM en columnas sueltas. |
| Hoja2 | 132 | Duplicado sin rotular de Hoja4 con columnas de líneas. |
| Hoja3 | 154 | Lista de paradas sin rotular, una por fila. |
| Hoja4 | 199 | Paradas de autobús: identificador, coordenada X, coordenada Y, vía y líneas. |
| Hoja5 | 199 | Paradas de autobús con **operador** («Grupo Avanza (Avanza Mobility – Llorente Bus)»), alcance urbano o interurbano, vía y coordenadas UTM. |
| Hoja6 | 19 | **Datos del Catastro**: identificador, estado, etiqueta, fecha de alta, identificadores BIC y de núcleo de población, número de plantas, número de sótanos, referencia catastral, tipo de parcela y coordenadas X e Y. |
| Núcleos_partidas | 136 | **PARTIDA**, DISTRITO, ÁREA. |
| Farmacias | 42 | Nombre, localización y titular. 37 de las 41 filas se llaman simplemente «Farmacia». |
| Enseñanza | 36 | Tipo, nombre, localización, titularidad, número de personal y número de alumnado (las dos últimas vacías). |

Contiene además 436 hipervínculos a las páginas del operador de transporte en
`alicante.avanzagrupo.com`, que son el patrón de enlace a fuente de origen municipal.

**«incideas_03031_todos.xlsx»**, 230 KB. Es la salida actual de INCideas y el objeto
principal de esta auditoría. Se analiza en el apartado 3.

---

## 2. Base de datos y despliegue en producción, comprobados

### 2.1 Estado real de las tablas

| Tabla | Filas | Observación |
|---|---:|---|
| `incideas_registros` | **1.378** | Solo el municipio 03031. 66 columnas. 2.736 kB. |
| `incideas_historial` | 2.884 | Una fila por campo cambiado. |
| `incideas_ejecuciones` | 36 | Tareas de carga auditables. |
| `incideas_fuentes` | 7 | Catálogo de fuentes verificadas. |
| `incideas_revisiones` | 1 | Una única revisión humana registrada. |
| `incideas_importaciones` | 0 | Sin importaciones. |
| `incideas_ext_albergue` | 0 | **Vacía.** Sin capacidad de albergue. |
| `incideas_ext_veterinaria` | 0 | **Vacía.** Sin atributos veterinarios. |
| `municipios` | 8.132 | Los 8.132 tienen código INE de cinco dígitos válido. |
| `provincias` | 52 | |
| `comunidades_autonomas` | 19 | |

La cobertura real es del **0,017 %** de los municipios: uno de 8.132.

### 2.2 Campos del modelo que existen pero nunca se rellenan

| Columna | Registros con valor | Consecuencia |
|---|---:|---|
| `confianza` | **0 de 1.378** | El nivel de confianza está definido en el esquema y en la interfaz, pero ningún conector lo escribe. |
| `calidad` | **0 de 1.378** | Igual que confianza. |
| `capacidad` | **0 de 1.378** | El Plan Territorial Municipal documenta capacidad en 143 alojamientos, 71 instalaciones deportivas, 531 centros de transformación y 4 centros de acogida. No hay ninguna. |
| `accesibilidad` | **0 de 1.378** | Sin dato de accesibilidad en todo el conjunto. |
| `tipo_geometria` | 1 (el límite) | Los 1.377 puntos no tienen tipo de geometría, lo que impide saber si la posición es un punto surveyed o un centroide. |
| `geometria` (PostGIS) | **1 de 1.378** | Solo el límite municipal. El resto son coordenadas sueltas en JSONB: sin índice espacial, sin consulta de pertenencia en base de datos y sin GeoPackage construible desde PostGIS. |
| `posible_duplicado` | **0** | La detección de duplicados se calcula en memoria durante la ejecución y se descarta: el resultado no se persiste. |
| `horario` | 45 (3,3 %) | El Plan Territorial Municipal documenta horario en las 40 farmacias, en los 7 centros sanitarios, en los lugares de culto y en los centros administrativos. |
| `telefono_publico` | 119 (8,6 %) | El Plan Territorial Municipal documenta teléfono en 40 farmacias, en el directorio de cargos y en los proveedores de servicios. |
| `descripcion` | 30 (2,2 %) | Solo la serie del padrón. |
| `nucleo` | 36 (2,6 %) | |
| `fecha_dato` | 39 (2,8 %) | Sin fecha del dato no se puede medir la antigüedad. |
| `url_fuente` | 941 (68,3 %) | |

### 2.3 Dos defectos de integridad concretos

**a) Cuarenta y dos registros tienen un número como nombre.** La consulta
`nombre_oficial ~ '^[0-9]+$'` devuelve 42 filas de 1.378 (3,0 %). Son, por ejemplo,
`partida|10|1` y `partida|10|1|`, dos registros distintos llamados ambos «1»; y paradas
de autobús de OSM llamadas «24» y «26». El primer registro que devuelve la API pública
`/api/incideas/registros` es precisamente uno de ellos, con `nombre_oficial: "1"`. Es la
manifestación literal del defecto descrito en el encargo: el identificador numérico ocupa
el lugar del nombre.

**b) El sistema de referencia de origen se declara siempre igual y a veces mal.** Los
1.378 registros declaran `crs_original = 'EPSG:4326'`, incluidos los 437 que provienen
de la plantilla municipal, que está en UTM 30N y así se documenta. El sistema de
referencia real de la fuente no se conserva, de modo que no es posible reconstruir la
coordenada UTM que el Plan Territorial Municipal usa como referencia.

### 2.4 Categorías sin un solo registro

De las doce categorías del modelo, cuatro no tienen ningún registro en 03031:
**necesidades_especiales**, **riesgos**, **evacuación** y las dos técnicas (calidad y
exportaciones). Son precisamente las tres categorías que más pesan en un plan de
emergencias. Además, el reparto de lo que sí hay está dominado por elementos sin
relevancia operativa para una emergencia:

| Subcategoría | Registros | Observación |
|---|---:|---|
| `parada_autobus` | 423 | 224 sin dirección; 14 con nombre numérico. |
| `alimentacion` | 242 | Supermercados y tiendas de conveniencia. No es una categoría de emergencia. |
| `alojamiento` | 161 | Hoteles y hostales, sin capacidad. |
| `partida` | 157 | Las 157 sin dirección; 28 con nombre numérico. |
| `farmacia` | 98 | Se fusionaron por nombre cuando casi todas se llamaban «Farmacia». |
| `colegio` | 59 | |
| **Todo lo demás** | 238 | De ellos, elementos de respuesta a emergencias: 1 parque de bomberos, 3 desfibriladores, 2 puntos de agua y 1 base de ambulancias. |

De los 1.378 registros, 1.130 (82,0 %) son paradas de autobús, alimentación, alojamiento y
partidas. Los elementos de respuesta a emergencias suman **7**.

### 2.5 Despliegue

El proyecto `urb-ideas` está en estado **READY** en producción, servido desde `main`, con
el despliegue `dpl_6BPJUgoWeUbF6aokUnehp5L2cdeP`. INCideas ya está fusionado en `main`
(despliegue `dpl_74k7t6z26znUEV919JzqcuTeEKQr`, «merge: feat/incideas-piloto-datos →
main»).

Variables de entorno configuradas (solo nombres; ningún valor se reproduce ni se lee en
este documento): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SOCIDEAS_R2_BASE`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `SOCIDEAS_REVALIDATE_TOKEN`,
`SOCIDEAS_REVALIDATE_BASE_URL`, `INCIDEAS_REVIEW_TOKEN`.

Observaciones:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` figura en `.env.example` pero **no está en
  `.env.local`**. No rompe nada porque la lectura de INCideas va por `service_role` en
  servidor, pero deja la instalación incompleta respecto de lo documentado.
- `vercel.json` está vacío (`{}`). No hay `maxDuration` ni configuración de memoria, de
  modo que rigen los valores por defecto del plan. **Esta es la razón técnica por la que
  Overpass no puede consultarse desde las funciones**: el propio `overpass.ts` ya fija
  100 segundos de tiempo de espera y hasta dos reintentos por espejo, muy por encima de
  cualquier límite de función sin confirmar.
- Comprobación de los cuatro formatos de exportación contra producción, municipio 03031,
  1.378 registros:

| Formato | Respuesta | Tiempo | Tamaño |
|---|---|---:|---:|
| json | 200 | 4,8 s | 828 kB |
| csv | 200 | 2,1 s | 464 kB |
| geojson | 200 | 2,5 s | 750 kB |
| xlsx | 200 | 2,9 s | 230 kB |

Los cuatro funcionan y están dentro de los límites. La exportación puede seguir
generándose en el servidor; lo que debe salir del servidor es la ingesta.

---

## 3. Análisis del Excel actual, `incideas_03031_todos.xlsx`

Dos hojas. «Registros» con 1.378 filas de datos y 20 columnas. «Léame» con 10 filas de
metadatos. Sin portada, sin resumen, sin hoja por categoría, sin hoja de carencias, sin
hoja de fuentes, sin metodología y sin control de calidad.

### 3.1 Columna por columna

| # | Columna | Relleno | Qué aporta | Diagnóstico |
|---:|---|---:|---|---|
| 1 | `id` | 100 % | Nada legible. | **Es el defecto central.** Un identificador interno de 36 caracteres ocupa la primera columna, la más visible y la inmovilizada junto con las cuatro siguientes. No sirve para identificar el elemento ante un técnico municipal. |
| 2 | `codigo_ine` | 100 % | Ninguno. | «03031» en las 1.378 filas. No se ve nunca el nombre del municipio, la provincia ni la comunidad. |
| 3 | `categoria` | 100 % | Clasificación cruda. | Identificadores internos en inglés: `infraestructuras`, `equipamientos`… El Plan Territorial Muñoz.Material usa rótulos en castellano. |
| 4 | `subcategoria` | 100 % | Clasificación cruda. | `parada_autobus`, `alimentacion`, `estacion_servicio`… Sin traducir. |
| 5 | `nombre` | 100 % | **Sí.** | Único campo con valor realmente útil. En 42 filas es un número. |
| 6 | `direccion` | 43,8 % | Parcial. | Sin código postal ni núcleo en columna propia. |
| 7 | `lat` | 80,6 % | Sí. | 5 decimales (unos 1 m). Correcto. |
| 8 | `lng` | 80,6 % | Sí. | Igual. |
| 9 | `geometria_wkt` | 80,6 % | Solo para quien sepa WKT. | Hasta 15.880 caracteres en una celda. No es un formato administrativo. |
| 10 | `crs` | 100 % | **Ninguno.** | «EPSG:4326» en las 1.378 filas, y es falso en 437. |
| 11 | `fuente` | 100 % | Sí. | Seis fuentes nombradas. Es lo mejor del libro. |
| 12 | `id_origen` | 100 % | Trazabilidad. | `node/13069154940`, `partida\|3\|La Mitja Llengua\|3`. Útil para corregir en origen, pero es un identificador interno y no debe ocupar una columna protagonista. |
| 13 | `huella` | 100 % | **Ninguno.** | Hash de 32 caracteres. 100 % del volumen en una columna que no aporta nada. |
| 14 | `fecha_dato` | 2,8 % | Casi nada. | Sin fecha del dato no hay medida de antigüedad. |
| 15 | `fecha_consulta` | 100 % | Poco. | 258 valores distintos para 1.378 filas: es la marca temporal del proceso, no del dato. |
| 16 | `estado_validacion` | 100 % | Sí. | `automatico_sin_revisar`, `contrastado`, `validado_tecnicamente`. Sin traducir. |
| 17 | `estado_espacial` | 100 % | Sí. | `valido`, `proximo_limite`, `fuera_municipio`, `sin_geometria`. Sin traducir. |
| 18 | `licencia` | 100 % | Sí. | Correcto y necesario. |
| 19 | `advertencias` | 9,4 % | Sí. | «Fuera del término municipal», «Sin coordenadas». |
| 20 | `posible_baja_desde` | 4,6 % | Sí. | 63 registros. |

### 3.2 Lo que el libro no contiene

De los campos que exige el encargo, faltan en el libro: **nombre del municipio**,
**provincia**, **comunidad autónoma**, **tipo legible del elemento** (solo hay un
identificador interno), **teléfono**, **web**, **horario**, **titularidad**,
**operador o gestor**, **capacidad**, **coordenada X e Y en ETRS89 UTM**,
**huso utilizado**, **precisión de la geolocalización** (punto, centroide de edificio o
centroide de municipio), **enlace directo al objeto en OpenStreetMap**, **fecha de última
edición del objeto en el origen**, **nivel de confianza** y **índice de hojas**.

En la base de datos faltan además las columnas que permitirían generarlos: no existe
columna UTM, ni de huso, ni de precisión de geolocalización, ni de fecha de edición en
origen, ni de enlace al objeto. Habrá que añadirlas.

---

## 4. Tabla comparativa

Las tres columnas son: qué muestran los documentos de referencia, qué genera hoy
INCideas y qué falta. Cada fila es un campo o una sección concreta.

### 4.1 Identificación y contexto del municipio

| Campo o sección | Qué muestran los documentos de referencia | Qué genera hoy INCideas | Qué falta |
|---|---|---|---|
| Nombre del municipio | Portada y todas las tablas: «BENIDORM» | Solo el código `03031` en cada fila | El nombre del municipio como columna |
| Código INE | Five dígitos, en el encabezado | `03031`, correcto | — |
| Provincia | En el encabezamiento de cada sección | Nada | La columna «Provincia» |
| Comunidad autónoma | En el encabezamiento de cada sección | Nada | La columna «Comunidad autónoma» |
| Comarca | En la tabla de situación geográfica («Marina Baixa») | Nada | La columna «Comarca» |
| Población del padrón y año | Tabla propia: «Año del padrón 2025 · Población censada: 77.327 habitantes» | 29 filas sueltas con el total dentro de `atributos` | Población en la portada y en el resumen, con su año |
| Superficie y densidad | Sección 2.1 | Nada en el libro (existe en el sobre de SOCideas) | Incorporarlas a portada y resumen |
| Coordenadas del casco urbano | «38° 32' 03''N / 0° 07' 53''» | Nada | Dato de contexto en la portada |

### 4.2 Identificación de cada elemento

| Campo o sección | Qué muestran los documentos de referencia | Qué genera hoy INCideas | Qué falta |
|---|---|---|---|
| Nombre oficial del elemento | Primera columna de todas las tablas, siempre en castellano y específico («Farmacia Bali», «Helipuerto Terra Mítica») | `nombre`, pero en 42 filas es un número | Corregir las 42 filas; debe ser el primer dato del libro |
| Tipo legible del elemento | Columna «Tipo» con valores redactados: «hidrante», «Depósito», «Centro social», «Hostal», «Parroquia» | `subcategoria` con identificadores internos | Un diccionario categoria → rótulo en castellano, en el libro y en la web |
| Categoría | Sección numerada del plan (2.6 Servicios básicos, 2.7 Equipamientos) | `categoria` con identificadores internos | Rótulos en castellano |
| Identificador técnico | No aparece como dato | Columnas `id`, `huella`, `id_origen` en las tres primeras posiciones | Conservarlo, pero en columna final «ID técnico» y en hoja oculta |
| Referencia catastral | Cuando aplica: «8310102YH4781N» | Nada | Campo `refcat` para parcelas y edificios |

### 4.3 Localización

| Campo o sección | Qué muestran los documentos de referencia | Qué genera hoy INCideas | Qué falta |
|---|---|---|---|
| Dirección completa | «Av. Eduard Zaplana (H. Asia Gardens)» o «coord. (746729; 4271195)», con vía, número y municipio | `direccion` en el 43,8 %, sin desglose | Separar vía, número y municipio; 100 % cuando la fuente lo permita |
| Código postal | No siempre | `codigo_postal` no sale en el libro | Añadir la columna |
| Núcleo o partida | Columna propia en nucleus de población | `nucleo` en el 2,6 % y ausente del libro | Añadir la columna y poblarla |
| Coordenada UTM X e Y | **Formato de referencia del plan**: «coord. (749923; 4269043)» | Nada | Columnas X e Y en ETRS89 UTM |
| Huso | Implícito (30 en la Comunitat Valenciana) | Nada | Columna «Huso» y cálculo automático por longitud |
| Coordenada WGS84 | No en las tablas del plan | `lat` y `lng` con 5 decimales | Subir a 6 decimales |
| Punto dentro del polígono | Implícito | `estado_espacial`, pero como identificador sin traducir | Traducir y añadir la distancia al límite en metros |
| Precisión de la geolocalización | No explícita | Nada, y no hay columna | Columna «Precisión»: punto verificado, centroide de edificio o centroide de municipio |
| Mapa de encuadre | Columna «Mapa de encuadre nº» en todas las tablas, con referencia al anexo cartográfico | Nada | Columna de referencia cartográfica y generación del anexo |

### 4.4 Contacto y gestión

| Campo o sección | Qué muestran los documentos de referencia | Qué genera hoy INCideas | Qué falta |
|---|---|---|---|
| Teléfono | En el directorio: «965 86 51 63» | `telefono_publico` en el 8,6 %, no exportado | Exportar y normalizar a formato internacional |
| Web | En algunos casos | `web` en 122 registros, no exportado | Exportar como enlace activo |
| Horario | En sanidad, farmacia, religion yequipamientos: «L-V 09:00–21:30» | `horario` en el 3,3 %, no exportado | Exportar y normalizar |
| Titularidad | Columna propia: «Pública», «Privada», «Municipal», «Privada/concertada» | `titularidad` existe, no exportada | Exportar y normalizar a pública / privada / mixta |
| Operador o gestor | Columna propia: «Empresa gestora», «Entidad gestora», «Responsable / cargo» | `gestor` existe, no exportado | Exportar |
| Email | No en el plan | `correo_publico`, vacío | Recoger de fuentes oficiales |
| Persona responsable | El directorio de cargos, con nombre, cargo y teléfono (director del plan, suplente, comité asesor) | Nada | Fuera del alcance de la ingesta automática; corresponde a carga municipal |

### 4.5 Dotación y capacidad

| Campo o sección | Qué muestran los documentos de referencia | Qué genera hoy INCideas | Qué falta |
|---|---|---|---|
| Capacidad | En 143 alojamientos, 71 instalaciones deportivas, 64 centros de transformación, 4 centros de acogida y 2 locales sociales | `capacidad` en **0 registros** | Columna y metodología de obtención; la fuente oficial no la publica |
| Número de personal | En educación, sanidad, deporte y en el directorio de recursos | `personal_publicado` en 0 | Igual que capacidad |
| Número de plazas o usuarios | En centros sociales y equipamientos de afluencia | `aforo` en 0 | Igual que capacidad |
| Número de plantas y de sótanos | En la capa del Catastro | Nada | Conector del Catastro (INSPIRE) |
| Accesibilidad | No como columna propia; sí implícita en la elección de albergues | `accesibilidad` en 0 | Recoger de las etiquetas de acceso de OpenStreetMap y de la ficha municipal |
| Plazas de comedor, baños y duchas | En los cuatro centros de acogida: «Sí», «No», «Sin información» | Tabla `incideas_ext_albergue` **vacía** | Poblar la tabla de extensión |

### 4.6 Riesgos y entorno

| Campo o sección | Qué muestran los documentos de referencia | Qué genera hoy INCideas | Qué falta |
|---|---|---|---|
| Cursos de agua y cuenca | 35 filas con nombre, cuenca, núcleos afectados y municipios aguas arriba y abajo | Nada | Conector de hidrografía (IGN o OpenStreetMap) |
| Elementos afectados y tipo de afectación | «Total» o «Parcial», con descripción del tipo de peligrosidad | Nada | Cartografía de riesgo del MITECO |
| Zonas de especial exposición con distancia | Elementos expuestos y distancia en metros | Nada | Cálculo espacial sobre capas de riesgo |
| Puntos conflictivos | 21 puntos con descripción del problema | Nada | Cartografía de riesgo |
| Empresas con productos peligrosos | Nombre, productos, vías de acceso y proximidad a núcleos | Nada | Fuente ambiental autonómica; no hay datos abiertos nacionales verificados |
| Aglomeraciones y eventos | Fechas, asistentes aproximados y si tienen plan de autoprotección | Nada | Ninguna fuente abierta; carga municipal |
| Zonas industriales | Sección 2.5 del plan | Nada | Fuente catastral y de uso del suelo |

### 4.7 Procedencia, trazabilidad y control

| Campo o sección | Qué muestran los documentos de referencia | Qué genera hoy INCideas | Qué falta |
|---|---|---|---|
| Enlace a la fuente | 436 hipervínculos reales en la plantilla municipal; el libro de SOCideas usa «Ver ficha oficial ↗» | `fuente` como texto, sin enlace | Hipervínculos activos con lista blanca de dominios |
| Licencia | Atribución ODbL en el pie del libro | Columna `licencia`, presente y correcta | Reutilizar el bloque de licencias de SOCideas |
| Fecha de obtención | Fecha de redacción del plan y fecha de cada fuente | `fecha_consulta`, marca del proceso | Separar fecha de obtención y fecha del dato |
| Fecha de última edición en el origen | No en el plan | Nada | Metadatos de versión y fecha de edición de OpenStreetMap |
| Versión del conjunto de datos | No en el plan | `version_esquema` en el catálogo de fuentes, no exportado | Exportar versión y periodicidad |
| Estado de validación | El planHomologación y fechas de aprobación | `estado_validacion`, sin traducir | Traducir y añadir la unidad que valida |
| Nivel de confianza | No en el plan | `confianza` en **0 registros** | Implementar el cálculo y persistirlo |
| Índice de hojas | Sumario navegable del plan | No hay índice | Hoja de portada con índice navegable |
| Resumen y semáforo | No en el plan | No hay | Hoja de resumen con recuentos y semáforo de completitud |
| Carencias | Implícitas: el plan declara lo que no tiene | No hay | Hoja de carencias por categoría, con destinatario y acción |
| Metodología | Justificación legal, alcance y criterio | No hay en el libro; sí en la web | Hoja de metodología |
| Control de calidad | No en el plan | No hay | Hoja de control de calidad |
| Productor y fecha | «Ideas Medioambientales, S.L.» y «17/07/2026» | `wb.creator`, sin fecha visible | Productor, fecha de generación y aviso legal en la portada |

---

## 5. Diagnóstico

El identificador interno como dato principal no es un defecto de formato sino un
síntoma. Las causas están todas identificadas y verificadas:

1. **El libro se genera a partir de la consulta, no del modelo.** `exportacion.ts` proyecta
   directamente las columnas de `COLUMNAS_SELECT`, que empieza por `id` y acaba por
   `posible_baja_desde`. El libro reproduce la fila de la base de datos en lugar de
  ücke una ficha.
2. **El modelo carece de los campos que el encargo exige.** UTM, huso, precisión de
   geolocalización, fecha de edición en origen y enlace al objeto no existen como
   columnas. No se pueden exportar porque no se han collected.
3. **La cobertura de fuentes es municipal.** Cinco de las siete fuentes solo cubren la
   Comunitat Valenciana o un único municipio. Fuera de ella el sistema no tiene nada que
   extraer, y el libro no distingue «no hay dato» de «no se ha buscado»: las 1.378 filas
   se presentan sin indicación de su cobertura.
4. **La categoría `alimentacion` y `alojamiento` desplazan el inventario.** 403 registros
   de tiendas de alimentación y hoteles ocupan el 29,3 % del libro, mientras que los
   elementos de respuesta a emergencias suman 7. La extracción se guía por lo que
   OpenStreetMap tiene mapeado, no por lo que un plan necesita.
5. **La importación municipal pierde el nombre y el sistema de referencia.** La clave de
   la hoja de partidas incluye el área, y cuando el área falta la clave degenera;
   además el nombre se sustituye por el número del área. Y las 437 filas de la plantilla
   quedan declaradas en EPSG:4326 cuando la plantilla está en UTM 30N.

Lo que no falta y conviene conservar tal cual: el pipeline idempotente con dos claves y
protección de los registros validados, la comparación canónica de campos JSONB, la
paginación de las lecturas masivas, las reglas de posible baja, la jerarquía de fuentes de
la memoria, la validación espacial con distancia al límite, el catálogo de fuentes con su
licencia, la exclusión de visibilidad restringida en la API pública y laanquietud de las
cuarenta pruebas automáticas. Nada de eso hay que rehacerlo.

---

## 6. Decisiones técnicas que quedan tomadas y documentadas

Se adoptan estas decisiones sin consulta, por corresponder al encargo y a la evidencia
recogida:

1. **El identificador técnico sale del plano principal.** Se conserva en una columna
   final titulada «ID técnico» y en una hoja oculta del libro. Los identificadores
   `node/…`, `way/…` y `relation/…` se guardan además en un campo consultable, porque
   permiten trazar y corregir en origen.
2. **Añadir columnas, no inventarlas en la exportación.** Se creará una migración
   reversible que añada coordenada UTM, huso, precisión de geolocalización, fecha de
   edición en origen, enlace al objeto, referencia catastral y puntuación de confianza,
   más geometría PostGIS real para los puntos. Sin migración destructiva: todo
   `ADD COLUMN` con valor por defecto nulo y copia de seguridad previa.
3. **La ingesta sale del servidor.** Overpass y los extractos de Geofabrik se consultarán
   desde un trabajo por lotes fuera de la web, que escribe en Supabase y guarda el bruto
   en Cloudflare R2. La aplicación solo lee de Supabase. Se documenta que el servidor
   público de Overpass pide no usar plataformas de despliegue rápido generadas con
   inteligencia artificial y recomienda alojamiento propio para uso comercial, y se
   dejan preparadas las dos alternativas: instancia propia y proveedor de pago.
4. **El modelo de salida se construye a partir de las tablas del Plan Territorial
   Municipal.** Cuando el documento de referencia y la lista del encargo difieren,
   prevalece el documento. Así, la columna «Mapa de encuadre nº», el desglose del personal
   en categorías (médico, enfermería, auxiliar) y los campos de los centros de acogida se
   incorporan porque están en el plan.
5. **El estilo se toma de SOCideas.** Se reutilizan la paleta, las reglas de anchos, los
   hipervínculos con lista blanca de dominios, el pie de página y el posproceso de
   enlaces internos. No se crea un segundo estilo de libro.
6. **Lacategorized de riesgo se mantiene sin dato y se declara como carencia.** No se
   estima ninguna magnitud de riesgo sin un método documentado.
7. **Los municipios pequeños generan libro igualmente**, con la hoja de carencias
   detallada, aunque el libro tenga pocas filas.

---

## 7. Qué queda pendiente de esta fase

Ninguno de los puntos anteriores queda abierto. La Fase 1 puede empezar.
