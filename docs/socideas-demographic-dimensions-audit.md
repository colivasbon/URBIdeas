# SOCideas — Auditoría de dimensiones demográficas (FASE 3C)

Fecha: 2026-09-06 · Rama: `feat/urbideas-premium-editorial-ui`
FASE 3C: auditar + dry-run. PROHIBIDO: escribir R2/Supabase, migraciones, batch
real, afirmar filtros disponibles, crear selectores visibles, integrar datos.
Nada de “población nativa”. Nacionalidad ≠ nacimiento ≠ residencia ≠ residencia
anterior (esta última: auditar en fase posterior, no usar como sustituto).

## 1. Fuentes auditadas (verificadas en vivo el 2026-09-06)

| Dimensión | Tabla INE | URL humana | Endpoint real | Escala | Períodos | Categorías | Sexo | Edad | Código territorial | Cobertura esperada | Secreto/supresión | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nacionalidad | 68535 | https://www.ine.es/jaxiT3/Tabla.htm?t=68535 | `GET https://www.ine.es/jaxiT3/files/t/csv_bd/68535.csv` (tabuladas; Tempus3 `VARIABLES_TABLA/68535` verificado: Municipios 143033, Sexo 143034, Edad 143035, Nacionalidad 143036; `DATOS_TABLA` limitado por volumen; `VALORES_VARIABLE` vacío: no viable) | Municipios | 2021–2025 verificados | Total, Española, Extranjera | Total, Hombres, Mujeres | `Todas las edades` + quinquenales | INE 5 dígitos en columna Municipios (match verificado 4/4) | 4/4 municipios muestra | Marcas `.`/`..`/`ND`/vacío → suprimido (0 supresiones en muestra; parser probado con fixtures) | Verificada para dry-run |
| País de nacimiento | 66322 | https://www.ine.es/jaxiT3/Tabla.htm?t=66322 | `GET https://www.ine.es/jaxiT3/files/t/csv_bd/66322.csv` (Tempus3 `VARIABLES_TABLA/66322`: Municipios 138553, Sexo 138554, Lugar de nacimiento 138555) | Municipios | 2021–2025 verificados | Total, España + ~60 (agrupadas `Otros…` incluidas) | Total, Hombres, Mujeres | Sin dimensión edad | INE 5 dígitos (match 4/4) | 4/4 | Igual tratamiento de secreto | Verificada para dry-run |
| Nacimiento–residencia | 68540 | https://www.ine.es/jaxiT3/Tabla.htm?t=68540 | `GET https://www.ine.es/jaxiT3/files/t/csv_bd/68540.csv` (Tempus3 `VARIABLES_TABLA/68540`: Municipios 143059, Sexo 143061, Edad 143062, Relación 143063) | Municipios | 2021–2025 verificados (la tarea esperaba hasta 2024; hay 2025) | Total + 5 de arraigo (ver §2) | Total, Hombres, Mujeres | `Todas las edades` + `Menos de 16` / `De 16 a 64` / `65 y más` | INE 5 dígitos (match 4/4) | 4/4 | Igual | Verificada para dry-run |

Método HTTP: GET sin auth. Respuesta: CSV tabulado (no JSON en esta vía).
Secreto/ausencia/cero/total: `.` y marcas → `suppressed` (null, nunca 0);
celda con número → `observed` (entero; negativo o decimal → fallo);
categoría inexistente → `not_available`; error HTTP/HTML → fallo.

## 2. Etiquetas fuente exactas → SOCideas (propuesta, sin UI todavía)

| Dimensión | Etiqueta visible SOCideas | Categoría fuente exacta | Definición | Se puede sumar | Riesgo de confusión | Decisión |
|---|---|---|---|---|---|---|
| Nacionalidad | Total | Total | Suma de categorías | — | Ninguno | Usar |
| Nacionalidad | Nacionalidad española | Española | Personas con nacionalidad española | Sí (Española+Extranjera=Total verificado 20/20) | No llamar “nativa” | Usar |
| Nacionalidad | Nacionalidad extranjera | Extranjera | Personas con nacionalidad extranjera | Sí | No confundir con nacimiento | Usar |
| Nacimiento | Total | Total | Suma | — | Ninguno | Usar |
| Nacimiento | Nacida en España | España | Nacidas en España (≠ nacionalidad) | Con resto si suma | No equivale a española | Usar |
| Nacimiento | Nacida en el extranjero | Resto de países (lista versionada) | Suma solo si el conjunto anual coincide | Solo con conjuntos idénticos | Países cambian (advertencia INE jul-2025) | Usar con límites: etiquetas versionadas por año; conjuntos 2021–2025 idénticos (61 cats) en la muestra |
| Arraigo | Total | Total | Suma | — | Ninguno | Usar |
| Arraigo | Mismo municipio | Mismo municipio al de residencia | Reside donde nació | Sí si exclusivas | Ninguno | Usar |
| Arraigo | Otro municipio (misma provincia) | Distinto municipio de la misma provincia | — | Sí | Ninguno | Usar |
| Arraigo | Otra provincia (misma CCAA) | Distinta provincia de la misma comunidad autónoma | — | Sí | Ninguno | Usar |
| Arraigo | Otra CCAA | Distinta comunidad | Abreviatura visible propuesta | Sí | Desarrollar en definición | Usar |
| Arraigo | Nacida en el extranjero | Nacido en el extranjero o en antiguos territorios españoles | Etiqueta exacta conservada en definición | Sí | No mezclar con nacionalidad | Usar |
| Residencia anterior | — | No localizada en estas tablas | — | No | Sustituirla por arraigo sería error | Auditar en fase posterior |

Residencia anterior: no aparece en 68535/66322/68540. Estado: **auditar en fase
posterior**. No se usa como sustituto.

## 3. Registro y dry-run

- Registro: `src/lib/socideas-demographic-dimensions.ts`
  (`requires-validation` en las 3 nuevas → ningún selector visible) +
  lector `src/lib/ine-demographic-dimensions.ts` (observaciones tipadas).
- Dry-run: `scripts/verify-demographic-dimensions-dry-run.ts` (streaming,
  salida temprana por completitud, 12 municipios×dimensión + coherencia 20/20
  + comparabilidad de países + estrategias con tamaños ESTIMADOS).
- Recomendación: **integrar nacionalidad** (coherencia exacta, categorías
  estables); **integrar nacimiento y arraigo con límites** (etiquetas exactas,
  países versionados por año); **no integrar residencia anterior**
  (sin fuente localizada). Carga real NO autorizada en esta tarea.

