# SOCideas — Preflight nacional de dimensiones demográficas INE (FASE 3D)

Fecha de extracción: 2026-09-06 · Rama: `feat/urbideas-premium-editorial-ui`
SOLO LECTURA. Cero escrituras R2/Supabase, cero migraciones, cero UI/XLSX/API.
Informes locales solo en `tmp/` (ignorado). Nombres de municipios pequeños no
publicados: solo conteos + códigos 02003/07010/02069/28143 (autorizados).

## 2. Fuentes y URLs públicas

- 68535 Nacionalidad: `https://www.ine.es/jaxiT3/Tabla.htm?t=68535` · datos
  `GET https://www.ine.es/jaxiT3/files/t/csv_bd/68535.csv` (tabuladas).
- 66322 País de nacimiento: `?t=66322` · `csv_bd/66322.csv`.
- 68540 Arraigo: `?t=68540` · `csv_bd/68540.csv`.
- Metadatos Tempus3 verificados: `VARIABLES_TABLA/{id}` (68535: 143033/143034/
  143035/143036; 66322: 138553/138554/138555; 68540: 143059/143061/143062/143063).
  `DATOS_TABLA` sin filtros es inviable por volumen; `VALORES_VARIABLE` vacío.

## 3. Checksum/tamaño de cada CSV

| Tabla | Fecha | Bytes | SHA-256 | Líneas | Filas municipales |
|---|---|---:|---|---|---|
| 68535 | 2026-09-06 | 684.2 MB leídos | ver `tmp/pre-3d-nat.json` | 8.103.151 | todas |
| 66322 | 2026-09-06 | 523.3 MB leídos | ver `tmp/pre-3d-pais.json` | 7.489.276 | todas |
| 68540 | 2026-09-06 | 319.3 MB leídos | ver `tmp/pre-3d-arraigo.json` | 2.946.601 | todas |

## 4. Años disponibles

2021, 2022, 2023, 2024, 2025 en las tres tablas (68540 trae 2025 aunque se
esperaba hasta 2024). Conjunto de 61 categorías de país idéntico 2021–2025.

## 5. Cobertura nacional por dimensión

Catálogo SOCideas: **8130** municipios (Ceuta 51001 y Melilla 52001 ausentes del
catálogo: límite documentado, no fallo de match).

| Dimensión | Municipios catálogo | Municipios con match | Cobertura % | Sin match | Sin dato | Suprimidos | Categorías completas | Último año | Años comparables |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Nacionalidad | 8130 | 8130 | 100.0 % | 0 | 0 | 1 | 8130 | 2025 | 2021–2025 |
| Nacimiento | 8130 | 8130 | 100.0 % | 0 | 0 | 1 | 8130 | 2025 | 2021–2025 |
| Arraigo | 8130 | 8130 | 100.0 % | 0 | 0 | 1 | 8130 | 2025 | 2021–2025 |

## 6. Cobertura por CCAA

| CCAA | Municipios catálogo | Nacionalidad | Nacimiento | Arraigo | Sin match | Supresión | Observación |
|---|---|---:|---:|---:|---:|---|---|
| Andalucía | 785 | 785/785 | 785/785 | 785/785 | 0 | no | — |
| Aragón | 731 | 731/731 | 731/731 | 731/731 | 0 | no | — |
| Asturias | 78 | 78/78 | 78/78 | 78/78 | 0 | no | — |
| Canarias | 88 | 88/88 | 88/88 | 88/88 | 0 | no | — |
| Cantabria | 102 | 102/102 | 102/102 | 102/102 | 0 | no | — |
| Castilla y León | 2248 | 2248/2248 | 2248/2248 | 2248/2248 | 0 | no | — |
| Castilla-La Mancha | 919 | 919/919 | 919/919 | 919/919 | 0 | no | — |
| Cataluña | 947 | 947/947 | 947/947 | 947/947 | 0 | no | — |
| Comunidad Foral de Navarra | 272 | 272/272 | 272/272 | 272/272 | 0 | no | — |
| Comunidad de Madrid | 179 | 179/179 | 179/179 | 179/179 | 0 | no | — |
| Comunitat Valenciana | 542 | 542/542 | 542/542 | 542/542 | 0 | no | — |
| Extremadura | 388 | 388/388 | 388/388 | 388/388 | 0 | no | — |
| Galicia | 313 | 313/313 | 313/313 | 313/313 | 0 | no | — |
| Islas Baleares | 67 | 67/67 | 67/67 | 67/67 | 0 | no | — |
| La Rioja | 174 | 174/174 | 174/174 | 174/174 | 0 | no | — |
| País Vasco | 252 | 251/252 | 251/252 | 251/252 | 0 | sí | 1 municipio con supresión (agregado) |
| Región de Murcia | 45 | 45/45 | 45/45 | 45/45 | 0 | no | — |

