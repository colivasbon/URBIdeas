# SOCideas — Payload demográfico: R2 crudo vs DTO de ficha

Fecha: 2026-09-06 · Medido sobre `tmp/demo3e-summaries.json` (8130 objetos,
misma serialización escrita en R2) y el adaptador
`src/lib/socideas-demographic-summary.ts`. Sin reescribir la colección.

## Diferencia 4,5 MB → 51,5 MB

La estimación (~4,5 MB) contaba ~9 filas resumen por municipio a ~57 B/tupla
(medida de envelopes). El objeto R2 real incluye, por contrato autorizado:

- `birthCountry.categories` con las **61 categorías de país** publicadas
  (~61 × ~80 B ≈ 4,9 KB por municipio): es el grueso de la diferencia.
- Metadatos repetidos por objeto: bloque `source` (3 URLs + periodos, ~400 B),
  nombre municipal, 5 campos de arraigo y estados por dimensión.

Nada de esto es relleno: son datos fuente y trazabilidad exigidos. El DTO de
presentación recorta lo que viaja a la ficha (top-5 países, sin URLs).

| Métrica | Valor | Método |
|---|---|---|
| Tamaño medio objeto R2 crudo | 6335 B | JSON de los 8130 objetos |
| Tamaño p95 objeto R2 crudo | 6388 B | idem |
| Categorías medias de país por municipio | 61,0 (p50 61, p95 61, max 61) | `birthCountry.categories` |
| Tamaño medio DTO de ficha | 1637 B | DTO en muestra de 10 municipios |
| Tamaño p95 DTO de ficha | 1671 B | idem |
| Máximo DTO de ficha | 1671 B | idem (28079) |
| Categorías de país expuestas por defecto | 5 + España | `topCountries` (DTO) |

Muestra DTO (10): 02065, 28143, 03002, 07010, 02069, 02003, 15078, 41091,
50297, 28079. **DTO p95 (1671 B) < 5 KB**: no hay causa que detener.

Conclusión: 6,3 KB por ficha es razonable; el DTO (~1,6 KB) es lo único que
llega al navegador, sin las 61 categorías y sin metadatos de ingesta.
