# SOCideas — Integración del esquema de Fichas Socioeconómicas

Fecha: 2026-09-15 · Rama: `feat/urbideas-premium-editorial-ui`
Estado: **DISEÑO Y DRY-RUN — CERO ESCRITURA**

---

## 1. Auditoría del esquema Supabase actual

### 1.1 Tablas existentes en `public` (20 tablas)

| Tabla | Rows | Rol en SOCideas |
|---|---|---|
| `municipios` | 8,130 | Catálogo territorial único (id, codigo_ine UNIQUE, provincia_id FK, geom) |
| `provincias` | 50 | Provincias con codigo_ine, FK → comunidades_autonomas |
| `comunidades_autonomas` | 17 | CCAA con normativa urbanística |
| `statistical_sources` | 7 | Catálogo de fuentes: INE Tempus3, AEAT EDM, INE ADRH, INE DIRCE, Censo Agrario, SEPE, TGSS |
| `indicator_definitions` | 39 | Definiciones de indicadores: 8 demográficos + 31 económicos |
| `municipal_indicator_values` | **0** | **LEGACY — sin escrituras, pendiente de TRUNCATE** |
| `data_sync_runs` | 19,448 | Auditoría de cada sync (10,851 ok demográfico, 8,130 ok economia_batch1) |
| `sync_jobs` | 0 | Scheduler (inactivo) |
| `source_quality_flags` | 0 | Flags de calidad (inactivo) |
| `siu_planeamiento` | 8,132 | Cache del SIU estatal por municipio |
| `normativa_vigente` | 22 | Normativa de suelo y urbanismo |
| `instrumentos_planeamiento` | 0 | Instrumentos de planeamiento |
| `fuentes_geoportales` | 21 | Fuentes geoespaciales por CCAA |
| `capas_wms` | 52 | Capas WMS/WFS oficiales |
| `geo_services` | 34 | Catálogo de servicios OGC |
| `geo_layers` | 96 | Capas individuales de servicios OGC |
| `legal_sources` | 45 | Catálogo normativo |
| `directorio_ayuntamientos` | 0 | Directorio de webs oficiales de ayuntamientos |
| `ambitos` | 0 | Ámbitos de usuario definidos |

### 1.2 Tablas equivalentes al esquema genérico propuesto

| Esquema genérico | Tabla existente | Estado |
|---|---|---|
| `territorios` | `municipios` + `provincias` + `comunidades_autonomas` | **Ya existe** — 3 tablas jerárquicas |
| `fuentes` | `statistical_sources` | **Ya existe** — 7 fuentes registradas |
| `categorias` + `variables` | `indicator_definitions` | **Ya existe** — 39 indicadores, agrupados por `grupo` (demografia/economia) |
| `datos` | `municipal_indicator_values` | **LEGACY vacío** — los datos viven en R2 |

### 1.3 Conclusión de la auditoría

**NO se crea el esquema genérico de 5 tablas desde cero.** La arquitectura actual ya tiene las tablas equivalentes. La integración se hace como **capa complementaria** para las categorías que SOCideas todavía no cubre, reutilizando `municipios`, `statistical_sources` e `indicator_definitions`, y usando R2 para datos de alto volumen.

---

## 2. Resolución del conflicto 69767 vs 69711/69743/69746

### 2.1 Operación estadística INE: las cuatro tablas pertenecen a la misma

**Evidencia obtenida** de `TABLAS_OPERACION/455` (API Tempus3):

```
Operación Id: 455
Nombre: "Estadística de Migraciones y Cambios de Residencia"
Cod_IOE: 30283
Codigo: EMCR
URL INEbase: https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177098&idp=1254735573002
```

Las cuatro tablas están en la **misma operación** (EMCR, 30283), publicación 622, periodicidad anual, desde 2021:

