-- Migration 017: Expand schema for full normative hierarchy + geospatial catalog
-- Adds: legal_sources, geo_services, geo_layers, sync_jobs, source_quality_flags
-- Enhances: capas_wms, normativa_vigente, fuentes_geoportales

-- ==========================================
-- 1. TABLA: legal_sources (catálogo normativo completo)
-- ==========================================
CREATE TABLE IF NOT EXISTS legal_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  territory TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('estatal', 'autonomico', 'provincial', 'municipal', 'insular')),
  community_id UUID REFERENCES comunidades_autonomas(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ley', 'decreto_legislativo', 'decreto_ley', 'reglamento', 'ordenanza', 'bop', 'boletin_autonomico', 'boletin_provincial', 'acuerdo', 'resolucion')),
  url TEXT,
  authority TEXT,
  description TEXT,
  legal_value TEXT NOT NULL DEFAULT 'informativo' CHECK (legal_value IN ('vinculante', 'oficial_referencia', 'informativo', 'descubrimiento')),
  priority TEXT DEFAULT 'media' CHECK (priority IN ('alta', 'media', 'baja')),
  publication_date DATE,
  status TEXT DEFAULT 'vigente' CHECK (status IN ('vigente', 'derogada', 'parcialmente_derogada', 'en_revision')),
  last_verified TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE legal_sources IS 'Catálogo normativo completo por nivel administrativo';
COMMENT ON COLUMN legal_sources.level IS 'Nivel administrativo: estatal, autonomico, provincial, municipal, insular';
COMMENT ON COLUMN legal_sources.legal_value IS 'vinculante=ley formal, oficial_referencia=boletin/reglamento, informativo=visor/web, descubrimiento=fuente auxiliar';

CREATE INDEX IF NOT EXISTS idx_legal_sources_level ON legal_sources(level);
CREATE INDEX IF NOT EXISTS idx_legal_sources_community ON legal_sources(community_id);
CREATE INDEX IF NOT EXISTS idx_legal_sources_legal_value ON legal_sources(legal_value);

-- ==========================================
-- 2. TABLA: geo_services (catálogo técnico de servicios OGC)
-- ==========================================
CREATE TABLE IF NOT EXISTS geo_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ccaa TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('estatal', 'autonomico', 'provincial', 'municipal', 'insular')),
  service_name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('WMS', 'WFS', 'WMTS', 'ArcGIS REST', 'API', 'visor')),
  url TEXT NOT NULL,
  get_capabilities_url TEXT,
  provider TEXT,
  theme TEXT,
  subtheme TEXT,
  keywords TEXT[],
  crs TEXT[],
  bbox JSONB,
  access_constraints TEXT,
  legal_value TEXT DEFAULT 'informativo' CHECK (legal_value IN ('vinculante', 'oficial_referencia', 'informativo', 'descubrimiento')),
  update_frequency TEXT,
  endpoint_status TEXT DEFAULT 'pending' CHECK (endpoint_status IN ('confirmed', 'pending', 'failed', 'deprecated')),
  last_checked TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE geo_services IS 'Catálogo técnico de servicios geoespaciales OGC por CCAA';
COMMENT ON COLUMN geo_services.endpoint_status IS 'confirmed=GetCapabilities válido, pending=pendiente verificación, failed=no responde, deprecated=obsoleto';

CREATE INDEX IF NOT EXISTS idx_geo_services_scope ON geo_services(scope);
CREATE INDEX IF NOT EXISTS idx_geo_services_type ON geo_services(service_type);
CREATE INDEX IF NOT EXISTS idx_geo_services_status ON geo_services(endpoint_status);

-- ==========================================
-- 3. TABLA: geo_layers (capas individuales de cada servicio)
-- ==========================================
CREATE TABLE IF NOT EXISTS geo_layers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES geo_services(id) ON DELETE CASCADE,
  layer_name TEXT NOT NULL,
  layer_title TEXT,
  abstract TEXT,
  keywords TEXT[],
  crs TEXT[],
  bbox JSONB,
  queryable BOOLEAN DEFAULT false,
  info_formats TEXT[],
  legend_url TEXT,
  legal_value TEXT DEFAULT 'informativo' CHECK (legal_value IN ('vinculante', 'oficial_referencia', 'informativo', 'descubrimiento')),
  update_frequency TEXT,
  thematic_category TEXT CHECK (thematic_category IN (
    'siose', 'ocupacion_suelo', 'clasificacion_suelo', 'clase_suelo',
    'categoria_suelo', 'calificacion_urbanistica', 'zonificacion',
    'planeamiento_general', 'planeamiento_desarrollo', 'sector',
    'ambito', 'unidad_actuacion', 'usos_suelo', 'infraestructuras',
    'proteccion_ambiental', 'otro'
  )),
  internal_taxonomy TEXT CHECK (internal_taxonomy IN (
    'land_cover', 'land_use', 'planned_land_use', 'soil_class',
    'soil_category', 'urban_zone', 'planning_scope', 'planning_sector',
    'planning_unit', 'protected_area_overlay', 'territorial_plan',
    'municipal_plan', 'infrastructure', 'other'
  )),
  last_verified TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE geo_layers IS 'Capas individuales de cada servicio geoespacial';
