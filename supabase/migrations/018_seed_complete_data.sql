-- Migration 018: Seed data completo - normativa + servicios geoespaciales
-- 17 CCAA + Ceuta/Melilla + fuentes estatales

-- ==========================================
-- LEGAL_SOURCES: Fuentes normativas estatales
-- ==========================================

INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('España', 'estatal', NULL,
 'Texto Refundido de la Ley de Suelo y Rehabilitación Urbana',
 'decreto_legislativo',
 'https://www.boe.es/datosabiertos/api/boe/leyes/702015/',
 'Gobierno de España / Ministerio de Transportes, Movilidad y Agenda Urbana',
 'Régimen básico estatal de suelo y rehablitación urbana. Define clases de suelo, sistema de ejecución y evaluación ambiental.',
 'vinculante', 'alta',
 '2015-10-30', 'vigente'),

('España', 'estatal', NULL,
 'Real Decreto Legislativo 781/1986 - Texto Refundido de la Ley de Bases de Régimen Local',
 'decreto_legislativo',
 'https://www.boe.es/boe/dias/1986/06/27/pdfs/A19631-19655.pdf',
 'Gobierno de España',
 'Marcos competencial de municipios en urbanismo. Arts. 25 y 125 sobre capacidad urbanística.',
 'vinculante', 'alta',
 '1986-04-18', 'vigente'),

('España', 'estatal', NULL,
 'Ley 39/2015 del Procedimiento Administrativo Común',
 'ley',
 'https://www.boe.es/boe/dias/2015/10/02/pdfs/BOE-A-2015-10443.pdf',
 'Gobierno de España',
 'Procedimiento administrativo común. Aplicable a licencias y procedimientos urbanísticos.',
 'vinculante', 'media',
 '2015-10-01', 'vigente'),

('España', 'estatal', NULL,
 'Ley 19/2013 de Transparencia, Acceso a la Información Pública y Buen Gobierno',
 'ley',
 'https://www.boe.es/boe/dias/2013/12/10/pdfs/BOE-A-2013-12887.pdf',
 'Gobierno de España',
 'Transparencia activa. Obligación de publicar información urbanística.',
 'vinculante', 'media',
 '2013-12-09', 'vigente'),

('España', 'estatal', NULL,
 'Ley 21/2013 de Evaluación Ambiental',
 'ley',
 'https://www.boe.es/boe/dias/2013/12/27/pdfs/BOE-A-2013-13588.pdf',
 'Gobierno de España',
 'Evaluación ambiental de proyectos y planes. Relevante para planes de desarrollo.',
 'vinculante', 'media',
 '2013-12-26', 'vigente'),

('España', 'estatal', NULL,
 'Sistema de Información Urbana (SIU)',
 'reglamento',
 'https://www.mivau.gob.es/urbanismo-y-suelo/sistema-de-informacion-urbana',
 'Ministerio de Transportes, Movilidad y Agenda Urbana',
 'Sistema estatal de información urbanística. Datos estadísticos y operativos.',
 'oficial_referencia', 'alta',
 NULL, 'vigente'),

('España', 'estatal', NULL,
 'SIU - Servicios OGC',
 'reglamento',
 'https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WFSServer',
 'Ministerio de Transportes',
 'Servicio WFS del SIU estatal. Consulta de datos urbanísticos en formato OGC.',
 'oficial_referencia', 'alta',
 NULL, 'vigente'),

('España', 'estatal', NULL,
 'IDEe - Servicio de Ocupación del Suelo IGN',
 'reglamento',
 'https://servicios.idee.es/wms-inspire/occupacion-suelo',
 'IGN / Instituto Geográfico Nacional',
 'WMS de ocupación del suelo a escala nacional. Capa INSPIRE Land Use.',
 'oficial_referencia', 'alta',
 NULL, 'vigente'),

('España', 'estatal', NULL,
 'Portal SIOSE',
 'reglamento',
 'https://www.mivau.gob.es/urbanismo-y-suelo/sistema-de-informacion-urbana/siose',
 'Ministerio de Transportes',
 'Sistema de Información sobre Ocupación del Suelo de España.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- ==========================================
-- LEGAL_SOURCES: Normativa autonómica (17 CCAA + Ceuta/Melilla)
-- ==========================================

-- Andalucía
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Andalucía', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'),
 'Ley 7/2007, de 13 de marzo, de Suelo de Andalucía',
 'ley',
 'https://www.boe.es/boe/dias/2007/04/14/pdfs/A16414-16459.pdf',
 'Junta de Andalucía',
 'Ley urbanística autonómica de Andalucía. Regula clasificación,calificación y sistema de ejecución.',
 'vinculante', 'alta',
 '2007-03-13', 'vigente'),
('Andalucía', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'),
 'BOJA - Boletín Oficial de la Junta de Andalucía',
 'boletin_autonomico',
 'https://www.juntadeandalucia.es/boja',
 'Junta de Andalucía',
 'Diario oficial de la comunidad autonómica. Publicación de normativa y actos administrativos urbanísticos.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Aragón
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Aragón', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Aragón'),
 'Ley 13/2015, de 9 de julio, de Suelo de Aragón',
 'ley',
 'https://www.boe.es/boe/dias/2015/07/31/pdfs/BOE-A-2015-8389.pdf',
 'Gobierno de Aragón',
 'Ley urbanística de Aragón. Clasificación, calificación y régimen urbanístico.',
 'vinculante', 'alta',
 '2015-07-09', 'vigente'),
