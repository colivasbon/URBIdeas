# Paso 2 — Medición real, cobertura y extrapolación nacional

## Tamaños medidos (2026-10-06)

Supabase `urbideas` free (500 MB): ~178 MB ocupados (`asociaciones` 126 MB,
`data_sync_runs` 31 MB, tablas Fase 3 ~248 KB). R2 `socideas-data`: 147.256
objetos / 2,97 GB; prefijo Fase 3: 44 objetos / 2,93 MB.

## Por bloque (muestra 6 municipios → 8.132)

| Bloque | Media/municipio | Proyección R2 | Control |
|---|---|---|---|
| hidrografia (tramos sin geometría) | 306 KB | ~2,4 GB | 6 cargado |
| limites (polígono exacto) | 135 KB | ~1,1 GB | 6 cargado |
| farmacias | 38 KB | ~300 MB | 5 cargado, 2 cero |
| inundabilidad (fichas) | 25 KB | ~200 MB | 7 cargado |
| recarga | 9 KB | ~73 MB | 5 cargado, 1 cero |
| combustible | 5 KB | ~37 MB | 5 cargado, 1 cero |
| educacion | 4 KB | ~34 MB | 2 cargado, 6 cero |
| sanidad | 1 KB | ~11 MB | 4 cargado, 3 cero |
| poblacion | 0,3 KB | ~3 MB | 5 cargado, 1 sin cobertura |
| depuradoras | 0 | 0 | 6 sin cobertura (PRTR parcial) |

Supabase (control): 65 filas hoy; 8.132 × ~12 ≈ 100k filas (~14 MB): cabe
en el plan (322 MB libres). R2 nacional ≈ 4,2 GB: sin límite de plan que lo
impida; aun así se aplica desde ya la alternativa: tramos sin geometría en
R2 por municipio, geometrías exactas solo en recortes, y en la web
simplificación para visualización (la de análisis no se toca).

## Matriz bloque × municipio (estado; n = objetos)

- 01030 Lagrán: limites✓1, poblacion✓, combustible=0 (ID 25 válido),
  sanidad=0, farmacias=0, recarga=0, depuradoras s/c, educacion=0,
  hidro 291, inund 3.
- 03031 Benidorm: limites✓, poblacion✓, combustible 10, sanidad=0,
  farmacias=0, educacion 37 (GVA), recarga 31, depuradoras s/c,
  hidro 522, inund 1+50 (SNCZI+PATRICOVA).
- 30030 Murcia: limites✓, poblacion✓, combustible 111, sanidad 11,
  farmacias 416, recarga 124, depuradoras s/c, educacion=0, hidro 5.699,
  inund 1.
- 31201 Pamplona: limites✓, poblacion✓, combustible 12, sanidad 7,
  farmacias 311+211 (REGCESS-E + Navarra), educacion 115 (Navarra),
  recarga 35, depuradoras s/c, hidro 194, inund 3.
- 38038 Santa Cruz de Tenerife: limites✓, poblacion✓, combustible 33,
  sanidad 9 (+Tenerife s/c), farmacias 195, recarga 42, depuradoras s/c,
  educacion=0, hidro 1.630, inund 3.
- 51001 Ceuta: limites✓, poblacion s/c (sin envelope), combustible 10,
  sanidad 2, farmacias 52, recarga 1, depuradoras s/c, educacion=0,
  hidro 250, inund 3.

✓ = cargado, =0 = cero_resultados (consulta válida), s/c = sin_cobertura
con motivo. Ningún estado inventado: lo que falla queda registrado.
