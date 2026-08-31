-- Migration 013: WMS categories + new verified capas
-- Part 1: Add category column to capas_wms
-- Part 2: Update existing capas with categories
-- Part 3: Insert verified WMS capas from national sources

-- ==========================================
-- PARTE 1: AÑADIR COLUMNA CATEGORIA
-- ==========================================

ALTER TABLE capas_wms
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'planeamiento_general'
  CHECK (categoria IN (
    'planeamiento_general', 'clasificacion_suelo', 'calificacion_urbanistica',
    'catastro', 'ortofoto', 'riesgos_naturales', 'patrimonio_cultural',
    'infraestructuras', 'medio_ambiente'
  ));

CREATE INDEX IF NOT EXISTS idx_capas_wms_categoria ON capas_wms(categoria);

COMMENT ON COLUMN capas_wms.categoria IS 'Categoría temática de la capa WMS';

-- ==========================================
-- PARTE 2: ACTUALIZAR CAPAS EXISTENTES
-- ==========================================

UPDATE capas_wms SET categoria = 'clasificacion_suelo'
  WHERE nombre_capa LIKE '%CLASSIFICACIONS%';

UPDATE capas_wms SET categoria = 'calificacion_urbanistica'
  WHERE nombre_capa LIKE '%QUALIFICACIONS%';

UPDATE capas_wms SET categoria = 'planeamiento_general'
  WHERE nombre_capa LIKE '%PLANEJAMENT%'
     OR nombre_capa LIKE '%AMBIT%'
     OR nombre_capa LIKE '%MUC_AMBIT%';

-- ==========================================
-- PARTE 3: INSERTAR CAPAS WMS VERIFICADAS
-- ==========================================

-- PNOA Histórico (IGN) — Ortofotografía de España, aplica a todas las CCAA
-- URL verificada: https://www.ign.es/wms/pnoa-historico (HTTP 200)
-- Capas: PNOA2024, PNOA2023, ..., PNOA2004, Nacional_1981-1986, AMS_1956-1957
-- Formatos: image/png, image/jpeg, image/gif
-- CRS: EPSG:4326, EPSG:25830, EPSG:32630, EPSG:4258

-- Insert PNOA for every CCAA that doesn't already have this exact capa
INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'PNOA_HISTORICO', 'https://www.ign.es/wms/pnoa-historico', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'ortofoto'
FROM comunidades_autonomas ca
WHERE NOT EXISTS (
  SELECT 1 FROM capas_wms c
  WHERE c.comunidad_autonoma_id = ca.id
    AND c.nombre_capa = 'PNOA_HISTORICO'
    AND c.url_servicio = 'https://www.ign.es/wms/pnoa-historico'
);

-- Plano_sig (IGN) — Mapas históricos de España, aplica a todas las CCAA
-- URL verificada: https://www.ign.es/wms/planosig (HTTP 200)
-- Capas: mancelliMadrid, texeira, chalmadrierMadrid, madozMadrid, etc.
-- Formatos: image/png, image/jpeg, image/gif
-- CRS: EPSG:4326, EPSG:25830, EPSG:3857

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'PLANOSIG_HISTORICO', 'https://www.ign.es/wms/planosig', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'patrimonio_cultural'
FROM comunidades_autonomas ca
WHERE NOT EXISTS (
  SELECT 1 FROM capas_wms c
  WHERE c.comunidad_autonoma_id = ca.id
    AND c.nombre_capa = 'PLANOSIG_HISTORICO'
    AND c.url_servicio = 'https://www.ign.es/wms/planosig'
);