('Aragón', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Aragón'),
 'BOA - Boletín Oficial de Aragón',
 'boletin_autonomico',
 'https://www.boa.aragon.es',
 'Gobierno de Aragón',
 'Diario oficial de Aragón.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Principado de Asturias
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Principado de Asturias', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Asturias'),
 'Decreto Legislativo 1/2004 - Norma territorial del Suelo del Principado de Asturias',
 'decreto_legislativo',
 'https://www.boe.es/boe/dias/2004/06/08/pdfs/A22505-22530.pdf',
 'Gobierno del Principado de Asturias',
 'Norma territorial del suelo asturiana. Clasificación y régimen urbanístico.',
 'vinculante', 'alta',
 '2004-05-27', 'vigente'),
('Principado de Asturias', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Asturias'),
 'BOPA - Boletín Oficial del Principado de Asturias',
 'boletin_autonomico',
 'https://www.bopa.asturias.es',
 'Gobierno del Principado de Asturias',
 'Diario oficial del Principado de Asturias.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Islas Baleares
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Islas Baleares', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Islas Baleares'),
 'Ley 12/2017, de 20 de diciembre, de suelo, ordenación territorial y urbanismo de las Islas Baleares',
 'ley',
 'https://www.boe.es/boe/dias/2018/01/12/pdfs/BOE-A-2018-321.pdf',
 'Gobierno de las Islas Baleares',
 'LOTUS balear. Ley integral de suelo y urbanismo.',
 'vinculante', 'alta',
 '2017-12-20', 'vigente'),
('Islas Baleares', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Islas Baleares'),
 'BOIB - Boletín Oficial de las Islas Baleares',
 'boletin_autonomico',
 'https://www.caib.es/bboib/',
 'Gobierno de las Islas Baleares',
 'Diario oficial de las Islas Baleares.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Canarias
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Canarias', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Canarias'),
 'Ley 19/2003, de 14 de abril, del Suelo y de los Espacios Naturales de Canarias',
 'ley',
 'https://www.boe.es/boe/dias/2003/05/10/pdfs/A17872-17909.pdf',
 'Gobierno de Canarias',
 'Ley de suelo canaria. Clasificación y régimen del suelo rústico y urbanizable.',
 'vinculante', 'alta',
 '2003-04-14', 'vigente'),
('Canarias', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Canarias'),
 'BOCA - Boletín Oficial de Canarias',
 'boletin_autonomico',
 'https://www.gobiernodecanarias.org/boc/',
 'Gobierno de Canarias',
 'Diario oficial de Canarias.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Cantabria
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Cantabria', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Cantabria'),
 'Ley 13/2015, de 3 de julio, de Modificación de la Ley 8/2004, de Suelo y Ordenación Territorial de Cantabria',
 'ley',
 'https://www.boe.es/boe/dias/2015/07/24/pdfs/BOE-A-2015-8261.pdf',
 'Gobierno de Cantabria',
 'Ley de suelo y ordenación territorial cántabra.',
 'vinculante', 'alta',
 '2015-07-03', 'vigente'),
('Cantabria', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Cantabria'),
 'BOC - Boletín Oficial de Cantabria',
 'boletin_autonomico',
 'https://www.boican.es',
 'Gobierno de Cantabria',
 'Diario oficial de Cantabria.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Castilla y León
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Castilla y León', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'),
 'Ley 5/2004, de 9 de diciembre, de Suelo y Urbanismo de Castilla y León',
 'ley',
 'https://www.boe.es/boe/dias/2005/01/06/pdfs/A0027-0056.pdf',
 'Junta de Castilla y León',
 'Ley de suelo y urbanismo cyL. Clasificación, calificación y ejecución.',
 'vinculante', 'alta',
 '2004-12-09', 'vigente'),
('Castilla y León', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'),
 'BOCyL - Boletín Oficial de Castilla y León',
 'boletin_autonomico',
 'https://www.bocyl.es',
 'Junta de Castilla y León',
 'Diario oficial de Castilla y León.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Castilla-La Mancha
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Castilla-La Mancha', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla-La Mancha'),
 'Ley 10/2001, de 27 de diciembre, de Suelo y Urbanismo de Castilla-La Mancha',
 'ley',
 'https://www.boe.es/boe/dias/2002/01/25/pdfs/A02839-02874.pdf',
 'Junta de Comunidades de Castilla-La Mancha',
 'Ley de suelo y urbanismo de Castilla-La Mancha.',
 'vinculante', 'alta',
 '2001-12-27', 'vigente'),
('Castilla-La Mancha', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla-La Mancha'),
 'DOCM - Diario Oficial de Castilla-La Mancha',
 'boletin_autonomico',
 'https://docm.jccm.es',
 'Junta de Comunidades de Castilla-La Mancha',
 'Diario oficial de Castilla-La Mancha.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Cataluña
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Cataluña', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'),
 'Ley 19/2003, de 4 de diciembre, régimen urbanístico y valoraciones de Cataluña',
 'ley',
 'https://www.boe.es/boe/dias/2004/01/10/pdfs/A1517-1552.pdf',
 'Generalitat de Catalunya',
 'TRLUOC. Ley urbanística catalana. Clasificación, calificación y disciplina urbanística.',
 'vinculante', 'alta',
 '2003-12-04', 'vigente'),
