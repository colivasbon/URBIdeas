-- Migración 032: Capa complementaria de Fichas Socioeconómicas
-- Estado: PROPUESTA — NO APLICAR todavía
-- Fecha: 2026-09-15
-- Rama: feat/urbideas-premium-editorial-ui
--
-- Esta migración añade una capa complementaria para categorías que
-- SOCideas todavía no cubre (elecciones, presupuestos, equipamiento,
-- turismo, vivienda, suelo). NO reemplaza ni toca las tablas existentes
-- de R2 (demografía, renta, empresas).
--
-- Convenciones verificadas contra el esquema existente:
-- - PKs: uuid con gen_random_uuid()
-- - FKs: bpchar(5) para codigo_ine (coincide con municipios.codigo_ine)
-- - Timestamps: timestamptz NOT NULL DEFAULT now()
-- - snake_case en nombres de columnas
-- - RLS habilitado con SELECT público

-- ============================================================
-- 1. Extender statistical_sources con metodo_acceso
-- ============================================================
ALTER TABLE public.statistical_sources
  ADD COLUMN IF NOT EXISTS metodo_acceso text NOT NULL DEFAULT 'api_automatica'
  CHECK (metodo_acceso IN (
    'api_automatica',
    'csv_descarga',
    'excel_manual',
    'pdf_manual',
    'fichero_posicional'
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
    'r2_v2',
    'r2_lateral',
    'supabase',
    'manual'
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
  mes_referencia integer,
  valor_numerico numeric(18,4),
  valor_texto text,
  unidad text,
  dimensiones jsonb NOT NULL DEFAULT '{}'::jsonb,
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

-- Índices
CREATE INDEX IF NOT EXISTS idx_datos_fichas_municipio
  ON public.datos_fichas (municipio_codigo_ine);

CREATE INDEX IF NOT EXISTS idx_datos_fichas_indicador
  ON public.datos_fichas (indicador_slug);

CREATE INDEX IF NOT EXISTS idx_datos_fichas_municipio_indicador
  ON public.datos_fichas (municipio_codigo_ine, indicador_slug);

CREATE INDEX IF NOT EXISTS idx_datos_fichas_periodo
  ON public.datos_fichas (anio_referencia, mes_referencia);

CREATE UNIQUE INDEX IF NOT EXISTS idx_datos_fichas_uniq
  ON public.datos_fichas (
    municipio_codigo_ine,
    indicador_slug,
    anio_referencia,
    COALESCE(mes_referencia, 0),
    dimensiones
  );

-- RLS
ALTER TABLE public.datos_fichas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "datos_fichas_public_read" ON public.datos_fichas
  FOR SELECT USING (true);

CREATE POLICY "datos_fichas_service_role_all" ON public.datos_fichas
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. Trigger para updated_at
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
-- 5. Vista de conveniencia
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