COMMENT ON COLUMN geo_layers.thematic_category IS 'Categoría temática normalizada para la app';
COMMENT ON COLUMN geo_layers.internal_taxonomy IS 'Taxonomía interna unificada de la app';

CREATE INDEX IF NOT EXISTS idx_geo_layers_service ON geo_layers(service_id);
CREATE INDEX IF NOT EXISTS idx_geo_layers_category ON geo_layers(thematic_category);
CREATE INDEX IF NOT EXISTS idx_geo_layers_taxonomy ON geo_layers(internal_taxonomy);

-- ==========================================
-- 4. TABLA: sync_jobs (control de sincronización)
-- ==========================================
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type TEXT NOT NULL CHECK (source_type IN ('legal', 'geospatial', 'boletin', 'scraper')),
  source_id UUID,
  source_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'error', 'partial')),
  last_sync TIMESTAMPTZ,
  next_sync TIMESTAMPTZ,
  sync_frequency TEXT DEFAULT 'weekly',
  changes_detected INTEGER DEFAULT 0,
  error_message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sync_jobs IS 'Control de sincronización y actualización de fuentes';

-- ==========================================
-- 5. TABLA: source_quality_flags (calidad de fuentes)
-- ==========================================
CREATE TABLE IF NOT EXISTS source_quality_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type TEXT NOT NULL CHECK (source_type IN ('legal', 'geospatial')),
  source_id UUID NOT NULL,
  url_responsive BOOLEAN,
  getcapabilities_valid BOOLEAN,
  layers_added INTEGER DEFAULT 0,
  layers_removed INTEGER DEFAULT 0,
  last_review TIMESTAMPTZ,
  reviewer TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE source_quality_flags IS 'Flags de calidad y revisión de fuentes';

-- ==========================================
-- 6. MEJORAS A tablas existentes
-- ==========================================

-- capas_wms: agregar columnas adicionales
ALTER TABLE capas_wms ADD COLUMN IF NOT EXISTS subcategoria TEXT;
ALTER TABLE capas_wms ADD COLUMN IF NOT EXISTS queryable BOOLEAN DEFAULT false;
ALTER TABLE capas_wms ADD COLUMN IF NOT EXISTS bbox JSONB;
ALTER TABLE capas_wms ADD COLUMN IF NOT EXISTS legend_url TEXT;
ALTER TABLE capas_wms ADD COLUMN IF NOT EXISTS legal_value TEXT DEFAULT 'informativo';
ALTER TABLE capas_wms ADD COLUMN IF NOT EXISTS update_frequency TEXT;
ALTER TABLE capas_wms ADD COLUMN IF NOT EXISTS endpoint_status TEXT DEFAULT 'pending';
ALTER TABLE capas_wms ADD COLUMN IF NOT EXISTS notes TEXT;

-- normativa_vigente: agregar columnas (municipio_id ya existe en mig 016)
ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS tipo_recurso TEXT CHECK (tipo_recurso IN ('ley', 'decreto_legislativo', 'decreto_ley', 'reglamento', 'ordenanza', 'bop', 'boletin_autonomico'));
ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS caracter TEXT CHECK (caracter IN ('vinculante', 'oficial_referencia', 'informativo', 'descubrimiento'));
ALTER TABLE normativa_vigente ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'media' CHECK (prioridad IN ('alta', 'media', 'baja'));

-- fuentes_geoportales: agregar columnas
ALTER TABLE fuentes_geoportales ADD COLUMN IF NOT EXISTS caracter TEXT CHECK (caracter IN ('vinculante', 'oficial_referencia', 'informativo', 'descubrimiento'));
ALTER TABLE fuentes_geoportales ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'media' CHECK (prioridad IN ('alta', 'media', 'baja'));
ALTER TABLE fuentes_geoportales ADD COLUMN IF NOT EXISTS organismo TEXT;
ALTER TABLE fuentes_geoportales ADD COLUMN IF NOT EXISTS descripcion_funcional TEXT;