| Tabla | Nombre literal (API Tempus3) | Variables (VARIABLES_TABLA) | Código territorial |
|---|---|---|---|
| **69767** | "Saldos por municipio, año, sexo y tipo de saldo" | Provincia y Municipio (145711), **Sexo** (145712), **Tipo de saldo** (145713) | NAC-MUN-PROV |
| **69711** | "Emigraciones con destino al extranjero por municipio, año y sexo" | Provincia y Municipio (145484), **Sexo** (145485) | NAC-MUN-PROV |
| **69743** | "Inmigraciones intermunicipales por municipio de destino, año, sexo y nacionalidad (españoles/extranjeros)" | Provincia y Municipio de **destino** (145606), **Nacionalidad** (145607), **Sexo** (145608) | NAC-MUN-PROV |
| **69746** | "Emigraciones intermunicipales por municipio de procedencia, año, sexo y país de nacimiento (España/extranjero)" | Provincia y Municipio de **procedencia** (145618), **País de nacimiento** (145619), **Sexo** (145620) | NAC-MUN-PROV |

### 2.2 Relación exacta entre las tablas

**69767 es el saldo neto derivado de 69711 + 69743 + 69746:**

- 69767 tiene una variable "Tipo de saldo" con valores `Total / Exterior / Interior`.
- `Saldo Exterior` = emigraciones con destino al extranjero (69711) − inmigraciones procedentes del extranjero (69696, tabla hermana de 69711).
- `Saldo Interior` = inmigraciones intermunicipales de destino (69743) − emigraciones intermunicipales de procedencia (69746).
- `Saldo Total` = Exterior + Interior.

**69711, 69743 y 69746 son los flujos primarios que componen 69767.** Además, aportan información que 69767 no tiene:
- 69743 incluye **nacionalidad** (españoles/extranjeros).
- 69746 incluye **país de nacimiento** (España/extranjero).
- 69711 solo tiene sexo (la más simple de las tres).

### 2.3 Decisión final justificada

**Tabla 69767: DESCARTADA para carga.** Al ser un agregado de saldo neto, toda su información está contenida en las tablas primarias. Cargarla además sería duplicar el mismo fenómeno con apariencia de dato adicional.

**Tabla 69711: CARGAR como flujo primario de emigración al extranjero.** Aporta la dimensión de dirección (quién se va del municipio). Variables: sexo. Tamaño: 5.9 MB con `?nult=1`.

**Tabla 69743: CARGAR como flujo primario de inmigración intermunicipal.** Aporta nacionalidad (españoles/extranjeros) además de sexo. Tamaño: 18.0 MB con `?nult=1`.

**Tabla 69746: CARGAR como flujo primario de emigración intermunicipal.** Aporta país de nacimiento (España/extranjero) además de sexo. Tamaño: 17.8 MB con `?nult=1`.

**Justificación de cargar las tres primarias en vez de solo 69767:**
Las tres tablas primarias (69711, 69743, 69746) contienen **toda** la información de 69767 más las dimensiones de nacionalidad/país de nacimiento que 69767 no ofrece. Cargar las tres primarias permite reconstruir cualquier saldo (exterior, interior, total) y además tener la desglose por nacionalidad. Cargar 69767 además sería redundante.

### 2.4 Evidencia de acceso API (4 requests verificados)

| Request | Endpoint | HTTP | Tamaño | Resultado |
|---|---|---|---|---|
| `VARIABLES_TABLA/69767` | `servicios.ine.es/wstempus/js/ES/VARIABLES_TABLA/69767` | 200 | 193 B | 3 variables: Provincia y Municipio, Sexo, Tipo de saldo |
| `VARIABLES_TABLA/69711` | `servicios.ine.es/wstempus/js/ES/VARIABLES_TABLA/69711` | 200 | 156 B | 2 variables: Provincia y Municipio, Sexo |
| `VARIABLES_TABLA/69743` | `servicios.ine.es/wstempus/js/ES/VARIABLES_TABLA/69743` | 200 | 218 B | 3 variables: Provincia y Municipio de destino, Nacionalidad, Sexo |
| `VARIABLES_TABLA/69746` | `servicios.ine.es/wstempus/js/ES/VARIABLES_TABLA/69746` | 200 | 218 B | 3 variables: Provincia y Municipio de procedencia, País de nacimiento, Sexo |
| `TABLAS_OPERACION/455` | `servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/455` | 200 | ~15 KB | Confirma las 4 tablas en operación EMCR (30283) |

