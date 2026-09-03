# SOCideas — Arquitectura de datos (Fase 2A)

## 1. Principio territorial

`public.municipios` (8.132 filas) es la única fuente territorial. Todo lo
demás cuelga de `municipios.codigo_ine` (`character(5)`, UNIQUE): la columna
`municipal_indicator_values.municipio_codigo_ine` replica ese tipo exacto y
declara FOREIGN KEY real. No hay tabla paralela de municipios, provincias ni
geometrías.

## 2. Tablas nuevas (migración `027_socideas_core.sql`)

| Tabla | Finalidad |
|---|---|
| `statistical_sources` | Catálogo de fuentes (INE Tempus3 en 2A; AEAT/SEPE/autonómicas en 2B) |
| `indicator_definitions` | Ficha metodológica por indicador (unidad, periodicidad, visualización) |
| `municipal_indicator_values` | Hechos: municipio × indicador × año × dimensiones + trazabilidad |
| `data_sync_runs` | Auditoría de cada sincronización (estado, conteos, errores) |

`dimensiones` (`jsonb`) permite `sexo`, `tramo_edad`, `ambito`
(`municipio`/`provincia`/`ccaa`/`espana`) y `nombre` del ámbito sin cambiar el
esquema. La unicidad lógica
`(municipio, indicador, año/fecha, fuente, dimensiones)` se impone con índice
único; la sincronización reescribe por indicador (borrado + inserción), de modo
que repetir un sync es idempotente.

## 3. Indicadores de Fase 2A (catálogo `028_socideas_catalog_seed.sql`)

`population_total|_male|_female` (último año DPOP), `population_evolution`
(serie 1996→), `population_age_sex` (grupos quinquenales, año disponible),
`population_density` (definido, **pendiente** de superficie),
`population_change_5y|_10y` (derivados persistidos). Envejecimiento y
dependencia se calculan al leer (no se persisten para no duplicar).

## 4. Flujo de actualización

Usuario → `/socideas/[codigoINE]` → `GET /api/socideas/perfil` (lee Supabase
vía servidor). Si no hay valores: estado "Preparando datos oficiales". La
sincronización es manual y autorizada: `POST /api/socideas/sync/[codigoINE]`
(con token) → adaptador Tempus3 → validación (código INE, año, unidad
Personas, H+M=Total) → `replaceValues` → run registrado. Un municipio por
petición; bloqueo de concurrentes por municipio (30 min); timeout 15 s +
1 reintento por llamada. Nunca se llama al INE desde el navegador ni en cada
visita.

## 5. Caché y actualización

Supabase es la caché: los valores llevan `obtenido_en` y `anio_referencia`.
La ficha re-sincroniza automáticamente en servidor si la última ejecución
supera `STALE_DAYS` (7 días) y el municipio ya estaba sincronizado; el lock
de `data_sync_runs` evita ejecuciones concurrentes y, si el refresco falla,
se sirve la caché. Los metadatos de la página no disparan refrescos (solo el
cuerpo), para no duplicar sincronizaciones. La ficha muestra siempre año y
fuente por bloque; años distintos no se presentan como contemporáneos.

## 6. Limitaciones de cobertura (verificadas)

- Pirámide: Padrón Continuo termina en 2022 (último año disponible).
- Densidad: sin superficie municipal validada → pendiente.
- Extranjería/migraciones: ECP no desagrega a municipio; Tempus3 municipal
  (tablas 33571/33572) sin verificar → pendientes, no ficticios.
- Comparativas: provincia (misma tabla DPOP), CCAA y España (tabla 2853;
  CCAA mapeadas: Andalucía, Aragón, Galicia, CLM; resto → parcial con aviso).
- Provincias mapeadas a DPOP: 02, 15, 41, 50. Otras → error explícito 422
  equivalente ("provincia no mapeada"), nunca tabla inventada.