('Cataluña', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'),
 'DOGC - Diari Oficial de la Generalitat de Catalunya',
 'boletin_autonomico',
 'https://dogc.gencat.cat',
 'Generalitat de Catalunya',
 'Diario oficial de la Generalitat de Catalunya.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Extremadura
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Extremadura', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Extremadura'),
 'Ley 5/2004, de 19 de abril, de Suelo y Urbanismo de Extremadura',
 'ley',
 'https://www.boe.es/boe/dias/2004/05/22/pdfs/A18604-18634.pdf',
 'Junta de Extremadura',
 'Ley de suelo y urbanismo extremeña. Clasificación, calificación y unidades de actuación.',
 'vinculante', 'alta',
 '2004-04-19', 'vigente'),
('Extremadura', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Extremadura'),
 'DOE - Diario Oficial de Extremadura',
 'boletin_autonomico',
 'https://doe.juntaextremadura.net',
 'Junta de Extremadura',
 'Diario oficial de Extremadura.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Galicia
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Galicia', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Galicia'),
 'Ley 2/2016, de 10 de febrero, del suelo de Galicia',
 'ley',
 'https://www.boe.es/boe/dias/2016/03/01/pdfs/BOE-A-2016-2098.pdf',
 'Xunta de Galicia',
 'Ley gallega de suelo. Clasificación y régimen urbanístico.',
 'vinculante', 'alta',
 '2016-02-10', 'vigente'),
('Galicia', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Galicia'),
 'DOG - Diario Oficial de Galicia',
 'boletin_autonomico',
 'https://www.xunta.gal/dog',
 'Xunta de Galicia',
 'Diario oficial de Galicia.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Comunidad de Madrid
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Comunidad de Madrid', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad de Madrid'),
 'Decreto Legislativo 1/2010, de 21 de octubre, Texto Refundido de la Ley de Suelo y Rehabilitación Urbana de la Comunidad de Madrid',
 'decreto_legislativo',
 'https://www.boe.es/boe/dias/2010/11/20/pdfs/BOE-A-2010-17636.pdf',
 'Gobierno de la Comunidad de Madrid',
 'TRLSURM. Regime urbanístico de la Comunidad de Madrid.',
 'vinculante', 'alta',
 '2010-10-21', 'vigente'),
('Comunidad de Madrid', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad de Madrid'),
 'DOCM - Diario Oficial de la Comunidad de Madrid',
 'boletin_autonomico',
 'https://www.comunidad.madrid/gobierno/diario-oficial-comunidad-madrid',
 'Gobierno de la Comunidad de Madrid',
 'Diario oficial de la Comunidad de Madrid.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Región de Murcia
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Región de Murcia', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Región de Murcia'),
 'Ley 13/2015, de 31 de marzo, de Suelo y Urbanismo de la Región de Murcia',
 'ley',
 'https://www.boe.es/boe/dias/2015/04/23/pdfs/BOE-A-2015-4582.pdf',
 'CARM - Comunidad Autónoma de la Región de Murcia',
 'Ley de suelo y urbanismo murciana.',
 'vinculante', 'alta',
 '2015-03-31', 'vigente'),
('Región de Murcia', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Región de Murcia'),
 'BORM - Boletín Oficial de la Región de Murcia',
 'boletin_autonomico',
 'https://www.borm.es',
 'CARM',
 'Diario oficial de la Región de Murcia.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Comunidad Foral de Navarra
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Comunidad Foral de Navarra', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad Foral de Navarra'),
 'Ley Foral 1/2017, de 24 de febrero, de Modificación de la Ley Foral 35/2005 del Suelo',
 'ley',
 'https://www.boe.es/boe/dias/2017/03/21/pdfs/BOE-A-2017-3053.pdf',
 'Gobierno de Navarra',
 'Modificación de la ley foral de suelo navarra.',
 'vinculante', 'alta',
 '2017-02-24', 'vigente'),
('Comunidad Foral de Navarra', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad Foral de Navarra'),
 'BON - Boletín Oficial de Navarra',
 'boletin_autonomico',
 'https://www.bon.navarra.es',
 'Gobierno de Navarra',
 'Diario oficial de Navarra.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- País Vasco
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('País Vasco', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'País Vasco'),
 'Ley 1/2010, de 1 de julio, de Suelo y Urbanismo del País Vasco',
 'ley',
 'https://www.boe.es/boe/dias/2010/07/23/pdfs/BOE-A-2010-11203.pdf',
 'Gobierno Vasco / Eusko Jaurlaritza',
 'Ley de suelo y urbanismo del País Vasco (LSOU). Clasificación, calificación y ejecución.',
 'vinculante', 'alta',
 '2010-07-01', 'vigente'),
('País Vasco', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'País Vasco'),
 'BOPV - Boletín Oficial del País Vasco / EHAA',
 'boletin_autonomico',
 'https://www.heiduskutza.euskadi.eus/bopv/',
 'Gobierno Vasco',
 'Diario oficial del País Vasco.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Comunitat Valenciana
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Comunitat Valenciana', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunitat Valenciana'),
 'Ley 5/2014, de 25 de julio, de Ordenación del Territorio, Urbanismo y Paisaje de la Comunitat Valenciana',
 'ley',
 'https://www.boe.es/boe/dias/2014/08/23/pdfs/BOE-A-2014-8811.pdf',
 'Generalitat Valenciana',
 'LOTUP valenciana. Ley integral de ordenación territorial y urbanismo.',
 'vinculante', 'alta',
 '2014-07-25', 'vigente'),