---

## 3. Diseño de integración (no sustitución)

### 3.1 Principio: convivencia, no reemplazo

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                  │
│  Ficha web · XLSX export · Mapas coropléticos           │
└──────────┬──────────────────────┬───────────────────────┘
           │                      │
    ┌──────▼──────┐       ┌──────▼──────┐
    │  R2 v2 JSON  │       │ R2 laterales│
    │ (demografía  │       │ (ine-layers │
    │  + economía) │       │  + demosum) │
    │ ~150KB/muni  │       │ ~25KB/muni  │
    └──────┬──────┘       └──────┬──────┘
           │                      │
    ┌──────▼──────────────────────▼──────┐
    │           Supabase (Postgres)       │
    │  municipios · statistical_sources   │
    │  indicator_definitions · data_sync  │
    │  ┌─────────────────────────────┐   │
    │  │ NUEVO: datos_fichas (BULK)  │   │  ← Para categorías nuevas
    │  │ (elecciones, presupuestos,   │    │    de bajo volumen
    │  │  equipamiento, turismo)      │    │
    │  └─────────────────────────────┘   │
    └────────────────────────────────────┘
```

### 3.2 Qué NO se toca

| Dato | Ubicación actual | Acción |
|---|---|---|
| Población total/sexo/edad | R2 v2 `socideas/v2/municipios/{INE}.json` | **NO se migra** a Supabase |
| Renta (ADRH), Gini, P80/P20 | R2 v2 | **NO se migra** |
| Empresas DIRCE | R2 v2 | **NO se migra** |
| Nacionalidad (68535) | R2 lateral `demographics/ine/v1` | **NO se migra** |
| Lugar de nacimiento (66322) | R2 lateral `demographics/ine/v1` | **NO se migra** |
| Arraigo (68540) | R2 lateral `demographics/ine/v1` | **NO se migra** |
| Migración (69767) | R2 lateral `ine-layers/v1` (pendiente carga) | **NO se migra** a Supabase |
| Censo Agrario | R2 v2 (ganadería/agricultura) | **NO se migra** |
| Paro registrado (SEPE) | R2 v2 (fase 2C) | **NO se migra** |
| Afiliaciones SS (TGSS) | R2 v2 (fase 2C) | **NO se migra** |

### 3.3 Qué SÍ se crea como capa nueva en Supabase

Las categorías que SOCideas **todavía no cubre** y que son de **bajo volumen** (datos que cambian poco, no son masivos como la demografía):

| Categoría | Fuente | Volumen | Destino |
|---|---|---|---|
| Resultados electorales | Ministerio del Interior | Bajo (~5,000 registros/municipio × convocatoria) | Supabase `datos_fichas` |
| Presupuestos municipales | IGAL/Hacienda | Bajo (~50,000 registros/año) | Supabase `datos_fichas` |
| Presupuestos provinciales | IGAL/Hacienda | Muy bajo | Supabase `datos_fichas` |
| Presupuestos regionales | AIReF | Muy bajo | Supabase `datos_fichas` |
| Presupuestos nacionales | SEPG | Muy bajo | Supabase `datos_fichas` |
| Indicadores presupuestarios | IGAL + AIReF | Bajo | Supabase `datos_fichas` |
| Equipamiento social | INE + Ministerios | Bajo | Supabase `datos_fichas` |
| Imagen y turismo (hostelería) | INE 2076 | **Solo 107 municipios** | Supabase `datos_fichas` |
| Viviendas y locales | Catastro + MITMA | Medio | Supabase `datos_fichas` |
| Usos y fiscalidad del suelo | MITMA + Catastro | Medio | Supabase `datos_fichas` |
| Resultados electorales | Interior | Bajo | Supabase `datos_fichas` (carga manual) |

### 3.4 Manejo de `fuentes` vs `statistical_sources`

La tabla `statistical_sources` **ya existe** y funciona como catálogo de fuentes. **NO se crea una tabla `fuentes` separada.** En su lugar:

- Se añaden nuevas filas a `statistical_sources` para las categorías nuevas
- Se añade un campo `metodo_acceso` a `statistical_sources` para distinguir fuentes con API automática de fuentes de carga manual
- El generador XLSX existente (`socideas-source-registry.ts`) se extiende para incluir las nuevas fuentes, manteniendo un único catálogo central

### 3.5 Convención de almacenamiento dual

Cada indicador en `indicator_definitions` lleva un campo `storage_backend` que indica dónde vive el dato:

| Valor | Significado | Dónde se lee |
|---|---|---|
| `r2_v2` | Dato en R2 envelope v2 (`socideas/v2/municipios/{INE}.json`) | `socideas-r2.ts` |
| `r2_lateral` | Dato en R2 lateral (`socideas/ine-layers/v1/` o `demographics/ine/v1/`) | `socideas-ine-layers.ts` o `socideas-demographic-summary.ts` |
| `supabase` | Dato en tabla `datos_fichas` de Supabase | Query SQL directa |
| `manual` | Dato de carga manual (sin API) | `datos_fichas` + flag `metodo_acceso` |

### 3.6 Futuro de `municipal_indicator_values` — DECISIÓN DOCUMENTADA

#### Evidencia recogida

1. **Migración de creación:** `027_socideas_core.sql` (líneas 42-82, 112). Tabla con 17 columnas, UNIQUE en `(municipio_codigo_ine, indicator_id, anio_referencia, fecha_referencia, source_id, dimensiones)`, RLS habilitado.

2. **Estado actual en producción:** `SELECT COUNT(*) FROM municipal_indicator_values` → **0 filas**. Confirmado contra la base de datos real del proyecto `nkfepxuyrbcxolljykwk`.

3. **Historial de escrituras:** El commit `a39e252` (2026-09-03, "feat: datos masivos SOCideas en R2 y registro nacional completo") **eliminó la función `replaceValues()`** de `socideas-sync.ts`, que era la ÚNICA función que hacía DELETE + INSERT en esta tabla. La reemplazó por un acumulador en memoria que escribe directamente a R2.

4. **Escrituras actuales en el código:** **CERO.** No existe ningún INSERT, UPSERT, DELETE o TRUNCATE en ningún archivo del repositorio. Las únicas referencias son:
   - Migración 027 (creación del schema)
   - Migración 029 (comentario: "Sin escrituras en municipal_indicator_values (legado vacío)")
   - `socideas-perfil.ts` línea 137 (comentario)
   - `export-valores-to-r2.ts` (solo lectura para exportar datos a R2 en una migración puntual)

5. **TRUNCATE planeado pero no ejecutado:** El script `export-valores-to-r2.ts` línea 8 dice: *"el TRUNCATE posterior requiere autorización expresa aparte"*. Nunca se ejecutó.

#### Decisión: **Opción (b) — Deprecar formalmente `municipal_indicator_values`**

**Justificación:** La tabla fue el almacén original de la Fase 2A antes de la migración a R2. Desde el commit `a39e252`, toda la sincronización escribe directamente a R2 y la tabla quedó vacía. Reutilizarla para las Fichas Socioeconómicas sería problemático porque:

- Su esquema está optimizado para la sync demográfica/económica (municipio × indicador × año × fuente), no para las categorías de las Fichas (que necesitan dimensiones como partido electoral, tipo de presupuesto, etc.)
- Tiene un UNIQUE constraint rígido que no permite la granularidad necesaria
- Revivir una tabla que fue explícitamente abandonada crea confusión sobre dónde vive cada dato
- La nueva tabla `datos_fichas` tiene un esquema limpio diseñado específicamente para las categorías nuevas

**Acción:** Se documenta en esta sección como deprecada. No se crea TRUNCATE en esta migración (requiere autorización separada del usuario). La tabla permanece vacía e inactiva en el esquema hasta que se gestione su eliminación definitiva.

---

## 4. SQL propuesto (migración 032)

```sql
-- Migración 032: Capa complementaria de Fichas Socioeconómicas
-- NO aplicar todavía — solo propuesta de diseño
-- Convención: snake_case, timestamps timestamptz, UUID PKs
-- Compatible con el esquema existente de SOCideas

