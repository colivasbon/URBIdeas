# Fuentes económicas Fase 2B — matriz verificada en vivo (2026-09-03)

Todas las fuentes se comprobaron con consultas reales (web oficial, Tempus3 en vivo o catálogo datos.gob.es). Nada procede de memoria.

## Matriz obligatoria

| Indicador | Organismo | Fuente | Cobertura municipal | Año más reciente | Formato/API | Automatizable | Implementar 2B |
|---|---|---|---|---|---|---|---|
| Nº declaraciones IRPF | AEAT | Estadística declarantes IRPF por municipios (EDM) | Municipios >1.000 hab., territorio fiscal común (sin PV/Navarra) | 2023 (ejercicio; pub. oct-2025) | HTML + ficheros base xlsx por ejercicio | Sí, descarga controlada en sync (`xlsx` ya en deps) | **Sí** |
| Renta bruta media por declaración | AEAT | EDM | Idem | 2023 | Idem | Sí | **Sí** |
| Renta disponible media por declaración | AEAT | EDM | Idem | 2023 | Idem | Sí | **Sí** |
| Renta neta media por habitante/hogar | INE | ADRH, tablas municipales (descarga; Tempus3 solo hasta provincia, tabla 53688 verificada en vivo) | Todos los municipios (renta media sin umbral desde 2020) | 2023 | CSV por tabla `ine.es/jaxiT3/files/t/csv_bd/{id}.csv` + Tempus3 53688 para CCAA/provincia/España | Sí, con mapeo de IDs de tabla municipal | **Sí** |
| Índice de Gini | INE | ADRH tabla municipal Gini/P80P20 (p. ej. 37683: CSV verificado con filas por municipio/distrito/sección) | Municipios ≥100 residentes | 2023 (serie 2015-2023) | CSV descarga + Tempus3 53688 (comparativas) | Sí | **Sí** |
| Ratio P80/P20 | INE | ADRH, idem | Idem | 2023 (serie 2015-2023) | Idem | Sí | **Sí** |
| Nº empresas total | INE | DIRCE, tabla 4721 Tempus3 (verificada: responde; >5 MB sin filtro) | Todos (sede en el municipio) | 2025 (ref. 1-ene) | Tempus3 `DATOS_TABLA/4721…&tv=` por municipio | Sí, con filtro `tv=` obligatorio | **Sí** |
| Empresas industria / construcción / servicios | INE | DIRCE 4721, grupos A2/A3/A4-A10 (metodología municipal verificada) | Total siempre; <1.000 hab. solo total; 1.000-5.000 reducida; >5.000 ampliada | 2025 | Idem | Sí | **Sí** (agregado 4 sectores; agricultura según cobertura CNAE verificada en sync) |
| Superficie agraria (arable, leñosos, pastos, huertos, SAU total) | INE | Censo Agrario 2020, resultados municipales (tabla tipo 29006 verificada en catálogo) | Todos (umbral explotación: 5 ha SAU) | 2020 (estructural) | jaxiT3 + CSV | Sí | **Sí** (5 categorías agregadas, ha) |
| Ganadería (explotaciones + cabezas: bovino, ovino-caprino, porcino, aves) | INE | Censo Agrario 2020, ganadería municipal | Idem, con secreto estadístico | 2020 (estructural) | Idem | Sí | **Sí** (ND ≠ 0) |
| Paro registrado (total/sexo/edad/sector) | SEPE | Paro por municipios (CSV/XLS mensual nacional ~10 MB, nota metodológica verificada) | Todos | Mensual | CSV/XLS nacional | Parcial (fichero nacional mensual, volátil) | **Preparar, no cargar** |
| Afiliación Seg. Social | TGSS | Afiliación por municipio (a verificar en implementación) | A verificar | — | — | — | **Aplazar** (conector futuro) |
| Presupuestos/liquidaciones | MHACIENDA | Presupuestos y liquidación (a verificar) | Heterogénea | — | — | — | **Aplazar** (documental) |
| Ayudas y subvenciones | Varias | BDNS/autonómicas | Heterogénea | — | — | — | **Aplazar** |
| Suelo industrial/polígonos | CCAA/SEPES | Sin fuente nacional homogénea | No homogénea | — | — | No | **Aplazar** |

## Notas por fuente (verificación 2026-09-03)