('Comunitat Valenciana', 'autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunitat Valenciana'),
 'DOGV - Diari Oficial de la Generalitat Valenciana',
 'boletin_autonomico',
 'https://www.gva.es/es/documentacion/dogv',
 'Generalitat Valenciana',
 'Diario oficial de la Generalitat Valenciana.',
 'oficial_referencia', 'alta',
 NULL, 'vigente');

-- Ceuta
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Ceuta', 'autonomico',
 NULL,
 'Legislación urbanística aplicable a Ceuta (régimen foral especial)',
 'ley',
 NULL,
 'Ciudad Autónoma de Ceuta',
 'Ceuta se rige por legislación básica estatal + normativa especial. Sin ley urbanística propia diferenciada.',
 'vinculante', 'media',
 NULL, 'vigente'),
('Ceuta', 'autonomico',
 NULL,
 'BOCCE - Boletín Oficial de la Ciudad Autónoma de Ceuta',
 'boletin_autonomico',
 'https://www.ceuta.es/boletin',
 'Ciudad Autónoma de Ceuta',
 'Diario oficial de Ceuta.',
 'oficial_referencia', 'media',
 NULL, 'vigente');

-- Melilla
INSERT INTO legal_sources (territory, level, community_id, name, type, url, authority, description, legal_value, priority, publication_date, status) VALUES
('Melilla', 'autonomico',
 NULL,
 'Legislación urbanística aplicable a Melilla (régimen foral especial)',
 'ley',
 NULL,
 'Ciudad Autónoma de Melilla',
 'Melilla se rige por legislación básica estatal + normativa especial. Sin ley urbanística propia diferenciada.',
 'vinculante', 'media',
 NULL, 'vigente'),
('Melilla', 'autonomico',
 NULL,
 'BORM - Boletín Oficial de la Ciudad Autónoma de Melilla',
 'boletin_autonomico',
 'https://www.melilla.es/borm',
 'Ciudad Autónoma de Melilla',
 'Diario oficial de Melilla.',
 'oficial_referencia', 'media',
 NULL, 'vigente');

-- ==========================================
-- GEO_SERVICES: Servicios geoespaciales estatales
-- ==========================================

INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('España', 'estatal',
 'IDEe Ocupación del Suelo', 'WMS',
 'https://servicios.idee.es/wms-inspire/occupacion-suelo',
 'https://servicios.idee.es/wms-inspire/occupacion-suelo?SERVICE=WMS&REQUEST=GetCapabilities',
 'IGN - Instituto Geográfico Nacional',
 'land_cover', 'ocupacion_suelo',
 ARRAY['siose', 'ocupacion_suelo', 'inspire', 'land_use', 'ign'],
 'confirmed', 'oficial_referencia',
 'WMS nacional de ocupación del suelo del IGN/IDEE. Capa INSPIRE Land Use.'),

('España', 'estatal',
 'SIU Servicios OGC', 'WFS',
 'https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WFSServer',
 'https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WFSServer?SERVICE=WFS&REQUEST=GetCapabilities',
 'Ministerio de Transportes, Movilidad y Agenda Urbana',
 'urbanismo', 'siu',
 ARRAY['siu', 'urbanismo', 'ministerio', 'wfs'],
 'confirmed', 'oficial_referencia',
 'Servicio WFS del Sistema de Información Urbana estatal.'),

('España', 'estatal',
 'SIU MapServer', 'WMS',
 'https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WMSServer',
 'https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WMSServer?SERVICE=WMS&REQUEST=GetCapabilities',
 'Ministerio de Transportes',
 'urbanismo', 'siu',
 ARRAY['siu', 'urbanismo', 'wms'],
 'confirmed', 'oficial_referencia',
 'WMS del SIU estatal.'),

('España', 'estatal',
 'Portal SIOSE Datos Abiertos', 'visor',
 'https://www.mivau.gob.es/urbanismo-y-suelo/sistema-de-informat
ion-urbana/siose',
 NULL,
 'Ministerio de Transportes',
 'land_cover', 'siose',
 ARRAY['siose', 'datos_abiertos', 'ocupacion_suelo'],
 'confirmed', 'oficial_referencia',
 'Portal de datos abiertos SIOSE. No es un servicio OGC directo, sino visor de descubrimiento.');

-- ==========================================
-- GEO_SERVICES: Servicios geoespaciales autonómicos
-- ==========================================

-- Andalucía
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Andalucía', 'autonomico',
 'IDEAndalucía MTA400v', 'WMS',
 'https://www.ideandalucia.es/wms/mta400v_ras',
 'https://www.ideandalucia.es/wms/mta400v_ras?SERVICE=WMS&REQUEST=GetCapabilities',
 'IECA - Instituto de Estadística y Cartografía de Andalucía',
 'clasificacion_suelo', 'planeamiento',
 ARRAY['andalucia', 'ideandalucia', 'clasificacion_suelo', 'planeamiento'],
 'confirmed', 'informativo',
 'WMS de Andalucía. Requiere probing para capas urbanísticas específicas.');

-- Aragón
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Aragón', 'autonomico',
 'SIUa WMS - Sistema de Información Urbanística de Aragón', 'WMS',
 'https://icearagon.aragon.es/SIUa_WMS',
 'https://icearagon.aragon.es/SIUa_WMS?SERVICE=WMS&REQUEST=GetCapabilities',
 'Gobierno de Aragón / ICE',
 'urbanismo', 'siua',
 ARRAY['aragon', 'siua', 'urbanismo', 'clasificacion_suelo'],
 'confirmed', 'oficial_referencia',
 'WMS del SIU de Aragón. Consulta de planeamiento y clasificación del suelo.'),

