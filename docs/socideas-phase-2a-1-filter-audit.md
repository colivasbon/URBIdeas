# Auditoría Fase 2A.1 — Filtros de usuario (años, período, desglose)

Fecha: 2026-09-03 · Rama: `feat/socideas-phase-2a-1` (base: `feat/socideas-phase-2a`
`3d71a5f`) · Sin commit/push.

## 1. Filtros actuales: ninguno

La ficha (`src/app/socideas/[codigoINE]/page.tsx`, server) prioriza el último
año guardado sin controles: `pickLatest` para tarjetas, serie completa para
evolución, último año de edad para pirámide, 4 ámbitos fijos en comparativas,
derivados sobre el último año. No hay query params ni estado de usuario.

## 2. Años almacenados por indicador (verificado en Supabase, 4 municipios)

| Indicador | Años | Notas |
|---|---|---|
| `population_total` ámbito municipio | {2025} | Solo último año (sync guarda 1 fila) |
| `population_male` / `_female` | {2025} | Solo último año |
| `population_evolution` | 2014–2025 (12) | `EVOLUTION_NULT=12` recorta la historia (DPOP llega a 1996) |
| `population_total` ámbito provincia | 2014–2025 (12) | Serie agregada de la misma tabla DPOP |
| `population_total` ámbito ccaa / espana | **2010–2021** (12) | La tabla 2853 va con retraso: último año 2021, NO 2025 |
| `population_age_sex` | {2022} | `nult=1`: solo el último año (Padrón Continuo 2003–2022 existe) |
| `population_change_5y/10y` | {2025} | Persistidos del último año |
| `population_density` | — | Sin filas (pendiente) |

Consecuencia crítica: los ámbitos NO son contemporáneos (municipio/provincia
2025 vs ccaa/espana 2021). La tabla comparada actual los alinea por año sin
advertirlo. En 2A.1 cada ámbito declara su rango y la UI avisa.

## 3. Dimensiones guardadas

`ambito` (municipio/provincia/ccaa/espana) + `nombre` del ámbito;
`sexo` (hombres/mujeres) en `_male/_female` y `age_sex`;
`tramo_edad` (21 grupos) en `age_sex`; `base` (año base) en derivados.
Suficiente para todos los filtros sin cambiar el esquema.

## 4. Años disponibles sin descargas extra

La API calculará `disponibles` agregando filas ya leídas (una sola lectura
por ficha): años por indicador, años de pirámide, rangos por ámbito. Sin
consultas adicionales ni llamadas al INE desde el navegador (el navegador
solo habla con `/api/socideas/*`).

## 5. Cambios previstos

- `src/lib/socideas-perfil.ts`: `opts { desde, hasta, ambitos, indicadores }`;
  filtra valores/series; `disponibles` en la respuesta; derivados sobre el
  período seleccionado (variaciones vs año seleccionado/último del rango;
  envejecimiento/dependencia del año de pirámide elegido).
- `GET /api/socideas/perfil/[codigoINE]`: params `desde, hasta, ambitos
  (csv), indicadores (csv)` validados; inválidos → se ignoran (defaults).
  Sin escritura; lectura Supabase como hoy.
- `src/app/socideas/[codigoINE]/page.tsx`: server carga inicial (defaults) +
  nuevo cliente `FichaFiltros` con 6 bloques, selects/checkboxes, URL
  (`?anio,sexo,evo_desde,evo_hasta,comparar,pir_anio,pir_modo`), botón
  Restablecer, estados vacíos y trazabilidad dinámica.
- `src/lib/socideas-sync.ts` + `ine-tempus.ts`: historia completa (sin
  `nult=12`; sin años fijos), pirámide multianual (sin `nult=1`), min/max por
  indicador en `data_sync_runs.metadata`. Sin IDs de serie hardcodeados
  (resolución dinámica ya existente). Sin migración: los índices actuales
  cubren (municipio, indicador, año).
- Sevilla 2026: **no existe en Tempus3** (DPOP 2025 definitivo es lo último;
  ver §7). No se sincroniza nada nuevo; no se inventa el dato.

## 6. Riesgos de rendimiento

Historia completa DPOP: ~30 años × 3 series (municipio+provincia) + 2853
(~16 años × 6 series) + edad (~20 años × 69 series ≈ 1.400 puntos). Todo con
filtros `tv=` por municipio: respuestas de cientos de KB, 4–6 peticiones por
sync manual (protegido con token, 1 municipio). La ficha lee de Supabase
(índices existentes); el auto-refresh (7 días) reutiliza el lock. La UI
re-consulta la API al filtrar (lecturas ligeras, sin INE).

## 8. Incidencia detectada durante la implementación

Al pasar `URLSearchParams` como prop del Server Component al Client
Component, el stream de Flight se rompía (objeto no serializable) y todas
las fichas cortaban la conexión. Solución: objeto plano
`Record<string,string>` + `new URLSearchParams()` en cliente. Regla: solo
planos/primitivas a Client Components.

## 7. Sevilla 2026 (verificación en vivo 2026-09-03)

`DATOS_TABLA/2895?nult=1` (tabla Sevilla DPOP): último dato **2025-01-01
definitivo** en todas las series (provincia 1.976.624; ciudad pendiente de
extraer serie 41091, mismo año). **No hay 2026 en la API Tempus3.** Si la web
del INE muestra cifras posteriores, corresponden a avances/estimaciones de
otras operaciones, no a DPOP definitivo vía API. Se documenta sin forzar el
dato; el selector nunca ofrecerá años sin filas.
