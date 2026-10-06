# Auditoría §6 — `municipios.poblacion` (solo diagnóstico, sin escritura)

## Señal

8.132 municipios: 2 nulos, 6.034 por debajo de 1.000, 6 por encima de 500.000.
Los valores se repiten de forma incompatible con un padrón (511 en 667
municipios, 255 en 590, 1.021 en 306): no son poblaciones.

## Origen probable

Semillas `004_create_municipios.sql` (cabeceras), `011` y sobre todo
`014_insert_all_municipios.sql` (`p_poblacion` del lote de carga, con
`ON CONFLICT ... poblacion = EXCLUDED.poblacion`). La columna nació con
contenido ajeno al padrón y nunca se reconcilió. Esto es diagnóstico, no
culpa: hay que confirmarlo contra el lote de carga antes de corregir.

## Contraste INE 2025 (R2 SOCideas, Tempus3 validado)

| INE | Municipio | `municipios.poblacion` | INE 2025 (R2) | Veredicto |
|---|---|---|---|---|
| 03031 | Benidorm | 1.021 | 77.327 (tabla 2856) | Corrupto |
| 30030 | Murcia | 453.000 | 479.405 (tabla 2883) | Desactualizado/incoherente |
| 01030 | Lagrán | 255 | 177 (tabla 2854) | Corrupto |
| 38038 | Santa Cruz de Tenerife | 122 | 211.957 (tabla 2892) | Corrupto |
| 31201 | Pamplona/Iruña | 102 | 209.094 (tabla 2884) | Corrupto |
| 51001 | Ceuta | null | sin envelope R2 | Sin dato en ambas vías |

## Módulos que la usan

Tarjeta municipal, bloques de densidad, APIs de comparativa y exportación,
ficha y memoria INCideas, libro municipal (con `resolverPoblacion` y avisos),
perfil y economía SOCideas, página de municipios y API de municipios SOCideas.
INCideas ya la evita como valor principal; SOCideas la muestra en varios
puntos. Ningún cálculo de la Fase 3 la usa: el bloque `poblacion` lee el INE
directamente y lo indica.

## Hallazgo adicional (Fase 3, 2026-10-06)

El punto `municipios.geom` de Lagrán (01030) está a ~60 km del término
(BD: −2.871, 43.045; término real en torno a −2.58, 42.62): el arranque por
punto falló y solo el BBOX verificado lo rescató. Los centros no son fiables
en general para recortes; el polígono oficial manda. Afecta al diseño de
arranques (estáticos verificados primero) y refuerza no calcular superficies
desde el punto.

## Propuesta (preparada, NO aplicada; pendiente de orden expresa)

Migración reversible: añadir `poblacion_anio` + `poblacion_fuente` (o tabla
lateral `municipios_poblacion_historico`), cargar los 8.130 valores INE 2025
desde R2 con informe antes/después por municipio y trazabilidad
(tabla+serie+URL por fila), y publicar la reversión (`DOWN` que restaura los
valores previos fila a fila desde tabla de respaldo). Hasta su aprobación,
**ninguna escritura** en la columna.
