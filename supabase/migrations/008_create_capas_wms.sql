-- Migration 008: Capas WMS
-- Registro de servicios WMS y capas de información geoespacial

CREATE TABLE IF NOT EXISTS capas_wms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comunidad_autonoma_id UUID NOT NULL REFERENCES comunidades_autonomas(id),
  nombre_capa TEXT NOT NULL,
  url_servicio TEXT NOT NULL,
  tipo_servicio TEXT NOT NULL CHECK (tipo_servicio IN ('WMS', 'WFS', 'ArcGIS REST')),
  formato_soportado TEXT DEFAULT 'image/png',
  sistema_referencia TEXT DEFAULT 'EPSG:4326',
  fecha_verificacion TIMESTAMPTZ DEFAULT NOW(),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE capas_wms IS 'Servicios WMS y capas de información geoespacial oficial';
COMMENT ON COLUMN capas_wms.tipo_servicio IS 'Tipo de servicio: WMS, WFS, ArcGIS REST';
COMMENT ON COLUMN capas_wms.formato_soportado IS 'Formato soportado por el servicio';
COMMENT ON COLUMN capas_wms.sistema_referencia IS 'Sistema de referencia del servicio';

CREATE INDEX IF NOT EXISTS idx_capas_wms_comunidad ON capas_wms(comunidad_autonoma_id);
CREATE INDEX IF NOT EXISTS idx_capas_wms_activo ON capas_wms(activo);
