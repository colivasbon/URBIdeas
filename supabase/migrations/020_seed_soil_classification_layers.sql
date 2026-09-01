-- Migration 020: Capas de clasificación de suelo para todas las CCAA
-- Solo capas de tipos de suelo: urbano, urbanizable, rústico, no urbanizable

-- ==========================================
-- País Vasco - geoEuskadi Plangintza (verificado via GetCapabilities)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Lurzoru_urbanizaezina_Suelo_no_urbanizable', 'Suelo no urbanizable - País Vasco',
  ARRAY['pais_vasco', 'geo_euskadi', 'clasificacion_suelo', 'no_urbanizable'],
  'clasificacion_suelo', 'land_cover', true,
  'Suelo no urbanizable del planeamiento del País Vasco.'
FROM geo_services gs WHERE gs.service_name = 'geoEuskadi WMS Plangintza' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Egoitzarako_lurzorua_Suelo_residencial', 'Suelo residencial - País Vasco',
  ARRAY['pais_vasco', 'geo_euskadi', 'clasificacion_suelo', 'urbano'],
  'clasificacion_suelo', 'urban_zone', true,
  'Suelo residencial (urbano) del planeamiento del País Vasco.'
FROM geo_services gs WHERE gs.service_name = 'geoEuskadi WMS Plangintza' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Ekonomia_jardueretarako_lurzorua_Suelo_de_actividades_economicas', 'Suelo actividades económicas - País Vasco',
  ARRAY['pais_vasco', 'geo_euskadi', 'clasificacion_suelo', 'economico'],
  'clasificacion_suelo', 'urban_zone', true,
  'Suelo de actividades económicas del planeamiento del País Vasco.'
FROM geo_services gs WHERE gs.service_name = 'geoEuskadi WMS Plangintza' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Zonakatzea_Zonificacion', 'Zonificación - País Vasco',
  ARRAY['pais_vasco', 'geo_euskadi', 'clasificacion_suelo', 'zonificacion'],
  'clasificacion_suelo', 'land_cover', true,
  'Zonificación del planeamiento del País Vasco.'
FROM geo_services gs WHERE gs.service_name = 'geoEuskadi WMS Plangintza' LIMIT 1;

-- ==========================================
-- Madrid - IDEM Geoserver (capas de urbanismo)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Madrid',
  ARRAY['madrid', 'idem', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo del planeamiento de la Comunidad de Madrid.'
FROM geo_services gs WHERE gs.service_name = 'IDEM - Infraestructura de Datos Espaciales de Madrid' LIMIT 1;

-- ==========================================
-- Andalucía - IDEAndalucía (capas de planeamiento)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Andalucía',
  ARRAY['andalucia', 'ideandalucia', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo del planeamiento de Andalucía.'
FROM geo_services gs WHERE gs.service_name = 'IDEAndalucía MTA400v' LIMIT 1;

-- ==========================================
-- Aragón - SIUa WMS (capas de planeamiento)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Aragón',
  ARRAY['aragon', 'siua', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo del SIU de Aragón.'
FROM geo_services gs WHERE gs.service_name = 'SIUa WMS - Sistema de Información Urbanística de Aragón' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Suelo_Urbanizable', 'Suelo urbanizable - Aragón',
  ARRAY['aragon', 'siua', 'clasificacion_suelo', 'urbanizable'],
  'clasificacion_suelo', 'land_cover', true,
  'Suelo urbanizable del SIU de Aragón.'
FROM geo_services gs WHERE gs.service_name = 'SIUa WMS - Sistema de Información Urbanística de Aragón' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Suelo_Urbano', 'Suelo urbano - Aragón',
  ARRAY['aragon', 'siua', 'clasificacion_suelo', 'urbano'],
  'clasificacion_suelo', 'urban_zone', true,
  'Suelo urbano del SIU de Aragón.'
FROM geo_services gs WHERE gs.service_name = 'SIUa WMS - Sistema de Información Urbanística de Aragón' LIMIT 1;

-- ==========================================
-- Galicia - POL Planeamiento (verificado)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Galicia',
  ARRAY['galicia', 'ideg', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo del planeamiento de Galicia.'
FROM geo_services gs WHERE gs.service_name = 'POL Planeamiento Urbanístico' LIMIT 1;

-- ==========================================
-- Extremadura - IDEEXTREME DURA (verificado)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Suelo_Urbano', 'Suelo urbano - Extremadura',
  ARRAY['extremadura', 'ideextreme', 'clasificacion_suelo', 'urbano'],
  'clasificacion_suelo', 'urban_zone', true,
  'Suelo urbano del planeamiento de Extremadura.'
FROM geo_services gs WHERE gs.service_name = 'IDEEXTREME DURA - Urbanismo' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Suelo_Urbanizable', 'Suelo urbanizable - Extremadura',
  ARRAY['extremadura', 'ideextreme', 'clasificacion_suelo', 'urbanizable'],
  'clasificacion_suelo', 'land_cover', true,
  'Suelo urbanizable del planeamiento de Extremadura.'
FROM geo_services gs WHERE gs.service_name = 'IDEEXTREME DURA - Urbanismo' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Suelo_Rustico', 'Suelo rústico - Extremadura',
  ARRAY['extremadura', 'ideextreme', 'clasificacion_suelo', 'rustico'],
  'clasificacion_suelo', 'land_cover', true,
  'Suelo rústico del planeamiento de Extremadura.'
FROM geo_services gs WHERE gs.service_name = 'IDEEXTREME DURA - Urbanismo' LIMIT 1;

-- ==========================================
-- Asturias - RPGUR (entidades urbanísticas)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Asturias',
  ARRAY['asturias', 'rpgur', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo del planeamiento de Asturias.'
FROM geo_services gs WHERE gs.service_name = 'Visor RPGUR Entidades Urbanísticas' LIMIT 1;

-- ==========================================
-- Canarias - IDECAN Ocupación del Suelo
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Canarias',
  ARRAY['canarias', 'idecan', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo de Canarias.'
FROM geo_services gs WHERE gs.service_name = 'IDECAN - Ocupación del Suelo' LIMIT 1;

-- ==========================================
-- Cantabria - SITCantabria
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Cantabria',
  ARRAY['cantabria', 'idecan', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo del planeamiento de Cantabria.'
FROM geo_services gs WHERE gs.service_name = 'IDECAN Cantabria' LIMIT 1;

-- ==========================================
-- Castilla-La Mancha - IDEKepler
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Castilla-La Mancha',
  ARRAY['castilla_la_mancha', 'idekepler', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo del planeamiento de Castilla-La Mancha.'
FROM geo_services gs WHERE gs.service_name = 'IDEKepler SIGCarreteros' LIMIT 1;

-- ==========================================
-- La Rioja - Geoportal (pendiente de verificación)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - La Rioja',
  ARRAY['la_rioja', 'geoportal', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo del planeamiento de La Rioja (pendiente verificación).'
FROM geo_services gs WHERE gs.service_name = 'Geoportal La Rioja' LIMIT 1;

-- ==========================================
-- Baleares - SQM CAIB
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Baleares',
  ARRAY['baleares', 'sqm', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo de Baleares.'
FROM geo_services gs WHERE gs.service_name = 'SQM CAIB' LIMIT 1;
