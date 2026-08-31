-- Migration 010: Datos semilla iniciales
-- Normativa estatal, servicios WMS verificados y fuentes geoportales oficiales

-- ==========================================
-- NORMATIVA ESTATAL
-- ==========================================

INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia) VALUES
('estatal', NULL,
 'Texto Refundido de la Ley de Suelo y Rehabilitación Urbana',
 'Real Decreto Legislativo 7/2015, de 30 de octubre, por el que se aprueba el texto refundido de la Ley de Suelo y Rehabilitación Urbana',
 '2015-10-31',
 'https://www.boe.es/boe/dias/2015/11/03/pdfs/BOE-A-2015-11430.pdf',
 'vigente'),
('estatal', NULL,
 'Ley de Suelo',
 'Ley 8/2007, de 28 de mayo, de Suelo y Rehabilitación Urbana (derogada por RDL 7/2015)',
 '2007-05-29',
 'https://www.boe.es/boe/dias/2007/05/29/pdfs/A22236-22265.pdf',
 'derogada'),
('estatal', NULL,
 'Ley de Bases de Régimen Local',
 'Real Decreto Legislativo 781/1986, de 18 de abril, por el que se aprueba el texto refundido de las disposiciones legales vigentes en materia de Régimen Local',
 '1986-04-19',
 'https://www.boe.es/boe/dias/1986/06/27/pdfs/A19631-19655.pdf',
 'vigente'),
('estatal', NULL,
 'Ley de Procedimiento Administrativo Común de las Administraciones Públicas',
 'Ley 39/2015, de 1 de octubre, del Procedimiento Administrativo Común de las Administraciones Públicas',
 '2015-10-02',
 'https://www.boe.es/boe/dias/2015/10/02/pdfs/BOE-A-2015-10443.pdf',
 'vigente'),
('estatal', NULL,
 'Ley de Transparencia, Acceso a la Información Pública y Buen Gobierno',
 'Ley 19/2013, de 9 de diciembre, de transparencia, acceso a la información pública y buen gobierno',
 '2013-12-10',
 'https://www.boe.es/boe/dias/2013/12/10/pdfs/BOE-A-2013-12887.pdf',
 'vigente');

-- ==========================================
-- NORMATIVA AUTONÓMICA (referencias a comunidades)
-- ==========================================

INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia) VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'),
 'Ley de Suelo de Andalucía',
 'Ley 7/2007, de 13 de marzo, de Suelo de Andalucía',
 '2007-03-13',
 'https://www.boe.es/boe/dias/2007/04/14/pdfs/A16414-16459.pdf',
 'vigente'),
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Aragón'),
 'Ley de Suelo de Aragón',
 'Ley 13/2015, de 9 de julio, de Suelo de Aragón',
 '2015-07-09',
 'https://www.boe.es/boe/dias/2015/07/31/pdfs/BOE-A-2015-8389.pdf',
 'vigente'),
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'),
 'Ley de régimen urbanístico y valoraciones de Cataluña',
 'Ley 19/2003, de 4 de diciembre, de régimen urbanístico y valoraciones de Cataluña',
 '2003-12-04',
 'https://www.boe.es/boe/dias/2004/01/10/pdfs/A1517-1552.pdf',
 'vigente'),
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'País Vasco'),
 'Ley de Suelo y Urbanismo del País Vasco',
 'Ley 1/2010, de 1 de julio, de Suelo y Urbanismo del País Vasco',
 '2010-07-01',
 'https://www.boe.es/boe/dias/2010/07/23/pdfs/BOE-A-2010-11203.pdf',
 'vigente'),
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunitat Valenciana'),
 'Ley de Ordenación del Territorio, Urbanismo y Paisaje de la Comunitat Valenciana',
 'Ley 5/2014, de 25 de julio, de Ordenación del Territorio, Urbanismo y Paisaje de la Comunitat Valenciana',
 '2014-07-25',
 'https://www.boe.es/boe/dias/2014/08/23/pdfs/BOE-A-2014-8811.pdf',
 'vigente'),
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad de Madrid'),
 'Texto Refundido de la Ley de Suelo y Rehabilitación Urbana de la Comunidad de Madrid',
 'Decreto Legislativo 1/2010, de 21 de octubre, del Gobierno de la Comunidad de Madrid, por el que se aprueba el texto refundido de las disposiciones legales vigentes en materia de suelo y rehabilitación urbana',
 '2010-10-21',
 'https://www.boe.es/boe/dias/2010/11/20/pdfs/BOE-A-2010-17636.pdf',
 'vigente');

-- ==========================================
-- SERVICIOS WMS VERIFICADOS
-- ==========================================