('Aragón', 'autonomico',
 'SIOSE Aragón ArcGIS', 'WMS',
 'https://servicios.arcgis.com/rnbLGQsFGs8dmAZj/arcgis/services/SIOSE_Aragon/MapServer/WMS',
 'https://servicios.arcgis.com/rnbLGQsFGs8dmAZj/arcgis/services/SIOSE_Aragon/MapServer/WMS?SERVICE=WMS&REQUEST=GetCapabilities',
 'Gobierno de Aragón',
 'land_cover', 'siose',
 ARRAY['aragon', 'siose', 'ocupacion_suelo'],
 'confirmed', 'informativo',
 'SIOSE autonómico de Aragón vía ArcGIS.');

-- Asturias
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Asturias', 'autonomico',
 'Visor RPGUR Entidades Urbanísticas', 'WMS',
 'http://visorrpgur.asturias.es:8090/geoserver/E79_ENTIDADES_URBANISTICAS/wms',
 'http://visorrpgur.asturias.es:8090/geoserver/E79_ENTIDADES_URBANISTICAS/wms?SERVICE=WMS&REQUEST=GetCapabilities',
 'Gobierno del Principado de Asturias',
 'urbanismo', 'entidades_urbanisticas',
 ARRAY['asturias', 'entidades_urbanisticas', 'planeamiento', 'sectores'],
 'confirmed', 'informativo',
 'WMS de entidades urbanísticas del Principado de Asturias.');

-- Baleares
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Islas Baleares', 'autonomico',
 'MUIB - Visor Urbanístico Insular', 'visor',
 'https://muib.caib.es/mapurbibfront/visor_index.jsp',
 NULL,
 'Consell Insular de Mallorca / CAIB',
 'urbanismo', 'planeamiento_insular',
 ARRAY['baleares', 'muib', 'planeamiento', 'mallorca', 'insular'],
 'confirmed', 'informativo',
 'Visor de planeamiento urbanístico insular de Baleares. No es WMS directo.'),

('Islas Baleares', 'autonomico',
 'SQM CAIB', 'WMS',
 'https://sqm.caib.es/sqms/wms',
 'https://sqm.caib.es/sqms/wms?SERVICE=WMS&REQUEST=GetCapabilities',
 'CAIB',
 'land_cover', 'siose',
 ARRAY['baleares', 'sqm', 'siose', 'ocupacion_suelo'],
 'confirmed', 'informativo',
 'Servicio dequalities medioambientales de Baleares.');

-- Canarias
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Canarias', 'autonomico',
 'IDECAN - Ocupación del Suelo', 'WMS',
 'https://idelectron.canarias.es/wms/ground',
 'https://idelectron.canarias.es/wms/ground?SERVICE=WMS&REQUEST=GetCapabilities',
 'Gobierno de Canarias / IDElectron',
 'land_cover', 'ocupacion_suelo',
 ARRAY['canarias', 'idecan', 'ocupacion_suelo', 'ground'],
 'confirmed', 'informativo',
 'WMS de ocupación del suelo de Canarias.');

-- Cantabria
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Cantabria', 'autonomico',
 'IDECAN Cantabria', 'WMS',
 'https://sitcantabria.cantabria.es/wms/CNT100',
 'https://sitcantabria.cantabria.es/wms/CNT100?SERVICE=WMS&REQUEST=GetCapabilities',
 'Gobierno de Cantabria',
 'land_cover', 'cartografia_base',
 ARRAY['cantabria', 'idecan', 'cartografia'],
 'confirmed', 'informativo',
 'WMS base de Cantabria. Requiere probing para capas urbanísticas.');

-- Castilla y León
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Castilla y León', 'autonomico',
 'IDECyL Urbanismo', 'WMS',
 'https://idecyl.jcyl.es/geoserver/urbanismo/wms',
 'https://idecyl.jcyl.es/geoserver/urbanismo/wms?SERVICE=WMS&REQUEST=GetCapabilities',
 'Junta de Castilla y León / IDECyL',
 'urbanismo', 'clasificacion_suelo',
 ARRAY['castilla_y_leon', 'idecyl', 'urbanismo', 'clasificacion_suelo', 'clases_suelo', 'categorias_suelo'],
 'confirmed', 'oficial_referencia',
 'WMS de urbanismo de IDECyL. Publica capas de clases y categorías del suelo.'),

('Castilla y León', 'autonomico',
 'IDECyL Urbanismo ArcGIS', 'WMS',
 'https://servicios.jcyl.es/arcgis/services/Urbanismo/MapServer/WMSServer',
 'https://servicios.jcyl.es/arcgis/services/Urbanismo/MapServer/WMSServer?SERVICE=WMS&REQUEST=GetCapabilities',
 'Junta de Castilla y León',
 'urbanismo', 'planeamiento',
 ARRAY['castilla_y_leon', 'urbanismo', 'arcgis'],
 'confirmed', 'informativo',
 'WMS urbanismo vía ArcGIS de CyL.');

