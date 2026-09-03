-- Fase 2A SOCideas: modelo de datos del perfil demográfico municipal.
-- Fuente territorial única: public.municipios (codigo_ine character(5) UNIQUE).
-- RLS activo desde la creación; SIN políticas públicas: lectura/escritura
-- solo vía servidor (service_role). No toca tablas existentes.

-- 1. Catálogo de fuentes estadísticas -------------------------------------
CREATE TABLE IF NOT EXISTS public.statistical_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  organismo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  url_base text,
  api_table_id text,
  licencia text,
  frecuencia_actualizacion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Definiciones metodológicas de indicadores -----------------------------
CREATE TABLE IF NOT EXISTS public.indicator_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  nombre text NOT NULL,
  grupo text NOT NULL,
  descripcion text,
  unidad text,
  metodologia text,
  fuente_principal_id uuid REFERENCES public.statistical_sources(id),
  periodicidad text,
  visualizacion_recomendada text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Valores por municipio / indicador / año / dimensiones -----------------
-- municipio_codigo_ine replica el tipo exacto de municipios.codigo_ine
-- (character(5)) para permitir FOREIGN KEY sin romper formatos.
CREATE TABLE IF NOT EXISTS public.municipal_indicator_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_codigo_ine character(5) NOT NULL REFERENCES public.municipios(codigo_ine),
  indicator_id uuid NOT NULL REFERENCES public.indicator_definitions(id),
  fecha_referencia date,
  anio_referencia integer,
  valor_numerico numeric,
  valor_texto text,
  unidad text,
  dimensiones jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_id uuid NOT NULL REFERENCES public.statistical_sources(id),
  source_url text,
  source_table_id text,
  source_series_id text,
  obtenido_en timestamptz NOT NULL DEFAULT now(),
  estado_validacion text NOT NULL DEFAULT 'pendiente'
    CHECK (estado_validacion IN ('pendiente', 'validado', 'revision', 'descartado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT municipal_indicator_values_tiene_valor
    CHECK (valor_numerico IS NOT NULL OR valor_texto IS NOT NULL),
  CONSTRAINT municipal_indicator_values_tiene_periodo
    CHECK (fecha_referencia IS NOT NULL OR anio_referencia IS NOT NULL)
);

-- Anti-duplicados lógicos: mismo municipio, indicador, periodo, fuente y dimensiones.
CREATE UNIQUE INDEX IF NOT EXISTS municipal_indicator_values_uniq
  ON public.municipal_indicator_values
  (municipio_codigo_ine, indicator_id, COALESCE(anio_referencia, -1),
   COALESCE(fecha_referencia, '1970-01-01'::date), source_id, dimensiones);

CREATE INDEX IF NOT EXISTS municipal_indicator_values_municipio_idx
  ON public.municipal_indicator_values (municipio_codigo_ine);
CREATE INDEX IF NOT EXISTS municipal_indicator_values_indicator_idx
  ON public.municipal_indicator_values (indicator_id);
CREATE INDEX IF NOT EXISTS municipal_indicator_values_anio_idx
  ON public.municipal_indicator_values (anio_referencia);
CREATE INDEX IF NOT EXISTS municipal_indicator_values_source_idx
  ON public.municipal_indicator_values (source_id);
CREATE INDEX IF NOT EXISTS municipal_indicator_values_obtenido_idx
  ON public.municipal_indicator_values (obtenido_en DESC);

-- 4. Registro de ejecuciones de sincronización ------------------------------
CREATE TABLE IF NOT EXISTS public.data_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.statistical_sources(id),
  tipo_sincronizacion text NOT NULL,
  municipio_codigo_ine text,
  inicio timestamptz NOT NULL DEFAULT now(),
  fin timestamptz,
  estado text NOT NULL DEFAULT 'pending'
    CHECK (estado IN ('pending', 'running', 'ok', 'partial', 'error')),
  registros_leidos integer NOT NULL DEFAULT 0,
  registros_actualizados integer NOT NULL DEFAULT 0,
  registros_con_error integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_sync_runs_municipio_idx
  ON public.data_sync_runs (municipio_codigo_ine);
CREATE INDEX IF NOT EXISTS data_sync_runs_estado_idx
  ON public.data_sync_runs (estado);

-- 5. RLS: activo en las cuatro tablas, sin políticas públicas ---------------
-- La ausencia de políticas implica denegación por defecto para anon y
-- authenticated vía PostgREST. Todo acceso pasa por servidor (service_role).
ALTER TABLE public.statistical_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicator_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_indicator_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sync_runs ENABLE ROW LEVEL SECURITY;
