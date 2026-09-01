-- Migration 020: Create directorio_ayuntamientos table + siu_planeamiento sync
-- Stores links to municipal planning portals and SIU data for each municipality

-- ==========================================
-- 1. TABLA: directorio_ayuntamientos
-- ==========================================
CREATE TABLE IF NOT EXISTS directorio_ayuntamientos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  municipio_id UUID REFERENCES municipios(id),
  codigo_ine TEXT NOT NULL,
  nombre_ayuntamiento TEXT NOT NULL,
  url_web_oficial TEXT,
  url_legislacion_urbanistica TEXT,
  url_plan_ordenacion TEXT,
  url_boletin_municipal TEXT,
  tiene_datos_abiertos BOOLEAN DEFAULT false,
  url_api_datos_abiertos TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE directorio_ayuntamientos IS 'Directorio de enlaces a webs oficiales de ayuntamientos con información urbanística';
COMMENT ON COLUMN directorio_ayuntamientos.codigo_ine IS 'Código INE del municipio (5 dígitos: 2 provincia + 3 municipio)';

CREATE INDEX IF NOT EXISTS idx_directorio_municipio ON directorio_ayuntamientos(municipio_id);
CREATE INDEX IF NOT EXISTS idx_directorio_codigo_ine ON directorio_ayuntamientos(codigo_ine);

-- Unique constraint to avoid duplicates per municipality
CREATE UNIQUE INDEX IF NOT EXISTS idx_directorio_codigo_ine_unique ON directorio_ayuntamientos(codigo_ine);

-- ==========================================
-- 2. TABLA: siu_planeamiento (caché local del SIU estatal)
-- ==========================================
CREATE TABLE IF NOT EXISTS siu_planeamiento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_ine TEXT NOT NULL,
  municipio_nombre TEXT NOT NULL,
  figura_vigente TEXT NOT NULL,
  fecha_figura INTEGER,
  observaciones TEXT,
  comentario_visor TEXT,
  texto_link TEXT,
  url_link TEXT,
  fuente_datos TEXT DEFAULT 'SIU',
  ultima_sincronizacion TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE siu_planeamiento IS 'Caché local de datos de planeamiento del SIU estatal por municipio';
COMMENT ON COLUMN siu_planeamiento.codigo_ine IS 'Código INE del municipio';
COMMENT ON COLUMN siu_planeamiento.figura_vigente IS 'Tipo de figura de planeamiento: Plan General, Normas Subsidiarias, PGOU, OTP, etc.';
COMMENT ON COLUMN siu_planeamiento.fecha_figura IS 'Año de aprobación de la figura vigente';

CREATE UNIQUE INDEX IF NOT EXISTS idx_siu_codigo_ine ON siu_planeamiento(codigo_ine);
CREATE INDEX IF NOT EXISTS idx_siu_figura ON siu_planeamiento(figura_vigente);

-- ==========================================
-- 3. TABLA: sync_jobs (control de sincronización SIU)
-- ==========================================
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type TEXT NOT NULL CHECK (source_type IN ('siu', 'legal', 'geospatial', 'boletin', 'scraper')),
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
-- 4. POBLAR directorio_ayuntamientos desde municipios existentes
-- ==========================================
-- This will be done via the import script, but we add a placeholder for structure

-- ==========================================
-- 5. VISTA: vista_resumen_planeamiento
-- ==========================================
CREATE OR REPLACE VIEW vista_resumen_planeamiento AS
SELECT 
  s.codigo_ine,
  s.municipio_nombre,
  s.figura_vigente,
  s.fecha_figura,
  s.url_link,
  s.ultima_sincronizacion,
  d.url_web_oficial,
  d.url_legislacion_urbanistica,
  m.provincia_id
FROM siu_planeamiento s
LEFT JOIN directorio_ayuntamientos d ON s.codigo_ine = d.codigo_ine
LEFT JOIN municipios m ON d.municipio_id = m.id;

COMMENT ON VIEW vista_resumen_planeamiento IS 'Vista resumen que combina datos SIU con directorio de ayuntamientos';