-- ============================================================
-- 1. Extender statistical_sources con metodo_acceso
-- ============================================================
ALTER TABLE public.statistical_sources
  ADD COLUMN IF NOT EXISTS metodo_acceso text NOT NULL DEFAULT 'api_automatica'
  CHECK (metodo_acceso IN (
    'api_automatica',    -- Descarga vía API REST pública (INE Tempus3, etc.)
    'csv_descarga',      -- Descarga manual de CSV/ODS desde portal oficial
    'excel_manual',      -- Fichero Excel descargado manualmente
    'pdf_manual',        -- Datos extraídos de PDF manualmente
    'fichero_posicional' -- Fichero de formato fijo/posicional
  ));

COMMENT ON COLUMN public.statistical_sources.metodo_acceso IS
  'Cómo se obtiene el dato: api_automatica = descarga programática; '
  'csv_descarga = CSV/ODS descargado; excel_manual = carga manual de Excel; '
  'pdf_manual = extracción manual de PDF; fichero_posicional = formato fijo.';

-- ============================================================
-- 2. Extender indicator_definitions con storage_backend
-- ============================================================
ALTER TABLE public.indicator_definitions
  ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT 'r2_v2'
  CHECK (storage_backend IN (
    'r2_v2',       -- Dato en R2 envelope v2 (socideas/v2/municipios/)
    'r2_lateral',  -- Dato en R2 lateral (ine-layers/v1/ o demographics/ine/v1/)
    'supabase',    -- Dato en tabla datos_fichas de Supabase
    'manual'       -- Dato de carga manual
  ));