-- Castilla-La Mancha
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Castilla-La Mancha', 'autonomico',
 'IDEKepler SIGCarreteros', 'WMS',
 'https://idekepler.jccm.es/arcgis/services/SIGCARRETEROS/MapServer/WMS',
 'https://idekepler.jccm.es/arcgis/services/SIGCARRETEROS/MapServer/WMS?SERVICE=WMS&REQUEST=GetCapabilities',
 'Junta de Comunidades de Castilla-La Mancha',
 'infraestructuras', 'carreteras',
 ARRAY['castilla_la_mancha', 'idekepler', 'carreteras'],
 'confirmed', 'informativo',
 'WMS de infraestructuras de CLM. Requiere probing para urbanismo específico.');

-- Cataluña
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Cataluña', 'autonomico',
 'SIG Planejament Urbanístic de Catalunya', 'WMS',
 'https://sig.gencat.cat/ows/PLANEJAMENT/wms',
 'https://sig.gencat.cat/ows/PLANEJAMENT/wms?SERVICE=WMS&REQUEST=GetCapabilities',
 'ICGC / Generalitat de Catalunya',
 'urbanismo', 'planeamiento',
 ARRAY['cataluna', 'planejament', 'urbanismo', 'clasificacion', 'calificacion', 'sectores'],
 'confirmed', 'oficial_referencia',
 'WMS principal de planeamiento de Cataluña. Capas: classificacions, qualificacions, sectors, PDUSC.'),

('Cataluña', 'autonomico',
 'SIG Planejament WFS', 'WFS',
 'https://sig.gencat.cat/ows/PLANEJAMENT/wfs',
 'https://sig.gencat.cat/ows/PLANEJAMENT/wfs?SERVICE=WFS&REQUEST=GetCapabilities',
 'ICGC / Generalitat de Catalunya',
 'urbanismo', 'planeamiento',
 ARRAY['cataluna', 'planejament', 'wfs', 'urbanismo'],
 'confirmed', 'oficial_referencia',
 'WFS de planeamiento de Cataluña. Consulta vectorial.');

-- Extremadura
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Extremadura', 'autonomico',
 'IDEEXTREME DURA - Urbanismo', 'WMS',
 'https://ideextremadura.es/wms/iter',
 'https://ideextremadura.es/wms/iter?SERVICE=WMS&REQUEST=GetCapabilities',
 'Junta de Extremadura',
 'urbanismo', 'clases_categorias',
 ARRAY['extremadura', 'urbanismo', 'clases_suelo', 'categorias_suelo', 'calificaciones', 'unidades_actuacion'],
 'confirmed', 'oficial_referencia',
 'WMS de urbanismo de Extremadura. Identifica expresamente clases, categorías, calificaciones y unidades de actuación.'),

('Extremadura', 'autonomico',
 'IDEEXTREME DURA Urbanismo CICTEX', 'visor',
 'http://www.ideextremadura.com/CICTEX/urbanismo',
 NULL,
 'Junta de Extremadura',
 'urbanismo', 'cictex',
 ARRAY['extremadura', 'cictex', 'urbanismo'],
 'confirmed', 'informativo',
 'Visor CICTEX de urbanismo de Extremadura.');

-- Galicia
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Galicia', 'autonomico',
 'SIOTUGA - Sistema de Información Urbanística de Galicia', 'WMS',
 'https://siotuga.xunta.gal/siotuga/urb',
 'https://siotuga.xunta.gal/siotuga/urb?SERVICE=WMS&REQUEST=GetCapabilities',
 'Xunta de Galicia',
 'urbanismo', 'siotuga',
 ARRAY['galicia', 'siotuga', 'urbanismo', 'planeamiento', 'municipal'],
 'confirmed', 'oficial_referencia',
 'SIOTUGA. Ofrece consulta y publicación WMS por municipio.'),

('Galicia', 'autonomico',
 'POL Planeamiento Urbanístico', 'WMS',
 'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/WmsServer',
 'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/WmsServer?SERVICE=WMS&REQUEST=GetCapabilities',
 'Xunta de Galicia / IDEG',
 'urbanismo', 'planeamiento',
 ARRAY['galicia', 'ideg', 'planeamiento', 'pol'],
 'confirmed', 'oficial_referencia',
 'WMS de planeamiento urbanístico de Galicia (POL).'),

('Galicia', 'autonomico',
 'POL Usos', 'WMS',
 'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_Usos/MapServer/WmsServer',
 'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_Usos/MapServer/WmsServer?SERVICE=WMS&REQUEST=GetCapabilities',
 'Xunta de Galicia / IDEG',
 'usos_suelo', 'usos',
 ARRAY['galicia', 'ideg', 'usos', 'pol'],
 'confirmed', 'oficial_referencia',
 'WMS de usos del suelo de Galicia.');

-- La Rioja
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('La Rioja', 'autonomico',
 'Geoportal La Rioja', 'visor',
 'https://www.larioja SIG.es',
 NULL,
 'Gobierno de La Rioja',
 'land_cover', 'cartografia',
 ARRAY['la_rioja', 'geoportal', 'cartografia'],
 'pending', 'informativo',
 'Geoportal de La Rioja. Endpoint pendiente de verificación.');

-- Comunidad de Madrid
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Comunidad de Madrid', 'autonomico',
 'Visor SIT - Sistema de Información Territorial', 'visor',
 'https://www.comunidad.madrid/medio-ambiente/sistema-informacion-territorial-visor-sit',
 NULL,
 'Gobierno de la Comunidad de Madrid',
 'urbanismo', 'sit',
 ARRAY['madrid', 'sit', 'urbanismo', 'territorial'],
 'confirmed', 'informativo',
 'Visor SIT de Madrid. La propia Comunidad advierte que no sustituye al expediente aprobado.'),

