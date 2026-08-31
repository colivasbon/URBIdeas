-- Migration 009: Índices adicionales para optimización de consultas
-- Solo índices que NO se crean en las migraciones anteriores

-- Búsqueda de texto completo en nombres de municipios (español)
CREATE INDEX IF NOT EXISTS idx_municipios_nombre ON municipios USING GIN(to_tsvector('spanish', nombre));

-- Índices para capas WMS
CREATE INDEX IF NOT EXISTS idx_capas_wms_comunidad ON capas_wms(comunidad_autonoma_id);
CREATE INDEX IF NOT EXISTS idx_capas_wms_activo ON capas_wms(activo);

-- Índices para fuentes geoportales
CREATE INDEX IF NOT EXISTS idx_fuentes_comunidad ON fuentes_geoportales(comunidad_autonoma_id);