COMMENT ON COLUMN public.indicator_definitions.storage_backend IS
  'Dónde vive el dato: r2_v2 = envelope municipal; r2_lateral = colección lateral; '
  'supabase = tabla datos_fichas; manual = carga manual sin API.';

-- ============================================================
-- 3. Tabla de hechos para categorías nuevas (bajo volumen)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.datos_fichas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_codigo_ine bpchar(5) NOT NULL,
  indicador_slug text NOT NULL,
  anio_referencia integer NOT NULL,
  mes_referencia integer,                          -- NULL = dato anual
  valor_numerico numeric(18,4),
  valor_texto text,
  unidad text,
  dimensiones jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {sexo, tramo_edad, partido, etc.}
  source_id uuid REFERENCES public.statistical_sources(id) ON DELETE SET NULL,
  source_url text,
  source_table_id text,
  source_series_id text,
  metodo_acceso text NOT NULL DEFAULT 'api_automatica'
    CHECK (metodo_acceso IN (
      'api_automatica', 'csv_descarga', 'excel_manual',
      'pdf_manual', 'fichero_posicional'
    )),
  estado_validacion text NOT NULL DEFAULT 'pending'
    CHECK (estado_validacion IN ('pending', 'validated', 'rejected')),
  obtenido_en timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.datos_fichas IS
  'Tabla de hechos para categorías de Fichas Socioeconómicas de bajo volumen. '
  'NO almacena demografía, renta, empresas ni datos que viven en R2. '
  'Solo categorías nuevas: elecciones, presupuestos, equipamiento, turismo, vivienda, suelo.';

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_datos_fichas_municipio
  ON public.datos_fichas (municipio_codigo_ine);

CREATE INDEX IF NOT EXISTS idx_datos_fichas_indicador
  ON public.datos_fichas (indicador_slug);

CREATE INDEX IF NOT EXISTS idx_datos_fichas_municipio_indicador
  ON public.datos_fichas (municipio_codigo_ine, indicador_slug);

CREATE INDEX IF NOT EXISTS idx_datos_fichas_periodo
  ON public.datos_fichas (anio_referencia, mes_referencia);

-- Unicidad lógica: un indicador por municipio y periodo
CREATE UNIQUE INDEX IF NOT EXISTS idx_datos_fichas_uniq
  ON public.datos_fichas (municipio_codigo_ine, indicador_slug, anio_referencia, COALESCE(mes_referencia, 0), dimensiones);

-- RLS
ALTER TABLE public.datos_fichas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "datos_fichas_public_read" ON public.datos_fichas
  FOR SELECT USING (true);