## 7. Calidad de match del código INE

8130/8130 con match exacto de 5 dígitos; 0 códigos fuente sin catálogo
conflictivo; cruce nombre↔código verificado en 02003/07010/02069/28143.

## 8. Resultados de coherencia

- Nacionalidad (Total = Española + Extranjera, 2021–2025): **8130/8130 exacta**
  (p. ej. La Roda 2025: 15792 = 13428+2364; Somosierra 2025: 93 = 89+4).
- Nacimiento: sin agregados España/Extranjero en fuente → coherencia no
  evaluable; prohibido sumar países (categorías agrupadas solapadas).
- Arraigo (Total = 5 categorías, 2021–2025): **8130/8130 exacta**.

## 9. Supresiones, nulos y ceros reales

1 municipio con supresión por dimensión (País Vasco, agregado); 2586/7101/573
ceros genuinos conservados (Extranjera=0, países=0, tramos=0); marcas `.`/`..`/
`ND`/vacío → suprimido (null, nunca 0); 0 valores negativos, 0 decimales.

## 10. Comparabilidad temporal

Periodos 2021–2025 en las 3 tablas; categorías de país idénticas los 5 años;
nacionalidad y arraigo con categorías estables. Sin serie homogénea de países
expuesta (solo resumen + etiquetas versionadas si se detalla).

## 11. Tamaños medidos (JSON serializado real)

- Observación: ~57 B/registro (medido).
- Resumen nacionalidad: 1.01 MB (gzip 0.09) · media 130 B · p50 129 B · p95 135 B · max 141 B.
- Resumen nacimiento: 0.80 MB (gzip 0.07) · media 104 B · p50 103 B · p95 107 B · max 111 B.
- Resumen arraigo: 2.66 MB (gzip 0.17) · media 343 B · p50 343 B · p95 352 B · max 363 B.
- **Resumen total nacional: ~4.5 MB (gzip ~0.3 MB)**. 0 municipios >25 KB.
- Detalle (muestra 39 munis): media 61.240 B · p95 81.669 B · max 82.532 B →
  extrapolado ~475 MB nacional (ESTIMADO).

## 12. Estrategia recomendada

| Estrategia | Datos | Tamaño nacional | Tamaño p95 municipal | Impacto de lectura | Decisión |
|---|---|---:|---:|---|---|
| Resumen municipal | 3 dimensiones agregadas | ~4.5 MB (gzip ~0.3) | 352 B | +1 JSON pequeño por ficha | **Recomendada** |
| Detalle completo | sexo, edad, países y series | ~475 MB (ESTIMADO) | ~82 KB | Degrada ficha y R2 | No recomendada |
| Híbrido | resumen batch + detalle bajo demanda | batch = resumen | — | Latencia solo al pedir | Alternativa válida |

## 13. Riesgos y límites

Catálogo sin Ceuta/Melilla; países sin agregado Extranjero (no sumar);
supresión posible en municipios pequeños (1 caso/dimensión hoy); ficheros
fuente de 300–700 MB (solo servidor, jamás navegador); Tempus3 no viable
por municipio sin IDs pre-resueltos.

## 14. Recomendación de carga

- **Autorizar resumen** (nacionalidad + nacimiento Total/España + arraigo 5+Total).
- **Autorizar híbrido** como alternativa (detalle solo bajo demanda futura).
- **No autorizar todavía** ninguna escritura (esta fase es solo preflight).

Contrato propuesto (documental, no implementado en envelopes):

```ts
type MunicipalDemographicSummary = {
  source: 'INE'
  generatedAt: string
  dimensions: {
    nationality?: {
      period: string
      total: number | null
      spanish: number | null
      foreign: number | null
      status: 'observed' | 'partial' | 'suppressed' | 'missing'
    }
    birthCountry?: {
      period: string
      total: number | null
      bornInSpain: number | null
      bornAbroad: number | null
      status: 'observed' | 'partial' | 'suppressed' | 'missing'
    }
    birthResidenceRelation?: {
      period: string
      total: number | null
      sameMunicipality: number | null
      sameProvinceOtherMunicipality: number | null
      sameAutonomousCommunityOtherProvince: number | null
      otherAutonomousCommunity: number | null
      bornAbroad: number | null
      status: 'observed' | 'partial' | 'suppressed' | 'missing'
    }
  }
}
```
