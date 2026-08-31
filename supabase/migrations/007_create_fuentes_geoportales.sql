-- Migration 007: Fuentes de Geoportales
-- Registro de fuentes de información geoespacial por comunidad autónoma y provincia

CREATE TABLE IF NOT EXISTS fuentes_geoportales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comunidad_autonoma_id UUID REFERENCES comunidades_autonomas(id),
  provincia_id UUID REFERENCES provincias(id),
  nombre TEXT NOT NULL,
  url TEXT NOT NULL,
  tipo_servicio TEXT NOT NULL CHECK (tipo_servicio IN ('visor web', 'WMS', 'WFS', 'PDF', 'Excel', 'API')),
  ultima_actualizacion TIMESTAMPTZ DEFAULT NOW(),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE fuentes_geoportales IS 'Fuentes de información geoespacial oficial por comunidad autónoma';
COMMENT ON COLUMN fuentes_geoportales.tipo_servicio IS 'Tipo de servicio: visor web, WMS, WFS, PDF, Excel, API';

CREATE INDEX IF NOT EXISTS idx_fuentes_comunidad ON fuentes_geoportales(comunidad_autonoma_id);