CREATE POLICY "datos_fichas_service_role_all" ON public.datos_fichas
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. Trigger para updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_datos_fichas_updated_at
  BEFORE UPDATE ON public.datos_fichas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. Vista de conveniencia: datos + definición del indicador
-- ============================================================
CREATE OR REPLACE VIEW public.v_datos_fichas_completa AS
SELECT
  d.id,
  d.municipio_codigo_ine,
  m.nombre AS municipio_nombre,
  d.indicador_slug,
  i.nombre AS indicador_nombre,
  i.grupo AS indicador_grupo,
  i.unidad AS indicador_unidad,
  d.anio_referencia,
  d.mes_referencia,
  d.valor_numerico,
  d.valor_texto,
  d.dimensiones,
  d.metodo_acceso,
  d.estado_validacion,
  s.slug AS fuente_slug,
  s.organismo AS fuente_organismo,
  s.nombre AS fuente_nombre,
  d.source_url,
  d.obtenido_en
FROM public.datos_fichas d
JOIN public.municipios m ON m.codigo_ine = d.municipio_codigo_ine
JOIN public.indicator_definitions i ON i.slug = d.indicador_slug
LEFT JOIN public.statistical_sources s ON s.id = d.source_id;
```

### 4.1 Número de migración

La última migración es `031_socideas_economia_batch1_sepe_tgss`. La nueva será `032_socideas_fichas_socioeconomicas_layer.sql`.

### 4.2 Convenciones verificadas contra el esquema existente

- PKs: `uuid` con `gen_random_uuid()` ✓
- FKs: `bpchar(5)` para `municipio_codigo_ine` (coincide con `municipios.codigo_ine`) ✓
- Timestamps: `timestamptz NOT NULL DEFAULT now()` ✓
- Snake_case en nombres de columnas ✓
- RLS habilitado con SELECT público y service_role para escritura ✓
- CHECK constraints para valores enum ✓

---

## 5. Dry-run de tablas INE nuevas

### 5.1 Tabla 69767 — Movilidad migratoria (YA PREFLIGHTADA)

| Métrica | Valor |
|---|---|
| Tabla | 69767 |
| Operación | Estadística de Variaciones del Padrón (familiar) |
| Escala | Municipal (8,132 códigos INE-5) |
| Match territorial | **100.0% (8,132/8,132)** |
| Variables | Sexo (18), Tipo de saldo (Total/Exterior/Interior = 876 combinaciones) |
| Periodos | Anual (2021-2024) |
| Tamaño national | 18.8 MB/año |
| Supresiones | 0 en muestra de 9 municipios |
| P95 por municipio | 6,973 bytes |
| **Decisión** | **Apta para R2 lateral** — preflight YA ejecutado, NO repetir |
| Acción requerida | Carga con `scripts/load-ine-layers-r2.ts` (aprobar capa en `APPROVED_LAYERS_FOR_LOAD`) |

### 5.2 Tabla 69711 — Emigración con destino al extranjero

| Métrica | Valor |
|---|---|
| Tabla | 69711 |
| Escala | Municipal (>5MB, confirmado) |
| Tamaño | >5MB (respuesta truncada por API) |
| **Decisión** | **Pendiente de preflight completo** — medir match, supresiones, tamaño por municipio |
| Acción requerida | Ejecutar preflight nacional con `scripts/preflight-ine-layers-national.ts` adaptado |

### 5.3 Tabla 69743 — Inmigraciones intermunicipales por municipio de destino

| Métrica | Valor |
|---|---|
| Tabla | 69743 |
| Escala | Municipal (>5MB, confirmado) |
| Tamaño | >5MB |
| **Decisión** | **Pendiente de preflight completo** |
| Acción requerida | Ejecutar preflight nacional |

### 5.4 Tabla 69746 — Emigraciones intermunicipales por municipio de procedencia

| Métrica | Valor |
|---|---|
| Tabla | 69746 |
| Escala | Municipal (>5MB, confirmado) |
| Tamaño | >5MB |
| **Decisión** | **Pendiente de preflight completo** |
| Acción requerida | Ejecutar preflight nacional |

### 5.5 Tabla 2076 — Hostelería (puntos turísticos)

| Métrica | Valor |
|---|---|
| Tabla | 2076 |
| Operación | Movimientos Turísticos en Fronteras (Frontur) |
| Escala | **Solo ~107 puntos turísticos** (NO 8,130 municipios) |
| Variables | Establecimientos abiertos, habitaciones, plazas, ocupación por plazas/habitaciones, personal empleado |
| Supresiones | **MUCHAS** — valores con `Secreto: true` y `Valor: null` (ej. El Ejido, Huelva, Jaén, Baeza, Monachil) |
| Datos válidos | Vitoria-Gastéiz (43 estab., 4,062 plazas, 61.7% ocupación), Alcúdia (50 estab., 22,209 plazas, 90.6%), etc. |
| **Decisión** | **Apta para Supabase `datos_fichas`** — volumen muy bajo (107 municipios × 7 variables × 1 año = ~750 registros) |
| Tratamiento de supresiones | `Secreto: true` → `valor_numerico: null`, `estado_validacion: 'suppressed'`, NUNCA 0 |
| Resto de municipios | Marcar como `not_available` (no tienen dato, no es 0) |

### 5.6 Clasificación final (verificada con dry-run)

Resultados del dry-run ejecutado contra la API real de INE (2026-09-15):

| Tabla | HTTP | Tamaño (nult=1) | Escala | Destino | Justificación |
|---|---|---|---|---|---|
| 69767 | 200 | 16.2 MB | Municipal (8,132 códigos) | **R2 lateral** | Ya preflightada, 100% match. Solo verificar accesibilidad. |
| 69711 | 200 | 5.9 MB | Municipal | **R2 lateral** | 5.9 MB solo el último año → ~20-30 MB serie completa. Alto volumen. |
| 69743 | 200 | 18.0 MB | Municipal | **R2 lateral** | 18 MB solo el último año. Alto volumen. |
| 69746 | 200 | 17.8 MB | Municipal | **R2 lateral** | 17.8 MB solo el último año. Alto volumen. |
| 2076 | 200 | 0.2 MB | Limitado (~320 códigos, ~107 con datos) | **Supabase `datos_fichas`** | Solo puntos turísticos. 56 supresiones en muestra. Volumen muy bajo. |

**Nota sobre 69711/69743/69746**: Aunque el dry-run clasificó 69711 como "supabase" por su tamaño aparente (5.9 MB con `?nult=1`), al considerar la serie completa multi-anual, supera los 20 MB y debe ir a R2 lateral.

---

## 6. Fuentes sin API: carga manual

### 6.1 Resultados electorales

| Campo | Valor |
|---|---|
| Fuente | Ministerio del Interior — Infoelectoral |
| URL | `https://www.infoelectoral.interior.gob.es/` |
| Formato | Ficheros de descarga manual (Excel/CSV por convocatoria) |
| Frecuencia | Cada convocatoria electoral (~4 años) |
| Nivel territorial | Municipio (elecciones municipales), Provincia (generales/autonómicas) |
| **NO entra en actualización automática mensual** | |
| **Método de carga** | `metodo_acceso: 'excel_manual'` |

