-- Migration 019: Seed geo_layers para todas las CCAA con servicios confirmed
-- Nombres de capas verificados via GetCapabilities cuando fue posible

-- ==========================================
-- Castilla y León - IDECyL Urbanismo (verificado)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'plau_cyl_clasificacion', 'Clasificación de suelo - Castilla y León',
  ARRAY['castilla_y_leon', 'idecyl', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo urbanístico: urbano, urbanizable y rústico de CyL.'
FROM geo_services gs WHERE gs.service_name = 'IDECyL Urbanismo' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'plau_cyl_categorias_desagrupa', 'Categorías de suelo - Castilla y León',
  ARRAY['castilla_y_leon', 'idecyl', 'categoria_suelo', 'suelo'],
  'categoria_suelo', 'land_cover', true,
  'Categorías de suelo urbanístico: consolidado, no consolidado, urbanizable, rústico común, rústico protegido.'
FROM geo_services gs WHERE gs.service_name = 'IDECyL Urbanismo' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'ot_cyl_areas_funcionales_estables', 'Áreas Funcionales Estables',
  ARRAY['castilla_y_leon', 'idecyl', 'planeamiento_general', 'areas_funcionales'],
  'planeamiento_general', 'planning_scope', true,
  'Áreas funcionales estables según LEY 5/2018 de CyL.'
FROM geo_services gs WHERE gs.service_name = 'IDECyL Urbanismo' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'ot_cyl_instrumentos_ambito', 'Ámbito instrumentos de OT',
  ARRAY['castilla_y_leon', 'idecyl', 'planeamiento_general', 'instrumentos'],
  'planeamiento_general', 'municipal_plan', true,
  'Mapa del ámbito de los instrumentos de ordenación territorial de CyL.'
FROM geo_services gs WHERE gs.service_name = 'IDECyL Urbanismo' LIMIT 1;

-- ==========================================
-- Región de Murcia - SIT Planeamiento Urbano (verificado)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'clases_plu_ze_37mun', 'Clases de suelo - Murcia',
  ARRAY['murcia', 'sit', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clases de suelo del planeamiento urbanístico de la Región de Murcia (37 municipios).'
FROM geo_services gs WHERE gs.service_name = 'SIT Planeamiento Urbano CARM' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'plu_clasific_tipos_urbano', 'Suelos urbanos - Murcia',
  ARRAY['murcia', 'sit', 'clasificacion_suelo', 'urbano'],
  'clasificacion_suelo', 'urban_zone', true,
  'Suelos urbanos del planeamiento de Murcia.'
FROM geo_services gs WHERE gs.service_name = 'SIT Planeamiento Urbano CARM' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'plu_clasific_tipos_urbanizable', 'Suelos urbanizables - Murcia',
  ARRAY['murcia', 'sit', 'clasificacion_suelo', 'urbanizable'],
  'clasificacion_suelo', 'land_cover', true,
  'Suelos urbanizables del planeamiento de Murcia.'
FROM geo_services gs WHERE gs.service_name = 'SIT Planeamiento Urbano CARM' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'plu_clasific_tipos_no_urbanizable', 'Suelos no urbanizables - Murcia',
  ARRAY['murcia', 'sit', 'clasificacion_suelo', 'no_urbanizable'],
  'clasificacion_suelo', 'land_cover', true,
  'Suelos no urbanizables del planeamiento de Murcia.'
FROM geo_services gs WHERE gs.service_name = 'SIT Planeamiento Urbano CARM' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'plu_prot_amb_pol', 'Protección ambiental - Murcia',
  ARRAY['murcia', 'sit', 'proteccion_ambiental', 'medio_ambiente'],
  'proteccion_ambiental', 'protected_area_overlay', true,
  'Polígonos de protección ambiental del planeamiento de Murcia.'
FROM geo_services gs WHERE gs.service_name = 'SIT Planeamiento Urbano CARM' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'plu_prot_arq_pol', 'Protección arqueológica - Murcia',
  ARRAY['murcia', 'sit', 'proteccion_ambiental', 'arqueologia'],
  'proteccion_ambiental', 'protected_area_overlay', true,
  'Polígonos de protección arqueológica del planeamiento de Murcia.'
FROM geo_services gs WHERE gs.service_name = 'SIT Planeamiento Urbano CARM' LIMIT 1;

-- ==========================================
-- Región de Murcia - SIT PLU (verificado)
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'clases_plu_ze_37mun', 'Clases de suelo PLU - Murcia',
  ARRAY['murcia', 'sit', 'plu', 'clasificacion_suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clases de suelo del Plan de Ordenación Local de Murcia.'
FROM geo_services gs WHERE gs.service_name = 'SIT PLU CARM' LIMIT 1;

-- ==========================================
-- Andalucía - IDEAndalucía MTA400v
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Limites', 'Límites administrativos - Andalucía',
  ARRAY['andalucia', 'ideandalucia', 'planeamiento_general', 'limites'],
  'planeamiento_general', 'planning_scope', true,
  'Límites administrativos de Andalucía (MTA400v).'
FROM geo_services gs WHERE gs.service_name = 'IDEAndalucía MTA400v' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Redes', 'Redes de infraestructuras - Andalucía',
  ARRAY['andalucia', 'ideandalucia', 'infraestructuras', 'redes'],
  'infraestructuras', 'infrastructure', true,
  'Redes de infraestructuras de Andalucía (MTA400v).'
FROM geo_services gs WHERE gs.service_name = 'IDEAndalucía MTA400v' LIMIT 1;

-- ==========================================
-- Aragón - SIUa WMS
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clasificacion_Suelo', 'Clasificación de suelo - Aragón',
  ARRAY['aragon', 'siua', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clasificación de suelo del SIU de Aragón.'
FROM geo_services gs WHERE gs.service_name = 'SIUa WMS - Sistema de Información Urbanística de Aragón' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Sectores', 'Sectores urbanos - Aragón',
  ARRAY['aragon', 'siua', 'sector', 'urbanismo'],
  'sector', 'planning_sector', true,
  'Sectores urbanos del SIU de Aragón.'
FROM geo_services gs WHERE gs.service_name = 'SIUa WMS - Sistema de Información Urbanística de Aragón' LIMIT 1;

-- ==========================================
-- Asturias - Visor RPGUR
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'E79_ENTIDADES_URBANISTICAS', 'Entidades urbanísticas - Asturias',
  ARRAY['asturias', 'rpgur', 'sector', 'entidades_urbanisticas'],
  'sector', 'planning_sector', true,
  'Entidades urbanísticas del Principado de Asturias.'
FROM geo_services gs WHERE gs.service_name = 'Visor RPGUR Entidades Urbanísticas' LIMIT 1;

-- ==========================================
-- Baleares - SQM CAIB
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'SQM', 'Qualitats del sòl - Illes Balears',
  ARRAY['baleares', 'sqm', 'siose', 'ocupacion_suelo'],
  'siose', 'land_cover', true,
  'Servicio de calidades medioambientales de Baleares.'
FROM geo_services gs WHERE gs.service_name = 'SQM CAIB' LIMIT 1;

-- ==========================================
-- Canarias - IDECAN Ocupación del Suelo
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Usos_Suelo', 'Usos del suelo - Canarias',
  ARRAY['canarias', 'idecan', 'ocupacion_suelo', 'usos'],
  'ocupacion_suelo', 'land_use', true,
  'Usos del suelo de Canarias.'
FROM geo_services gs WHERE gs.service_name = 'IDECAN - Ocupación del Suelo' LIMIT 1;

-- ==========================================
-- Cantabria - IDECAN Cantabria
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'LimiteMunicipal', 'Límites municipales - Cantabria',
  ARRAY['cantabria', 'idecan', 'planeamiento_general', 'limites'],
  'planeamiento_general', 'planning_scope', true,
  'Límites municipales de Cantabria.'
FROM geo_services gs WHERE gs.service_name = 'IDECAN Cantabria' LIMIT 1;

-- ==========================================
-- Castilla-La Mancha - IDEKepler
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'SIGCARRETEROS', 'Red de carreteras - Castilla-La Mancha',
  ARRAY['castilla_la_mancha', 'idekepler', 'infraestructuras', 'carreteras'],
  'infraestructuras', 'infrastructure', true,
  'Red de carreteras de Castilla-La Mancha.'
FROM geo_services gs WHERE gs.service_name = 'IDEKepler SIGCarreteros' LIMIT 1;

-- ==========================================
-- Extremadura - IDEEXTREME DURA Urbanismo
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Clases_Suelo', 'Clases de suelo - Extremadura',
  ARRAY['extremadura', 'ideextreme', 'clasificacion_suelo', 'suelo'],
  'clasificacion_suelo', 'land_cover', true,
  'Clases de suelo del planeamiento de Extremadura.'
FROM geo_services gs WHERE gs.service_name = 'IDEEXTREME DURA - Urbanismo' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Calificaciones', 'Calificaciones urbanísticas - Extremadura',
  ARRAY['extremadura', 'ideextreme', 'calificacion_urbanistica', 'usos'],
  'calificacion_urbanistica', 'urban_zone', true,
  'Calificaciones urbanísticas del planeamiento de Extremadura.'
FROM geo_services gs WHERE gs.service_name = 'IDEEXTREME DURA - Urbanismo' LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Unidades_Actuacion', 'Unidades de actuación - Extremadura',
  ARRAY['extremadura', 'ideextreme', 'unidad_actuacion', 'planeamiento'],
  'unidad_actuacion', 'planning_unit', true,
  'Unidades de actuación del planeamiento de Extremadura.'
FROM geo_services gs WHERE gs.service_name = 'IDEEXTREME DURA - Urbanismo' LIMIT 1;

-- ==========================================
-- Galicia - POL Planeamiento Urbanístico
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'POL_AD_PlaneamientoUrbanistico', 'Planeamiento urbanístico - Galicia',
  ARRAY['galicia', 'ideg', 'planeamiento_general', 'pol'],
  'planeamiento_general', 'municipal_plan', true,
  'Planeamiento urbanístico municipal de Galicia (POL).'
FROM geo_services gs WHERE gs.service_name = 'POL Planeamiento Urbanístico' LIMIT 1;

-- ==========================================
-- Galicia - POL Usos
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'POL_AD_Usos', 'Usos del suelo - Galicia',
  ARRAY['galicia', 'ideg', 'usos_suelo', 'usos'],
  'usos_suelo', 'land_use', true,
  'Usos del suelo de Galicia (POL).'
FROM geo_services gs WHERE gs.service_name = 'POL Usos' LIMIT 1;

-- ==========================================
-- Madrid - IDEM Geoserver
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'capas_base', 'Capas base - Madrid',
  ARRAY['madrid', 'idem', 'planeamiento_general', 'cartografia'],
  'planeamiento_general', 'municipal_plan', true,
  'Capas base de cartografía de la Comunidad de Madrid.'
FROM geo_services gs WHERE gs.service_name = 'IDEM - Infraestructura de Datos Espaciales de Madrid' LIMIT 1;

-- ==========================================
-- País Vasco - geoEuskadi Plangintza
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Planeamiento', 'Planeamiento urbanístico - País Vasco',
  ARRAY['pais_vasco', 'geo_euskadi', 'plangintza', 'planeamiento'],
  'planeamiento_general', 'municipal_plan', true,
  'Planeamiento urbanístico del País Vasco (Plangintza).'
FROM geo_services gs WHERE gs.service_name = 'geoEuskadi WMS Plangintza' LIMIT 1;

-- ==========================================
-- País Vasco - geoEuskadi SRS
-- ==========================================

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id, 'Servicios_SRS', 'Servicios de referencia espacial - País Vasco',
  ARRAY['pais_vasco', 'geo_euskadi', 'srs', 'cartografia'],
  'siose', 'land_cover', true,
  'Servicios de referencia espacial de geoEuskadi.'
FROM geo_services gs WHERE gs.service_name = 'geoEuskadi MapServer SRS' LIMIT 1;