('Comunidad de Madrid', 'autonomico',
 'IDEM - Infraestructura de Datos Espaciales de Madrid', 'WMS',
 'https://www.comunidad.madrid/cartografia/geoserver/ows',
 'https://www.comunidad.madrid/cartografia/geoserver/ows?SERVICE=WMS&REQUEST=GetCapabilities',
 'Gobierno de la Comunidad de Madrid',
 'land_cover', 'cartografia',
 ARRAY['madrid', 'idem', 'geoserver', 'cartografia'],
 'confirmed', 'informativo',
 'Geoserver IDEM de Madrid.'),

('Comunidad de Madrid', 'autonomico',
 'IDEM Cartografía', 'visor',
 'https://idem.madrid.org/cartografia/sitcm/html/visor.htm',
 NULL,
 'Gobierno de la Comunidad de Madrid',
 'urbanismo', 'idem',
 ARRAY['madrid', 'idem', 'cartografia'],
 'confirmed', 'informativo',
 'Visor IDEM de cartografía de Madrid.');

-- Región de Murcia
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Región de Murcia', 'autonomico',
 'SIT Planeamiento Urbano CARM', 'WMS',
 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wms',
 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wms?SERVICE=WMS&REQUEST=GetCapabilities',
 'CARM',
 'urbanismo', 'planeamiento',
 ARRAY['murcia', 'sit', 'planeamiento', 'urbano'],
 'confirmed', 'oficial_referencia',
 'WMS de planeamiento urbano de Murcia.'),

('Región de Murcia', 'autonomico',
 'SIT PLU CARM', 'WMS',
 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/wms',
 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/wms?SERVICE=WMS&REQUEST=GetCapabilities',
 'CARM',
 'urbanismo', 'plu',
 ARRAY['murcia', 'sit', 'plu', 'planeamiento'],
 'confirmed', 'oficial_referencia',
 'WMS de Plan de Ordenación Local de Murcia.'),

('Región de Murcia', 'autonomico',
 'SIT Planeamiento Urbano CARM WFS', 'WFS',
 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs',
 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs?SERVICE=WFS&REQUEST=GetCapabilities',
 'CARM',
 'urbanismo', 'planeamiento',
 ARRAY['murcia', 'sit', 'wfs', 'planeamiento'],
 'confirmed', 'oficial_referencia',
 'WFS de planeamiento urbano de Murcia.'),

('Región de Murcia', 'autonomico',
 'SIT PLU CARM WFS', 'WFS',
 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/wfs',
 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/wfs?SERVICE=WFS&REQUEST=GetCapabilities',
 'CARM',
 'urbanismo', 'plu',
 ARRAY['murcia', 'sit', 'wfs', 'plu'],
 'confirmed', 'oficial_referencia',
 'WFS de PLU de Murcia. Modelo INSPIRE Planned Land Use.');

-- Comunidad Foral de Navarra
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Comunidad Foral de Navarra', 'autonomico',
 'IDENA WMS', 'WMS',
 'https://idena.navarra.es/ogc/wms',
 'https://idena.navarra.es/ogc/wms?SERVICE=WMS&REQUEST=GetCapabilities',
 'Gobierno de Navarra / IDENA',
 'urbanismo', 'clasificacion_suelo',
 ARRAY['navarra', 'idena', 'urbanismo', 'clasificacion_suelo', 'usos', 'sectores'],
 'confirmed', 'oficial_referencia',
 'WMS principal de IDENA. Capas de tipos de usos del suelo y sectores EDUSI.');

-- País Vasco
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('País Vasco', 'autonomico',
 'geoEuskadi WMS Plangintza', 'WMS',
 'https://www.geo.euskadi.eus/WMS_PLANGINTZA',
 'https://www.geo.euskadi.eus/WMS_PLANGINTZA?SERVICE=WMS&REQUEST=GetCapabilities',
 'Gobierno Vasco',
 'urbanismo', 'planeamiento',
 ARRAY['pais_vasco', 'geo_euskadi', 'plangintza', 'planeamiento', 'urbanismo'],
 'confirmed', 'oficial_referencia',
 'WMS de planeamiento del País Vasco (Plangintza).'),

('País Vasco', 'autonomico',
 'geoEuskadi MapServer SRS', 'WMS',
 'https://www.geo.euskadi.eus/mapserver/serviciossrs',
 'https://www.geo.euskadi.eus/mapserver/serviciossrs?SERVICE=WMS&REQUEST=GetCapabilities',
 'Gobierno Vasco',
 'land_cover', 'cartografia',
 ARRAY['pais_vasco', 'geo_euskadi', 'srs', 'cartografia'],
 'confirmed', 'informativo',
 'WMS de servicios de referencia espacial de geoEuskadi.');

-- Comunitat Valenciana
INSERT INTO geo_services (ccaa, scope, service_name, service_type, url, get_capabilities_url, provider, theme, subtheme, keywords, endpoint_status, legal_value, notes) VALUES
('Comunitat Valenciana', 'autonomico',
 'GeneRIGV - IDE Generalitat Valenciana', 'visor',
 'https://dadesobertes.gva.es/arcgis/services',
 'https://dadesobertes.gva.es/arcgis/services?SERVICE=WMS&REQUEST=GetCapabilities',
 'Generalitat Valenciana',
 'land_cover', 'datos_abiertos',
 ARRAY['valencia', 'generigv', 'datos_abiertos', 'arcgis'],
 'pending', 'informativo',
 'Servicios ArcGIS de la Generalitat Valenciana. Endpoint pendiente de probing para urbanismo.');

