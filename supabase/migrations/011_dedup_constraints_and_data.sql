-- Migration 011: Deduplicación, restricciones, normativa autonómica y ampliación de municipios
-- Part 1: Eliminar duplicados de las tablas semilla
-- Part 2: Añadir restricciones UNIQUE para prevenir futuros duplicados
-- Part 3: Añadir normativa autonómica para las 11 CCAA que faltan
-- Part 4: Añadir los 100 municipios más poblados de España

-- ==========================================
-- PARTE 1: ELIMINAR DUPLICADOS
-- ==========================================

-- Fuentes geoportales: mantener solo una por combinación nombre+url
DELETE FROM fuentes_geoportales
WHERE id NOT IN (
  SELECT MIN(id) FROM fuentes_geoportales GROUP BY nombre, url
);

-- Capas WMS: mantener solo una por combinación comunidad_autonoma_id+nombre_capa+url_servicio
DELETE FROM capas_wms
WHERE id NOT IN (
  SELECT MIN(id) FROM capas_wms GROUP BY comunidad_autonoma_id, nombre_capa, url_servicio
);

-- Normativa vigente: mantener solo una por combinación titulo+referencia_legal
DELETE FROM normativa_vigente
WHERE id NOT IN (
  SELECT MIN(id) FROM normativa_vigente GROUP BY titulo, referencia_legal
);

-- ==========================================
-- PARTE 2: AÑADIR RESTRICCIONES UNIQUE
-- ==========================================

ALTER TABLE fuentes_geoportales ADD CONSTRAINT uq_fuentes_nombre_url UNIQUE (nombre, url);
ALTER TABLE capas_wms ADD CONSTRAINT uq_capas_ccaa_nombre_url UNIQUE (comunidad_autonoma_id, nombre_capa, url_servicio);
ALTER TABLE normativa_vigente ADD CONSTRAINT uq_normativa_titulo_ref UNIQUE (titulo, referencia_legal);

-- ==========================================
-- PARTE 3: NORMATIVA AUTONÓMICA — 11 CCAA FALTANTES
-- ==========================================

-- 1. Galicia
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Galicia'),
 'Ley del Suelo de Galicia',
 'Ley 2/2016, del 10 de febrero, del suelo de Galicia',
 '2016-02-16',
 'https://www.boe.es/boe/dias/2016/03/05/pdfs/BOE-A-2016-2371.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 2. Castilla y León
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'),
 'Ley de Suelo y Urbanismo de Castilla y León',
 'Ley 8/2001, de 13 de diciembre, de Suelo y Urbanismo de Castilla y León',
 '2012-12-14',
 'https://www.boe.es/boe/dias/2002/01/19/pdfs/BOE-A-2002-1327.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 3. Castilla-La Mancha
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla-La Mancha'),
 'Ley de Suelo y Urbanismo de Castilla-La Mancha',
 'Ley 9/2006, de 28 de diciembre, de Suelo y Urbanismo de Castilla-La Mancha',
 '2006-12-29',
 'https://www.boe.es/boe/dias/2007/01/24/pdfs/BOE-A-2007-1601.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 4. Canarias
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Canarias'),
 'Ley de Suelo de Canarias',
 'Ley 4/1997, de 4 de diciembre, de Suelo de Canarias',
 '1997-12-05',
 'https://www.boe.es/boe/dias/1998/01/10/pdfs/BOE-A-1998-800.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 5. Islas Baleares
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Islas Baleares'),
 'Ley de Suelo de las Islas Baleares',
 'Ley 12/2017, de 26 de diciembre, de Suelo de las Islas Baleares',
 '2017-12-28',
 'https://www.boe.es/boe/dias/2018/01/10/pdfs/BOE-A-2018-233.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 6. Extremadura
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Extremadura'),
 'Ley del Suelo y Ordenación Territorial de Extremadura',
 'Ley 15/2001, de 14 de diciembre, del Suelo y Ordenación Territorial de Extremadura',
 '2001-12-15',
 'https://www.boe.es/boe/dias/2002/01/19/pdfs/BOE-A-2002-1337.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 7. Región de Murcia
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Región de Murcia'),
 'Ley de Ordenación del Territorio, Urbanismo y Paisaje de la Región de Murcia',
 'Ley 13/2015, de 31 de marzo, de Ordenación del Territorio, Urbanismo y Paisaje de la Región de Murcia',
 '2015-04-15',
 'https://www.boe.es/boe/dias/2015/04/15/pdfs/BOE-A-2015-4502.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 8. Comunidad Foral de Navarra
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad Foral de Navarra'),
 'Ley Foral de Urbanismo de Navarra',
 'Ley 35/2002, de 4 de diciembre, foral de Urbanismo de Navarra',
 '2002-12-05',
 'https://www.boe.es/boe/dias/2003/01/07/pdfs/BOE-A-2003-314.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 9. La Rioja
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'La Rioja'),
 'Ley de Suelo, Vivienda y Urbanismo de La Rioja',
 'Ley 8/2004, de 19 de octubre, de Suelo, Vivienda y Urbanismo de La Rioja',
 '2004-10-20',
 'https://www.boe.es/boe/dias/2004/11/13/pdfs/BOE-A-2004-1975.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 10. Cantabria
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Cantabria'),
 'Ley de Suelo y Régimen Urbanístico del Suelo de Cantabria',
 'Ley 2/2001, de 25 de junio, de Suelo y Régimen Urbanístico del Suelo de Cantabria',
 '2001-06-28',
 'https://www.boe.es/boe/dias/2001/07/25/pdfs/BOE-A-2001-13761.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- 11. Principado de Asturias
