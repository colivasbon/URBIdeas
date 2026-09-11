# SOCideas — Auditoría de capas municipales INE (Fase 4)

Fecha: 2026-09-11 · Rama: `feat/urbideas-premium-editorial-ui`
Alcance: auditar capas INE candidatas (no duplicar las ya existentes), decidir
cuáles son aptas para carga persistente y documentar las que no lo son.

Evidencia real recogida en esta tarea con `curl` contra fuentes públicas INE
(2026-09-11). No se ha escrito R2 para ninguna capa en esta tarea.

## 1. Método

Para cada familia candidata se comprobó, contra la fuente pública INE:

1. Endpoint real (Tempus3 `servicios.ine.es/wstempus/js/ES/...` o jaxi).
2. HTTP y formato.
3. Escala (variable Municipios/Provincia y Municipio).
4. Años/período.
5. Secreto/supresión (pendiente de preflight nacional).
6. Tamaño nacional (payload de la tabla sin filtrar).
7. Decisión.

## 2. Evidencia de endpoints (2026-09-11)

| Endpoint | Resultado |
|---|---|
| `GRUPOS_TABLA/69767` | 200 · `Provincia y Municipio`, `Sexo`, `Tipo de saldo` |
| `SERIES_TABLA/69767?tip=M` | 200 · **73.665 series** · **8.132 códigos INE-5** (variable 19) · variable 349 nacional, 18 sexo, 876 saldo (Total/Exterior/Interior) |
| `DATOS_TABLA/69767?nult=1&tip=A` | 200 · `application/json` · **18.829.153 B** (~18,8 MB) |
| `GRUPOS_TABLA/33578` | 200 · `Sexo`, `Municipios`, `Nacionalidad (principales nacionalidades)` |
| `SERIES_TABLA/33578?tip=M` | 200 · 10.560 series · **solo 87 códigos INE-5** (cobertura municipal limitada) |
| `DATOS_TABLA/33578?nult=1&tip=A` | 200 · `application/json` · **2.654.342 B** (~2,65 MB) |
| `jaxi/Tabla.htm?tpx=55249` | 200 · `text/html` · 40.698 B |
| `GRUPOS_TABLA/55249` | 404 (Tempus3 no contiene la tabla) |
| `jaxiT3/files/t/csv_bd/55249.csv` | 204 sin contenido |
| `jaxi/files/t/csv_bd/55249.csv` | 204 sin contenido |
| `jaxi/Tabla.htm?tpx=52071` | timeout (000); reintento requerido |
| `jaxi/Tabla.htm?tpx=52076/52081/52082` | 200 · `text/html` |

Conclusión técnica:

- **69767 (movilidad migratoria)**: escala municipal confirmada y **cobertura
  nacional completa medida** (`8.132/8.132` códigos INE-5 presentes en el
  catálogo de series). Sexo y tipo de saldo (total/interior/exterior) presentes.
- **33578 (nacionalidades principales)**: escala municipal nominal, pero
  **solo 87 municipios** en el catálogo de series → **no cubre el territorio
  nacional**; no apta como capa municipal.
- **Censo 2021 (educación) y Censo Agrario 2020**: viven en el sistema **jaxi**
  (`?tpx=`), **no** en Tempus3 y no exponen el CSV histórico en
  `jaxiT3/files/t/csv_bd/{id}.csv`. Sin resolver el endpoint de descarga
  municipal del sistema jaxi, no pueden pasar el precheck ni cargarse (no se
  inventa el endpoint).

## 3. Inventario de capas revisadas

| Capa | Tabla/operación INE | Escala | Año/período | Match nacional | Supresiones | Tamaño nacional | Estado | Decisión |
|---|---|---|---|---:|---:|---:|---|---|
| Densidad de población | sin tabla INE homogénea de superficie municipal | municipal requieren superficie | — | — | — | — | Sin fuente de superficie verificada | **Solo cálculo derivado (bloqueado)** |
| Edad media | derivable de la pirámide (tabla 33570) | municipal | anual (últ. 2022) | alta (33570) | — | — | Calculable | **Solo cálculo derivado** |
| Dependencia total / infantil / mayores | derivable de 33570 | municipal | anual (últ. 2022) | alta | — | — | Calculable | **Solo cálculo derivado** |
| Índice de envejecimiento | derivable de 33570 | municipal | anual (últ. 2022) | alta | — | — | Calculable | **Solo cálculo derivado** |
| Variación de población 5/10 años | derivable de DPOP | municipal | anual | alta | — | — | Ya implementado | **Solo cálculo derivado (ya existente)** |
| Esperanza de vida | INE publica por provincia/CCAA, no municipal nacional | provincial/CCAA | trienal | — | — | — | Sin cobertura municipal nacional | **No apta** |
| Saldo migratorio total/interior/exterior y por sexo | **69767** | municipal (var. 19, 8.132 códigos) | anual (2021–2024) | **100,0 % (8.132/8.132)** | sin supresiones en la muestra (9/9 válidos) | 38,7 MB series · 18,8 MB datos 1 año · **p95 muestra 6.973 B** | Match y muestra superados | **Apta para carga** (dataset nacional y credenciales R2 pendientes) |
| Nacionalidades principales | **33578** | municipal nominal (var. 19, solo 87 códigos) | anual | **1,07 % (87/8.132)** | pendiente | 2,65 MB datos 1 año | Cobertura municipal insuficiente | **No apta** |
| Nivel educativo (Censo 2021) | **55249** (jaxi `?tpx=55249`) | municipal por confirmar | estructural 2021 | no | no | no resuelto | Endpoint jaxi sin CSV municipal | **Pendiente de validación** |
| Uso de la tierra / explotaciones | **52071** (jaxi) | municipal por confirmar | estructural 2020 | no | no | no resuelto (timeout) | Endpoint jaxi sin CSV municipal | **Pendiente de validación** |
| Ganadería (explotaciones/cabezas) | **52076** (jaxi) | municipal por confirmar | estructural 2020 | no | no | no resuelto | Endpoint jaxi sin CSV municipal | **Pendiente de validación** |
| Titulares/jefes de explotación | **52081** (jaxi) | municipal por confirmar | estructural 2020 | no | no | no resuelto | Endpoint jaxi sin CSV municipal | **Pendiente de validación** |
| Formación agraria | **52082** (jaxi) | municipal por confirmar | estructural 2020 | no | no | no resuelto | Endpoint jaxi sin CSV municipal | **Pendiente de validación** |