-- ==========================================
-- GEO_LAYERS: Capas de servicios estatales (SIOSE y ocupación del suelo)
-- ==========================================

-- Ocupación del suelo IGN/IDEE
INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'LU.Uses44.LandAreas',
       'Ocupación del suelo - Usos del suelo',
       ARRAY['siose', 'ocupacion_suelo', 'land_use', 'inspire'],
       'ocupacion_suelo',
       'land_use',
       true,
       'Capa INSPIRE de usos del suelo del WMS IDEe.'
FROM geo_services gs WHERE gs.service_name = 'IDEe Ocupación del Suelo'
LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'LU.Cover29.LandCoverObjects',
       'Cobertura del suelo - Objetos de cobertura',
       ARRAY['siose', 'land_cover', 'inspire'],
       'siose',
       'land_cover',
       true,
       'Capa INSPIRE de cobertura del suelo.'
FROM geo_services gs WHERE gs.service_name = 'IDEe Ocupación del Suelo'
LIMIT 1;

-- ==========================================
-- GEO_LAYERS: Capas de servicios autonómicos
-- ==========================================

-- Cataluña - Planejament (capas principales)
INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'MUC_CLASSIFICACIONS',
       'Classificacions del sòl',
       ARRAY['cataluna', 'clasificacion_suelo', 'suelo'],
       'clasificacion_suelo',
       'land_cover',
       true,
       'Clasificación del suelo municipal de Cataluña.'
FROM geo_services gs WHERE gs.service_name = 'SIG Planejament Urbanístic de Catalunya'
LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'MUC_QUALIFICACIONS',
       'Qualificacions urbanístiques',
       ARRAY['cataluna', 'calificacion_urbanistica', 'usos'],
       'calificacion_urbanistica',
       'urban_zone',
       true,
       'Calificaciones urbanísticas de Cataluña.'
FROM geo_services gs WHERE gs.service_name = 'SIG Planejament Urbanístic de Catalunya'
LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'MUC_AMBIT_MUNICIPAL',
       'Àmbit municipal',
       ARRAY['cataluna', 'municipio', 'ambito'],
       'planeamiento_general',
       'municipal_plan',
       true,
       'Ámbito municipal del planeamiento de Cataluña.'
FROM geo_services gs WHERE gs.service_name = 'SIG Planejament Urbanístic de Catalunya'
LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'PLANEJAMENT_GENERAL_VIGENT',
       'Planejament general vigent',
       ARRAY['cataluna', 'planeamiento', 'general', 'vigente'],
       'planeamiento_general',
       'municipal_plan',
       true,
       'Planeamiento general vigente de Cataluña.'
FROM geo_services gs WHERE gs.service_name = 'SIG Planejament Urbanístic de Catalunya'
LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'PLANEJAMENT_PDUSC_SECTORS',
       'PDUSC - Sectors',
       ARRAY['cataluna', 'sector', 'pdusc', 'planeamiento'],
       'sector',
       'planning_sector',
       true,
       'Sectores del PDUSC de Cataluña.'
FROM geo_services gs WHERE gs.service_name = 'SIG Planejament Urbanístic de Catalunya'
LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'MUC_PDERIVAT_QUALIFICACIO',
       'Qualificació derivada',
       ARRAY['cataluna', 'calificacion', 'derivada'],
       'calificacion_urbanistica',
       'urban_zone',
       true,
       'Calificación derivada de Cataluña.'
FROM geo_services gs WHERE gs.service_name = 'SIG Planejament Urbanístic de Catalunya'
LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'MUC_SECTOR_DESENVOLUPAMENT',
       'Sector de desenvolupament',
       ARRAY['cataluna', 'sector', 'desarrollo'],
       'sector',
       'planning_sector',
       true,
       'Sector de desarrollo de Cataluña.'
FROM geo_services gs WHERE gs.service_name = 'SIG Planejament Urbanístic de Catalunya'
LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'MUC_XARXA_PROJECTADA',
       'Xarxa projectada',
       ARRAY['cataluna', 'infraestructuras', 'red'],
       'infraestructuras',
       'infrastructure',
       false,
       'Red projectada de infraestructuras de Cataluña.'
FROM geo_services gs WHERE gs.service_name = 'SIG Planejament Urbanístic de Catalunya'
LIMIT 1;

-- Navarra - IDENA
INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'IDENA_Suelo_TiposUsosSuelo',
       'Tipos de usos del suelo',
       ARRAY['navarra', 'idena', 'usos_suelo', 'clasificacion'],
       'usos_suelo',
       'land_use',
       true,
       'Tipos de usos del suelo de Navarra (IDENA).'
FROM geo_services gs WHERE gs.service_name = 'IDENA WMS'
LIMIT 1;

INSERT INTO geo_layers (service_id, layer_name, layer_title, keywords, thematic_category, internal_taxonomy, queryable, notes)
SELECT gs.id,
       'IDENA_PlanificacionEstructural_SectoresEDUSI',
       'Planificación estructural - Sectores EDUSI',
       ARRAY['navarra', 'idena', 'sector', 'edusi', 'planificacion'],
       'sector',
       'planning_sector',
       true,
       'Sectores EDUSI de Navarra.'
FROM geo_services gs WHERE gs.service_name = 'IDENA WMS'
LIMIT 1;