INSERT INTO normativa_vigente (ambito, comunidad_autonoma_id, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia)
VALUES
('autonomico',
 (SELECT id FROM comunidades_autonomas WHERE nombre = 'Asturias'),
 'Ley de Suelo del Principado de Asturias',
 'Ley 3/2002, de 22 de marzo, de Suelo del Principado de Asturias',
 '2002-03-25',
 'https://www.boe.es/boe/dias/2002/04/13/pdfs/BOE-A-2002-7344.pdf',
 'vigente')
ON CONFLICT ON CONSTRAINT uq_normativa_titulo_ref DO NOTHING;

-- ==========================================
-- PARTE 4: AMPLIACIÓN DE MUNICIPIOS (TOP 100 MÁS POBLADOS)
-- ==========================================
-- Se insertan los municipios de la lista del top 100.
-- Los que ya existen en la tabla se omiten automáticamente gracias a ON CONFLICT.

-- ANDALUCÍA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '11'), 'Jerez de la Frontera', '11036', 212915, ST_SetSRID(ST_MakePoint(-6.1380, 36.6934), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '11'), 'Algeciras', '11010', 122045, ST_SetSRID(ST_MakePoint(-5.4500, 36.1294), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '29'), 'Marbella', '29069', 149030, ST_SetSRID(ST_MakePoint(-4.8820, 36.5094), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '29'), 'Mijas', '29073', 87563, ST_SetSRID(ST_MakePoint(-4.6371, 36.5959), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '29'), 'Vélez-Málaga', '29098', 83408, ST_SetSRID(ST_MakePoint(-4.0333, 36.7833), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '29'), 'Fuengirola', '29063', 75654, ST_SetSRID(ST_MakePoint(-4.6264, 36.5399), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- ARAGÓN
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '50'), 'Zaragoza', '50297', 679601, ST_SetSRID(ST_MakePoint(-0.8891, 41.6488), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- ASTURIAS
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '33'), 'Gijón', '33024', 271843, ST_SetSRID(ST_MakePoint(-5.6614, 43.5322), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- ISLAS BALEARES
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '07'), 'Palma de Mallorca', '07040', 423350, ST_SetSRID(ST_MakePoint(2.6502, 39.5696), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- CANARIAS
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '38'), 'San Cristóbal de La Laguna', '38023', 158010, ST_SetSRID(ST_MakePoint(-16.3178, 28.4831), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '35'), 'Telde', '35028', 103616, ST_SetSRID(ST_MakePoint(-15.4162, 27.9927), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- CANTABRIA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '39'), 'Santander', '39075', 172044, ST_SetSRID(ST_MakePoint(-3.8100, 43.4647), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- CASTILLA Y LEÓN
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '05'), 'Ávila', '05019', 57964, ST_SetSRID(ST_MakePoint(-4.6995, 40.6561), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '09'), 'Burgos', '09059', 176618, ST_SetSRID(ST_MakePoint(-3.7038, 42.3439), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '24'), 'León', '24089', 124772, ST_SetSRID(ST_MakePoint(-5.5703, 42.5988), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '34'), 'Palencia', '34120', 78874, ST_SetSRID(ST_MakePoint(-4.5340, 42.0094), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '37'), 'Salamanca', '37317', 144124, ST_SetSRID(ST_MakePoint(-5.6646, 40.9701), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '40'), 'Segovia', '40191', 51830, ST_SetSRID(ST_MakePoint(-4.1173, 40.9486), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '42'), 'Soria', '42173', 39714, ST_SetSRID(ST_MakePoint(-2.4688, 41.7636), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '47'), 'Valladolid', '47186', 299265, ST_SetSRID(ST_MakePoint(-4.7245, 41.6523), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '49'), 'Zamora', '49270', 61724, ST_SetSRID(ST_MakePoint(-5.7402, 41.5034), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- CASTILLA-LA MANCHA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '02'), 'Albacete', '02003', 173329, ST_SetSRID(ST_MakePoint(-1.8585, 38.9942), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '13'), 'Ciudad Real', '13034', 76411, ST_SetSRID(ST_MakePoint(-3.9322, 38.9863), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '16'), 'Cuenca', '16078', 54495, ST_SetSRID(ST_MakePoint(-2.1314, 40.0704), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '19'), 'Guadalajara', '19130', 88866, ST_SetSRID(ST_MakePoint(-3.1672, 40.6337), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '45'), 'Toledo', '45169', 85811, ST_SetSRID(ST_MakePoint(-4.0273, 39.8628), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- CATALUÑA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Barcelona', '08019', 1664182, ST_SetSRID(ST_MakePoint(2.1734, 41.3851), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Terrassa', '08279', 224114, ST_SetSRID(ST_MakePoint(2.0140, 41.5634), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Sabadell', '08187', 213642, ST_SetSRID(ST_MakePoint(2.1102, 41.5433), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '25'), 'Lleida', '25121', 140767, ST_SetSRID(ST_MakePoint(0.6264, 41.6176), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '43'), 'Tarragona', '43148', 134515, ST_SetSRID(ST_MakePoint(1.2441, 41.1189), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '17'), 'Girona', '17079', 104604, ST_SetSRID(ST_MakePoint(2.8256, 41.9794), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Granollers', '08103', 121967, ST_SetSRID(ST_MakePoint(2.2881, 41.6081), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Cornellà de Llobregat', '08074', 90313, ST_SetSRID(ST_MakePoint(2.0724, 41.3580), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Manresa', '08125', 78012, ST_SetSRID(ST_MakePoint(1.8257, 41.7255), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Sant Boi de Llobregat', '08201', 83680, ST_SetSRID(ST_MakePoint(2.0403, 41.3459), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Rubí', '08183', 80693, ST_SetSRID(ST_MakePoint(2.0353, 41.4924), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '43'), 'Reus', '43123', 107118, ST_SetSRID(ST_MakePoint(1.1070, 41.1544), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- EXTREMADURA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '06'), 'Badajoz', '06015', 151240, ST_SetSRID(ST_MakePoint(-6.9706, 38.8794), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '10'), 'Cáceres', '10037', 96543, ST_SetSRID(ST_MakePoint(-6.3724, 39.4753), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '06'), 'Mérida', '06083', 59352, ST_SetSRID(ST_MakePoint(-6.3410, 38.9161), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- GALICIA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '15'), 'A Coruña', '15030', 247308, ST_SetSRID(ST_MakePoint(-8.4067, 43.3693), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '27'), 'Lugo', '27028', 98560, ST_SetSRID(ST_MakePoint(-7.5566, 43.0124), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '32'), 'Ourense', '32054', 105583, ST_SetSRID(ST_MakePoint(-7.8620, 42.3365), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '36'), 'Pontevedra', '36058', 83375, ST_SetSRID(ST_MakePoint(-8.6480, 42.4310), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '36'), 'Vigo', '36057', 296302, ST_SetSRID(ST_MakePoint(-8.7207, 42.2313), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '15'), 'Ferrol', '15039', 67686, ST_SetSRID(ST_MakePoint(-8.2398, 43.4897), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- LA RIOJA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '26'), 'Logroño', '26089', 151113, ST_SetSRID(ST_MakePoint(-2.4504, 42.4654), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- COMUNIDAD DE MADRID
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Madrid', '28079', 3305403, ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Alcalá de Henares', '28002', 196888, ST_SetSRID(ST_MakePoint(-3.3644, 40.4818), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Fuenlabrada', '28066', 194171, ST_SetSRID(ST_MakePoint(-3.7940, 40.2842), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Leganés', '28088', 189868, ST_SetSRID(ST_MakePoint(-3.7589, 40.3283), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Getafe', '28082', 183374, ST_SetSRID(ST_MakePoint(-3.7324, 40.3048), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Torrejón de Ardoz', '28148', 136755, ST_SetSRID(ST_MakePoint(-3.4776, 40.4559), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Parla', '28162', 131895, ST_SetSRID(ST_MakePoint(-3.7745, 40.2368), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Las Rozas de Madrid', '28123', 131594, ST_SetSRID(ST_MakePoint(-3.8734, 40.4928), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Alcobendas', '28006', 119883, ST_SetSRID(ST_MakePoint(-3.6396, 40.5372), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'San Sebastián de los Reyes', '28141', 94750, ST_SetSRID(ST_MakePoint(-3.5611, 40.5553), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Coslada', '28045', 91795, ST_SetSRID(ST_MakePoint(-3.5637, 40.4263), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Pozuelo de Alarcón', '28171', 87808, ST_SetSRID(ST_MakePoint(-3.8114, 40.4425), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Rivas-Vaciamadrid', '28120', 85430, ST_SetSRID(ST_MakePoint(-3.5309, 40.3280), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Valdemoro', '28157', 79826, ST_SetSRID(ST_MakePoint(-3.6792, 40.1908), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Collado Villalba', '28051', 64574, ST_SetSRID(ST_MakePoint(-3.9518, 40.6441), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Aranjuez', '28014', 61447, ST_SetSRID(ST_MakePoint(-3.6026, 40.0318), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- REGIÓN DE MURCIA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '30'), 'Murcia', '30045', 453258, ST_SetSRID(ST_MakePoint(-1.1300, 37.9922), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '30'), 'Cartagena', '30020', 218051, ST_SetSRID(ST_MakePoint(-0.9820, 37.6020), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '30'), 'Lorca', '30024', 95504, ST_SetSRID(ST_MakePoint(-1.6989, 37.6711), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- COMUNIDAD FORAL DE NAVARRA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '31'), 'Pamplona/Iruña', '31201', 203434, ST_SetSRID(ST_MakePoint(-1.6458, 42.8125), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- PAÍS VASCO
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '01'), 'Vitoria-Gasteiz', '01059', 255406, ST_SetSRID(ST_MakePoint(-2.6734, 42.8467), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '48'), 'Bilbao', '48020', 347574, ST_SetSRID(ST_MakePoint(-2.9350, 43.2630), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '20'), 'San Sebastián/Donostia', '20069', 187415, ST_SetSRID(ST_MakePoint(-1.9750, 43.3183), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;

-- COMUNITAT VALENCIANA
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '03'), 'Alicante/Alacant', '03014', 337304, ST_SetSRID(ST_MakePoint(-0.4838, 38.3452), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '12'), 'Castellón de la Plana', '12040', 171723, ST_SetSRID(ST_MakePoint(-0.0514, 39.9864), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '46'), 'Valencia', '46250', 792040, ST_SetSRID(ST_MakePoint(-0.3763, 39.4699), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '46'), 'Torrent', '46244', 83363, ST_SetSRID(ST_MakePoint(-0.5064, 39.4365), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '46'), 'Gandía', '46134', 75593, ST_SetSRID(ST_MakePoint(-0.1833, 38.9667), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '46'), 'Paterna', '46194', 72183, ST_SetSRID(ST_MakePoint(-0.4400, 39.5284), 4326)),
((SELECT id FROM provincias WHERE codigo_ine = '46'), 'Sagunto', '46224', 66588, ST_SetSRID(ST_MakePoint(-0.2729, 39.6833), 4326))
ON CONFLICT (codigo_ine) DO NOTHING;