-- Cataluña: SIG de Planeamiento
INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'),
 'MUC_AMBIT_MUNICIPAL',
 'https://sig.gencat.cat/ows/PLANEJAMENT/wms',
 'WMS',
 'image/png',
 'EPSG:4326',
 NOW()),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'),
 'MUC_CLASSIFICACIONS',
 'https://sig.gencat.cat/ows/PLANEJAMENT/wms',
 'WMS',
 'image/png',
 'EPSG:4326',
 NOW()),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'),
 'MUC_QUALIFICACIONS',
 'https://sig.gencat.cat/ows/PLANEJAMENT/wms',
 'WMS',
 'image/png',
 'EPSG:4326',
 NOW()),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'),
 'PLANEJAMENT_GENERAL_VIGENT',
 'https://sig.gencat.cat/ows/PLANEJAMENT/wms',
 'WMS',
 'image/png',
 'EPSG:4326',
 NOW());

-- Navarra: IDENA
INSERT INTO capas_wms (comunidad_autonoma_id, nombre_capa, url_servicio, tipo_servicio, formato_soportado, sistema_referencia, fecha_verificacion) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad Foral de Navarra'),
 'Navarra_WMS',
 'https://idena.navarra.es/ogc/wms',
 'WMS',
 'image/png',
 'EPSG:4326',
 NOW());

-- ==========================================
-- FUENTES GEOPORTALES OFICIALES
-- ==========================================

-- Andalucía
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'),
 'SITCA - Sistema de Información Territorial de Córdoba',
 'https://situcordoba.cordoba.es/visorsit/',
 'visor web'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'),
 'Geoportal Junta de Andalucía',
 'https://www.juntadeandalucia.es/medioambiente/siga/',
 'visor web');

-- Aragón
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Aragón'),
 'Infraestructura de Datos Espaciales de Aragón (IDEARAGÓN)',
 'https://www.aragon.es/organismos/medio-ambiente/estudio-y-ordenacion-del-territorio/infraestructura-de-datos-espaciales-de-aragon-idearagon',
 'visor web');

-- Asturias
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Asturias'),
 'IDEPA - Infraestructura de Datos Espaciales del Principado de Asturias',
 'https://mapas.asturias.es/',
 'visor web');

-- Islas Baleares
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Islas Baleares'),
 'IDEIB - Infraestructura de Datos Espaciales de Illes Balears',
 'https://www.caib.es/apps/cartografia/idwe/visorsig/',
 'visor web');

-- Canarias
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Canarias'),
 'IDECAN - Infraestructura de Datos Espaciales de Canarias',
 'https://www.gobiernodecanarias.org/ide/',
 'visor web');

-- Cantabria
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cantabria'),
 'IDECAN - Infraestructura de Datos Espaciales de Cantabria',
 'https://www.cantabria.es/medio-ambiente/infraestructura-de-datos-espaciales-de-cantabria-idecan',
 'visor web');

-- Castilla y León
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'),
 'IDCYL - Infraestructura de Datos Espaciales de Castilla y León',
 'https://portalsedipac.jcyl.es/geocyl/',
 'visor web');

-- Castilla-La Mancha
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla-La Mancha'),
 'IGME - Instituto Geológico y Minero de España (Castilla-La Mancha)',
 'https://www.igme.es/visores/',
 'visor web');

-- Cataluña
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'),
 'ICGC - Institut Cartogràfic i Geològic de Catalunya',
 'https://www.icgc.cat/',
 'visor web'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'),
 'SIG de Planejament Urbanístic de Catalunya',
 'https://sig.gencat.cat/ows/PLANEJAMENT/wms',
 'WMS');

-- Extremadura
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Extremadura'),
 'Geoportal de Extremadura',
 'https://geoportal inex.es/',
 'visor web');

-- Galicia
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Galicia'),
 'IGAXE - Infraestructura de Datos Espaciales de Galicia',
 'https://www3.xunta.gal/igaxe/',
 'visor web');

-- La Rioja
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'La Rioja'),
 'Geoportal de La Rioja',
 'https://www.larioja.org/',
 'visor web');

-- Comunidad de Madrid
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad de Madrid'),
 'Geoportal de la Comunidad de Madrid',
 'https://www.comunidad.madrid/gobierno/datos-geoportal',
 'visor web'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad de Madrid'),
 'Colaboratorio de Datos Abiertos de Madrid',
 'https://datos.comunidad.madrid/',
 'API');

-- Región de Murcia
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Región de Murcia'),
 'Geoportal de la Región de Murcia',
 'https://www.carm.es/',
 'visor web');

-- Comunidad Foral de Navarra
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad Foral de Navarra'),
 'IDENA - Infraestructura de Datos Espaciales de Navarra',
 'https://idena.navarra.es/',
 'visor web'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad Foral de Navarra'),
 'IDENA - Servicio WMS',
 'https://idena.navarra.es/ogc/wms',
 'WMS');

-- País Vasco
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'País Vasco'),
 'Geoeuskadi - Infraestructura de Datos Espaciales del País Vasco',
 'https://www.euskadi.eus/geoeuskadi/',
 'visor web');

-- Comunitat Valenciana
INSERT INTO fuentes_geoportales (comunidad_autonoma_id, nombre, url, tipo_servicio) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunitat Valenciana'),
 'GeneRIGV - Infraestructura de Datos Espaciales de la Generalitat Valenciana',
 'https://www.generigv.gva.es/',
 'visor web');