### A. AEAT — Estadística de declarantes del IRPF por municipios (EDM)
- URL base verificada: `sede.agenciatributaria.gob.es/Sede/datosabiertos/catalogo/hacienda/Estadistica_de_los_declarantes_del_IRPF_por_municipios.shtml`. Publicación anual; última 2023 (1-oct-2025); próxima oct-2026 (datos 2024).
- Umbral: municipios de más de 1.000 habitantes; territorio fiscal común (excluye País Vasco y Navarra: forales). Municipios bajo umbral o forales → estado `pending`/`no disponible`, nunca cero.
- Variables objetivo: número de declaraciones, renta bruta media, renta disponible media (+ medianas y posicionamientos como contexto, no como indicador principal).
- Advertencia metodológica propia de la AEAT: la renta media por declaración NO es renta individual ni por hogar (depende de tributación individual/conjunta). La ficha debe incluir la nota literal: "Importes medios por declaración, no renta media por habitante".
- Comparativas provincial/autonómica/nacional: la propia publicación ofrece agregados por CCAA/provincia/tamaño — reutilizables como comparativa homogénea.
- Automatización: sin API JSON; ficheros base por ejercicio (xlsx) + HTML estable por ejercicio. El sync acepta la URL del fichero aportada por el operador. `xlsx` ya es dependencia del proyecto. **Estado 2026-09-04**: la home 2023 no expone enlaces directos xlsx (tablas HTML); sin scraping frágil en producción → bloque pendiente con conector implementado y a la espera del fichero base.

### B. INE — ADRH (Atlas de Distribución de Renta de los Hogares)
- Operación basada en registros administrativos; serie 2015-2023; nota de prensa ADRH2023 y metodología (oct-2025) verificadas.
- Tempus3 en vivo: tabla **53688** (Gini + P80/P20 nacional/CCAA/provincia/islas; series `ADRH9974xxx`; unidades FK 101/123; campo `Secreto`). Sirve para comparativas.
- Nivel municipal/distrito/sección: "solo descargas por volumen" (CSV `jaxiT3/files/t/csv_bd/{tabla}.csv`; ejemplo 37683 verificado con filas `05001 Adanero … 2023 28,2`). El sync 2B usa descarga CSV + filtro por código INE.
- Umbrales: Gini/P80P20 solo ≥100 residentes; rentas medias sin umbral (desde 2020). Municipios pequeños pueden tener renta media pero no Gini: estados independientes por indicador.
- No calcular Gini propio; no mezclar con EDM (renta por declaración ≠ renta por habitante/unidad de consumo); series con misma metodología 2015-2023.

### C. INE — DIRCE tabla 4721
- "Empresas por municipio y actividad principal", 2012-2025, ref. 1 de enero. `DATOS_TABLA/4721` responde (>5 MB: **filtro `tv=` por municipio obligatorio**).
- Desglose municipal por tamaño (metodología verificada): <1.000 hab. solo total; 1.000-5.000 reducida (Total, A2, A3, A4, A11); >5.000 ampliada (A2-A11). Empresa = sede en el municipio. **Nº empresas ≠ empleo**.
- Agregado 2B: total + industria (A2) + construcción (A3) + servicios (A4-A10/A11). Agricultura (sección A CNAE): verificar inclusión en 4721 durante la implementación; si ausente, bloque "pendiente de fuente homogénea" (no usar CCAA como sustituto nacional).

### D. INE — Censo Agrario 2020
- **Tempus3 tabla 29006 "Resultados municipales" (verificada en vivo 2026-09-04)**: 3 agregados por municipio vía `tv=19:{id}` — SAU (ha), nº de explotaciones y unidades ganaderas totales. Año único 2020, estructural. Implementado en 2B (`gan_ug_total` añadido al catálogo).
- Detalle por cultivos (arable, leñosos, pastos, huertos) y especies: solo en descargas jaxiT3 por provincia (IDs pendientes de resolver) → bloques en estado pendiente con aviso estructural. Sin inventar desgloses.

### E. Empleo/desempleo/afiliación — preparar, no cargar
- SEPE: CSV/XLS mensuales nacionales (~10 MB) con paro por municipio × sexo × 3 tramos de edad × sector (+ "sin empleo anterior"). Formato apto pero fichero nacional mensual y volatilidad alta → en 2B solo bloque "pendiente" + diseño del conector documentado (descarga mensual, filtro municipal, serie de 12 fotos). Sin falsa solución nacional.
- Afiliación (TGSS) y empresas/trabajadores por sector: requieren conectores regionales o verificación pendiente → aplazados con ficha documental.

### F. Presupuestos, ayudas, suelo industrial — documental
- Sin cobertura nacional homogénea verificada → bloques pendientes con el texto prescrito. Fuentes candidatas (a verificar en fase posterior): liquidación presupuestaria MHACIENDA, BDNS, SEPES/CCAA para suelo industrial.

## Geometrías de secciones censales (adelanto §9)
- INE OGC API Features (`ine.es/geoserver/ogc/features/v1`, colecciones `Secciones_2024/2025`, attrs `CPRO/CUMUN/CSEC…`), WFS 2.0 y shapefiles. Filtro por municipio (`CUMUN` = INE 5 dígitos) + `bbox`. Atribución obligatoria: "Seccionado cedido por el Instituto Nacional de Estadística". Detalle en `socideas-phase-2b-secciones-censales.md`.
