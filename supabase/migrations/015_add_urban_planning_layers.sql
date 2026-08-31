-- Migration 015: Add real urban planning WMS layers
-- Part 1: Cataluña — additional planeamiento layers
-- Part 2: Navarra — additional IDENA layers
-- Part 3: Other CCAA — pending verified endpoints

-- ==========================================
-- CATALUÑA — Additional planeamiento layers
-- WMS: https://sig.gencat.cat/ows/PLANEJAMENT/wms
-- ==========================================

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'MUC_PDERIVAT_QUALIFICACIO', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'calificacion_urbanistica'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'MUC_PDERIVAT_SECTOR', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'planeamiento_general'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'MUC_PROTECCIO_TRANSVERSAL', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'planeamiento_general'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'MUC_SECTOR_DESENVOLUPAMENT', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'planeamiento_general'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'MUC_SECTOR_TRANSVERSAL', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'planeamiento_general'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'MUC_XARXA_PROJECTADA', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'infraestructuras'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'PLANEJAMENT_PDUSC_AMBIT', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'planeamiento_general'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'PLANEJAMENT_PDUSC_AMBITMODIF', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'planeamiento_general'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'PLANEJAMENT_PDUSC_SECTORS', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'planeamiento_general'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'PLANEJAMENT_PLAACCESSIBILITAT', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'infraestructuras'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'PLANEJAMENT_SNU_COSTANER', 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'planeamiento_general'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Cataluña'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

-- ==========================================
-- NAVARRA — Additional IDENA layers
-- WMS: https://idena.navarra.es/ogc/wms
-- ==========================================

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'IDENA_Suelo_TiposUsosSuelo', 'https://idena.navarra.es/ogc/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'clasificacion_suelo'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Comunidad Foral de Navarra'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion, categoria)
SELECT ca.id, 'IDENA_PlanificacionEstructural_SectoresEDUSI', 'https://idena.navarra.es/ogc/wms', 'WMS', 'image/png', 'EPSG:4326', NOW(), 'planeamiento_general'
FROM comunidades_autonomas ca WHERE ca.nombre = 'Comunidad Foral de Navarra'
ON CONFLICT (comunidad_autonoma_id, nombre_capa, url_servicio) DO NOTHING;

-- ==========================================
-- OTHER CCAA — Pending verified WMS endpoints
-- ==========================================
-- The following CCAA have corrected WMS endpoints in the scraper
-- but need GetCapabilities probing before inserting layers:
--
-- Andalucía: https://www.ideandalucia.es/wms/mta400v_ras
-- Aragón: https://servicios.arcgis.com/rnbLGQsFGs8dmAZj/arcgis/services/SIOSE_Aragon/MapServer/WMS
-- Asturias: https://www.asturias.es/sigiea/arcgis/services
-- Baleares: https://sqm.caib.es/sqms/wms
-- Canarias: https://idelectron.canarias.es/wms/ground
-- Cantabria: https://sitcantabria.cantabria.es/wms/CNT100
-- Castilla y León: https://servicios.jcyl.es/arcgis/services/Urbanismo/MapServer/WMSServer
-- Castilla-La Mancha: https://idekepler.jccm.es/arcgis/services/SIGCARRETEROS/MapServer/WMS
-- Extremadura: https://ideextremadura.es/wms/iter
-- Galicia: https://servizos.xunta.es/gw/wms/ign
-- La Rioja: https://www.larioja SIG.es/wms/8d5f7c8a-44c0-4626-8e39-4f41c051e1e2
-- Madrid: https://www.comunidad.madrid/cartografia/geoserver/ows
-- Murcia: https://mapas-gis-inter.carm.es/arcgis/services/SIGPAS/MapServer/WMS
-- País Vasco: https://www.geo.euskadi.eus/mapserver/serviciossrs
-- Valencia: https://dadesobertes.gva.es/arcgis/services