Notas:

- No se duplica ninguna capa ya existente (población, evolución, edad/sexo,
  comparativas, española/extranjera, país de nacimiento, arraigo, renta, Gini,
  P80/P20, empresas, agrario/ganadería básicos).
- Las capas derivadas se etiquetan siempre
  `Fuente: INE · Cálculo SOCideas sobre datos oficiales`, nunca como dato INE
  publicado.
- La densidad **no se calcula** mientras no exista una fuente nacional
  homogénea y verificable de superficie municipal.
- La esperanza de vida **no se carga**: no hay cobertura municipal nacional
  comparable.

## 4. Precheck (checklist por capa)

Solo `69767` supera el match territorial nacional (100 %). `33578` queda
rechazada por cobertura municipal insuficiente (87/8.132). El preflight de
muestra de `69767` (9 municipios, 5 CCAA, pequeño y grande) valida contrato,
supresión y tamaño (p95 6.973 B ≤ 25 KB).

Ninguna capa alcanza aún el conjunto completo exigido para escribir R2:

```text
- Escala municipal confirmada ......... 69767 (sí) · 33578 (no) · resto (no)
- Match territorial ≥ 99,5% ............ 69767: 100,0 % (sí) · resto: no
- Código INE-5 validado ................ 69767 (sí, 8.132 códigos)
- Período identificado ................. sí (anual, 2021–2024)
- Fuente pública identificada .......... sí
- Datos no inventados .................. sí
- Tratamiento de supresión definido .... sí (patrón `.`/ausente → null; 0 supresiones en muestra)
- Payload p95 municipal ≤ 25 KB ........ sí en muestra: 6.973 B (9 municipios)
- Prueba de 4 municipios ............... sí (02003, 07010, 02069, 28143)
- Municipio pequeño/grande ............. sí (28143 pequeño; 28079/08019 grandes)
- Al menos 5 CCAA ...................... sí (CLM, Baleares, Madrid, Andalucía, Aragón)
```

Nota: el preflight de esta ejecución valida la muestra; el **dataset nacional
completo** (8.132 objetos) y la relectura sha256 quedan pendientes de ejecutar
antes de la carga real.

**Decisión de carga de esta ejecución: no se escribe R2.** El entorno de trabajo
no dispone de credenciales R2 (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/
`R2_SECRET_ACCESS_KEY`/`R2_BUCKET` ausentes), y `69767` aún tiene pendiente la
medición de supresión/p95 y las pruebas exigidas. Conforme a la autorización, no
se finge una carga. El contrato, el lector, el preflight y el cargador quedan
implementados y **bloqueados**: el cargador exige un artefacto de preflight con
`match ≥ 99,5 %` y `p95 ≤ 25 KB` además de `--confirm-r2-write`, y aborta si no
existe.

## 5. Plan de continuación

1. Ejecutar preflight nacional completo de `69767` (supresión, coherencia
   aritmética total/interior/exterior, p95 municipal y pruebas de 4 municipios,
   municipio pequeño, grande y ≥5 CCAA).
2. Cargar `69767` en `socideas/ine-layers/v1/` con runId inmutable cuando el
   preflight pase y existan credenciales R2.
3. Descartar `33578` como capa municipal nacional (solo 87 municipios).
4. Resolver el endpoint de descarga municipal del sistema jaxi para 55249 y
   52071/52076/52081/52082 (Censo 2021 y Censo Agrario 2020) antes de evaluarlas.
5. Activar los bloques de Movilidad y Educación en la ficha solo cuando haya
   datos cargados y validados.

## 6. Garantías de esta auditoría

Cero escrituras R2. Cero escrituras Supabase. Cero migraciones. Cero cambios de
XLSX. Cero cambios de mapas/coropletas. Cero datos inventados. Cero
conversiones de secreto en 0.
