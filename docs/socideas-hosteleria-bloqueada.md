# SOCideas — Hostelería bloqueada (op. 238 EOH / Frontur)

**Estado: BLOQUEADO por diseño — no integrable en el envelope v2 municipal.**
**Alcance Fase 2B:** 5 tablas con variable `Codigo = "MUN"` que NO son municipios INE.
**Regla del subagente:** cero código, cero joins forzados, sin cambios en otros ficheros.

## 1. Causa exacta

Las 5 tablas exponen una dimensión etiquetada `MUN` cuyo dominio NO es el nomenclátor municipal INE (5 dígitos, joinable con `municipios.codigo_ine`), sino un catálogo propio de **puntos / zonas turísticas** (~130 valores) con códigos alfanuméricos cortos no-INE (p. ej. `G2` / `K2` / `A5` según verificación en vivo).

Evidencia Tempus3 (op. 238):

- Tabla 2076 — `https://www.ine.es/jaxiT3/Tabla.htm?t=2076` — variable `Codigo="MUN"`, valores punto turístico (no-INE).
- Tabla 2077 — `https://www.ine.es/jaxiT3/Tabla.htm?t=2077` — variable `Codigo="MUN"`, valores punto turístico (no-INE).
- Tabla 2078 — `https://www.ine.es/jaxiT3/Tabla.htm?t=2078` — variable `Codigo="MUN"`, valores punto turístico (no-INE).
- Tabla 75197 — `https://www.ine.es/jaxiT3/Tabla.htm?t=75197` — variable `Codigo="MUN"`, valores punto turístico (no-INE).
- Tabla 75198 — `https://www.ine.es/jaxiT3/Tabla.htm?t=75198` — variable `Codigo="MUN"`, valores punto turístico (no-INE).

Fragmento tipo observado (verificación en vivo, común a las 5):

> `Codigo: "MUN" → valores ~130, p. ej. "G2", "K2", "A5" (punto turístico), sin correspondencia con `municipios.codigo_ine`.`

Cualquier join `Codigo ↔ municipios.codigo_ine` falla por diseño: no hay clave compartida.

## 2. Por qué `len(Codigo) = 5` no aplica aquí

En el resto de fuentes SOCideas, `len(Codigo) = 5` es el filtro válido para detectar filas municipales (código INE de provincia+municipio, p. ej. `28079`) y joinear con `municipios.codigo_ine`.

Aquí no aplica porque:

1. El dominio de `MUN` en estas 5 tablas no son códigos INE: son códigos de punto turístico de longitud/vocabulario distintos (`G2`, `K2`, `A5`, …).
2. Aplicar `len(Codigo)=5` daría **cero filas válidas** (o peor, falsos positivos si algún código coincidiese en longitud por azar sin ser INE).
3. No existe tabla de equivalencia oficial punto-turístico → municipio INE dentro de la respuesta Tempus3 de estas tablas.

Forzar el filtro sería fabricar geografía.

## 3. Opciones

### (a) Excluir indefinidamente del envelope v2 municipal [RECOMENDADA]

No ingerir las 5 tablas en `municipios` / capas v2. Documentar como fuente no-municipal y no reintentar hasta que el INE cambie el producto (ver §4).

Razón: el envelope v2 garantiza que toda fila es un municipio INE joineable (`codigo_ine`, 5 dígitos). Incluir puntos turísticos rompería ese contrato, contaminaría fichas/XLSX con ámbitos no comparables y obligaría a mantener una correspondencia manual sin fuente oficial (deriva + coste de mantenimiento). Excluir preserva integridad factual.

### (b) Capa separada "punto turístico" con geometría propia, fuera del envelope v2

Si el producto necesita hostelería, crear una capa/producto aparte (`punto_turistico`, no `municipio`), con su propia geometría (punto o agregación publicada por el INE) y sin join a `municipios.codigo_ine`. Requiere: catálogo de ~130 puntos, geometría/centroides con fuente y fecha, y UI que no los mezcle con municipios. Fuera del alcance v2; no reutilizar selectores ni fichas municipales.

## 4. Qué tendría que cambiar en el INE para desbloquearlo

Basta con UNA de estas:

1. Publicar en estas tablas (o anexos de la op. 238) una **correspondencia oficial punto-turístico → municipio(s) INE** (5 dígitos), con vigencia y regla de reparto si un punto abarca varios municipios.
2. Añadir una **segunda variable con el código municipal INE** (5 dígitos) junto al punto turístico, manteniendo `MUN-turístico` como etiqueta descriptiva.
3. Renombrar/corregir el `Codigo` (`ZTUR` / `PUNTUR` en vez de `MUN`) y documentar el nomenclátor turístico como producto no-municipal, para que ningún consumidor lo confunda con municipios.

Mientras ninguna ocurra, el bloqueo se mantiene por diseño.