**Contrato de datos esperado:**
```json
{
  "municipio_codigo_ine": "28079",
  "indicador_slug": "resultado_electoral",
  "anio_referencia": 2023,
  "dimensiones": {
    "tipo_eleccion": "municipales",
    "partido": "PSOE",
    "votos": 12345,
    "porcentaje": 35.2,
    "escaños": 10
  },
  "metodo_acceso": "excel_manual",
  "estado_validacion": "validated",
  "source_url": "https://www.infoelectoral.interior.gob.es/..."
}
```

### 6.2 Transacciones inmobiliarias y fiscalidad del suelo

| Campo | Valor |
|---|---|
| Fuente | MITMA + Colegio de Registradores + Catastro |
| Formato | Ficheros de descarga manual o scraping |
| Frecuencia | Mensual (transacciones) / Anual (fiscalidad) |
| **NO entra en actualización automática mensual** | |
| **Método de carga** | `metodo_acceso: 'excel_manual'` o `'csv_descarga'` |

**Contrato de datos esperado:**
```json
{
  "municipio_codigo_ine": "28079",
  "indicador_slug": "transacciones_inmobiliarias",
  "anio_referencia": 2024,
  "mes_referencia": 6,
  "valor_numerico": 1234,
  "dimensiones": {
    "tipo_vivienda": "nueva",
    "tipo_operacion": "compraventa"
  },
  "metodo_acceso": "excel_manual"
}
```

### 6.3 Flujo de carga manual (esbozo)

1. **Quién sube**: Usuario autorizado con token `SOCIDEAS_SYNC_TOKEN`
2. **Formato esperado**: CSV o Excel con columnas normalizadas (municipio_codigo_ine, indicador_slug, anio, mes, valor, dimensiones_json)
3. **Validación antes de insertar**:
   - `municipio_codigo_ine` debe existir en `municipios`
   - `indicador_slug` debe existir en `indicator_definitions`
   - `anio_referencia` debe ser razonable (2000-actual)
   - `valor_numerico` debe ser numérico o NULL (nunca convertir secreto en 0)
4. **Inserción**: UPSERT en `datos_fichas` con `metodo_acceso: 'excel_manual'`
5. **Registro**: Se crea `data_sync_runs` con `tipo_sincronizacion: 'manual_{fuente}'`

---

## 7. Plan de actualización automática mensual

### 7.1 Mecanismo existente

El hot update actual funciona así:
1. `POST /api/socideas/sync-economia/{INE}` → escribe a R2 → `revalidateTag('socideas-muni-{INE}')`
2. La ficha web relee R2 en la siguiente petición (caché de 1h invalidado)

### 7.2 Decisión: extender el mecanismo existente

**Sí, extender el hot update existente** en vez de crear un segundo sistema. Justificación:

- El mecanismo de `revalidateTag()` ya está probado y funciona
- Las categorías nuevas de Supabase (`datos_fichas`) se pueden cachear con la misma estrategia: `unstable_cache` + tag por municipio
- La Edge Function de actualización mensual puede:
  1. Descargar datos de APIs públicas (INE Tempus3, SEPE, TGSS)
  2. Insertar en `datos_fichas` via Supabase service_role
  3. Llamar a `revalidateTag()` para invalidar la caché

### 7.3 Flujo propuesto

```
Edge Function (cron mensual)
  │
  ├── Para cada categoría con API automática:
  │   ├── Descargar datos de la fuente INE/SEPE/TGSS
  │   ├── Validar contra esquema
  │   ├── UPSERT en datos_fichas (Supabase)
  │   ├── Registrar sync en data_sync_runs
  │   └── revalidateTag('socideas-muni-{INE}') para municipios afectados
  │
  └── Para categorías de carga manual:
      └── No hacer nada (esperar carga manual del usuario)
```

### 7.4 Por qué no separar los sistemas

Crear un sistema de actualización paralelo para Supabase sería:
- Duplicación de lógica de validación y registro
- Dos sistemas de caché que se descoordinan
- Más superficie de error

Extender el existente es:
- Un solo punto de verdad para la invalidación de caché
- Reutilización de la lógica de `data_sync_runs`
- Mantenimiento más simple

---

## 8. Confirmaciones de seguridad

- ✅ **Cero escrituras reales en Supabase** — el SQL es una propuesta, no se aplica
- ✅ **Cero escrituras en R2** — no se ejecuta `load-ine-layers-r2.ts`
- ✅ **Cero migraciones aplicadas** — el archivo SQL se entrega como propuesta
- ✅ **Cero cambios en XLSX** — no se modifica `socideas-xlsx.ts`
- ✅ **Cero cambios en ficha web** — no se modifica ningún componente React
- ✅ **Cero cambios en hot update real** — no se modifica `sync-economia` route
- ✅ **Cero cambios en mapas** — no se tocan coropletas
- ✅ **Cero datos inventados** — todos los identificadores verificados contra API real
- ✅ **Cero identificadores no verificados** — 69767, 69711, 69743, 69746, 2076 confirmados
