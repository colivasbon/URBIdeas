-- Migration 004: Municipios de España (Capitales de provincia)
-- Cabeceras provinciales con códigos INE y poblaciones aproximadas

CREATE TABLE IF NOT EXISTS municipios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provincia_id UUID NOT NULL REFERENCES provincias(id),
  nombre TEXT NOT NULL,
  codigo_ine CHAR(5) NOT NULL UNIQUE,
  poblacion INTEGER,
  geom GEOMETRY(Point, 4326)
);

COMMENT ON TABLE municipios IS 'Municipios de España con geometría espacial';
CREATE INDEX idx_municipios_geom ON municipios USING GIST(geom);

-- ==========================================
-- ANDALUCÍA
-- ==========================================

-- Almería
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '04'), 'Almería', '04013', 201303, ST_SetSRID(ST_MakePoint(-2.4637, 36.8340), 4326));

-- Cádiz
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '11'), 'Cádiz', '11024', 116979, ST_SetSRID(ST_MakePoint(-6.2939, 36.5298), 4326));

-- Córdoba
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '14'), 'Córdoba', '14021', 326023, ST_SetSRID(ST_MakePoint(-4.7794, 37.8882), 4326));

-- Granada
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '18'), 'Granada', '18089', 233648, ST_SetSRID(ST_MakePoint(-3.5980, 37.1773), 4326));

-- Huelva
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '21'), 'Huelva', '21041', 143653, ST_SetSRID(ST_MakePoint(-6.9447, 37.2614), 4326));

-- Jaén
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '23'), 'Jaén', '23050', 112999, ST_SetSRID(ST_MakePoint(-3.7927, 37.7796), 4326));

-- Málaga
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '29'), 'Málaga', '29067', 578460, ST_SetSRID(ST_MakePoint(-4.4214, 36.7213), 4326));

-- Sevilla
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '41'), 'Sevilla', '41091', 688711, ST_SetSRID(ST_MakePoint(-5.9845, 37.3891), 4326));

-- ==========================================
-- ARAGÓN
-- ==========================================

-- Huesca
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '22'), 'Huesca', '22125', 54363, ST_SetSRID(ST_MakePoint(-0.4089, 42.1362), 4326));

-- Teruel
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '44'), 'Teruel', '44216', 36023, ST_SetSRID(ST_MakePoint(-1.1067, 40.3448), 4326));

-- Zaragoza
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '50'), 'Zaragoza', '50297', 679601, ST_SetSRID(ST_MakePoint(-0.8891, 41.6488), 4326));

-- ==========================================
-- ASTURIAS
-- ==========================================

-- Oviedo
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '33'), 'Oviedo', '33044', 223022, ST_SetSRID(ST_MakePoint(-5.8448, 43.3619), 4326));

-- ==========================================
-- ISLAS BALEARES
-- ==========================================

-- Palma de Mallorca
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '07'), 'Palma de Mallorca', '07040', 423350, ST_SetSRID(ST_MakePoint(2.6502, 39.5696), 4326));

-- ==========================================
-- CANARIAS
-- ==========================================

-- Las Palmas de Gran Canaria
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '35'), 'Las Palmas de Gran Canaria', '35016', 379925, ST_SetSRID(ST_MakePoint(-15.4134, 28.1002), 4326));

-- Santa Cruz de Tenerife
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '38'), 'Santa Cruz de Tenerife', '38038', 207312, ST_SetSRID(ST_MakePoint(-16.2518, 28.4636), 4326));

-- ==========================================
-- CANTABRIA
-- ==========================================

-- Santander
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '39'), 'Santander', '39075', 172044, ST_SetSRID(ST_MakePoint(-3.8100, 43.4647), 4326));

-- ==========================================
-- CASTILLA Y LEÓN
-- ==========================================

-- Ávila
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '05'), 'Ávila', '05019', 57964, ST_SetSRID(ST_MakePoint(-4.6995, 40.6561), 4326));

-- Burgos
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '09'), 'Burgos', '09059', 176618, ST_SetSRID(ST_MakePoint(-3.7038, 42.3439), 4326));

-- León
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '24'), 'León', '24089', 124772, ST_SetSRID(ST_MakePoint(-5.5703, 42.5988), 4326));

-- Palencia
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '34'), 'Palencia', '34120', 78874, ST_SetSRID(ST_MakePoint(-4.5340, 42.0094), 4326));

-- Salamanca
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '37'), 'Salamanca', '37317', 144124, ST_SetSRID(ST_MakePoint(-5.6646, 40.9701), 4326));

-- Segovia
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '40'), 'Segovia', '40191', 51830, ST_SetSRID(ST_MakePoint(-4.1173, 40.9486), 4326));

-- Soria
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '42'), 'Soria', '42173', 39714, ST_SetSRID(ST_MakePoint(-2.4688, 41.7636), 4326));

-- Valladolid
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '47'), 'Valladolid', '47186', 299265, ST_SetSRID(ST_MakePoint(-4.7245, 41.6523), 4326));

-- Zamora
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '49'), 'Zamora', '49270', 61724, ST_SetSRID(ST_MakePoint(-5.7402, 41.5034), 4326));

-- Ponferrada (León)
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '24'), 'Ponferrada', '24126', 61353, ST_SetSRID(ST_MakePoint(-6.3947, 42.5468), 4326));

-- ==========================================
-- CASTILLA-LA MANCHA
-- ==========================================

-- Albacete
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '02'), 'Albacete', '02003', 173329, ST_SetSRID(ST_MakePoint(-1.8585, 38.9942), 4326));

-- Ciudad Real
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '13'), 'Ciudad Real', '13034', 74641, ST_SetSRID(ST_MakePoint(-3.9322, 38.9863), 4326));

-- Cuenca
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '16'), 'Cuenca', '16078', 54495, ST_SetSRID(ST_MakePoint(-2.1314, 40.0704), 4326));

-- Guadalajara
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '19'), 'Guadalajara', '19130', 88866, ST_SetSRID(ST_MakePoint(-3.1672, 40.6337), 4326));

-- Toledo
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '45'), 'Toledo', '45169', 85811, ST_SetSRID(ST_MakePoint(-4.0273, 39.8628), 4326));

-- ==========================================
-- CATALUÑA
-- ==========================================

-- Barcelona
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Barcelona', '08019', 1664182, ST_SetSRID(ST_MakePoint(2.1734, 41.3851), 4326));

-- L'Hospitalet de Llobregat
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'L''Hospitalet de Llobregat', '08121', 264923, ST_SetSRID(ST_MakePoint(2.0987, 41.3600), 4326));

-- Badalona
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Badalona', '08020', 225957, ST_SetSRID(ST_MakePoint(2.2472, 41.4469), 4326));

-- Terrassa
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Terrassa', '08279', 224114, ST_SetSRID(ST_MakePoint(2.0140, 41.5634), 4326));

-- Sabadell
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '08'), 'Sabadell', '08187', 213642, ST_SetSRID(ST_MakePoint(2.1102, 41.5433), 4326));

-- Lleida
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '25'), 'Lleida', '25121', 140767, ST_SetSRID(ST_MakePoint(0.6264, 41.6176), 4326));

-- Tarragona
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '43'), 'Tarragona', '43148', 134515, ST_SetSRID(ST_MakePoint(1.2441, 41.1189), 4326));

-- Girona
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '17'), 'Girona', '17079', 104604, ST_SetSRID(ST_MakePoint(2.8256, 41.9794), 4326));

-- ==========================================
-- EXTREMADURA
-- ==========================================

-- Badajoz
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '06'), 'Badajoz', '06015', 151240, ST_SetSRID(ST_MakePoint(-6.9706, 38.8794), 4326));

-- Cáceres
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '10'), 'Cáceres', '10037', 96543, ST_SetSRID(ST_MakePoint(-6.3724, 39.4753), 4326));

-- Mérida
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '06'), 'Mérida', '06083', 59352, ST_SetSRID(ST_MakePoint(-6.3410, 38.9161), 4326));

-- ==========================================
-- GALICIA
-- ==========================================

-- A Coruña
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '15'), 'A Coruña', '15030', 247308, ST_SetSRID(ST_MakePoint(-8.4067, 43.3693), 4326));

-- Lugo
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '27'), 'Lugo', '27028', 98560, ST_SetSRID(ST_MakePoint(-7.5566, 43.0124), 4326));

-- Ourense
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '32'), 'Ourense', '32054', 105583, ST_SetSRID(ST_MakePoint(-7.8620, 42.3365), 4326));

-- Pontevedra
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '36'), 'Pontevedra', '36058', 83375, ST_SetSRID(ST_MakePoint(-8.6480, 42.4310), 4326));

-- Santiago de Compostela
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '15'), 'Santiago de Compostela', '15078', 98175, ST_SetSRID(ST_MakePoint(-8.5434, 42.8782), 4326));

-- Vigo
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '36'), 'Vigo', '36057', 296302, ST_SetSRID(ST_MakePoint(-8.7207, 42.2313), 4326));

-- ==========================================
-- LA RIOJA
-- ==========================================

-- Logroño
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '26'), 'Logroño', '26089', 151113, ST_SetSRID(ST_MakePoint(-2.4504, 42.4654), 4326));

-- ==========================================
-- COMUNIDAD DE MADRID
-- ==========================================

-- Madrid
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '28'), 'Madrid', '28079', 3305403, ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326));

-- ==========================================
-- REGIÓN DE MURCIA
-- ==========================================

-- Murcia
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '30'), 'Murcia', '30045', 453258, ST_SetSRID(ST_MakePoint(-1.1300, 37.9922), 4326));

-- ==========================================
-- COMUNIDAD FORAL DE NAVARRA
-- ==========================================

-- Pamplona / Iruña
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '31'), 'Pamplona/Iruña', '31201', 203434, ST_SetSRID(ST_MakePoint(-1.6458, 42.8125), 4326));

-- ==========================================
-- PAÍS VASCO
-- ==========================================

-- Álava / Araba
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '01'), 'Vitoria-Gasteiz', '01059', 255406, ST_SetSRID(ST_MakePoint(-2.6734, 42.8467), 4326));

-- Bizkaia
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '48'), 'Bilbao', '48020', 347574, ST_SetSRID(ST_MakePoint(-2.9350, 43.2630), 4326));

-- Gipuzkoa
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '20'), 'San Sebastián/Donostia', '20069', 187415, ST_SetSRID(ST_MakePoint(-1.9750, 43.3183), 4326));

-- ==========================================
-- COMUNITAT VALENCIANA
-- ==========================================

-- Alicante / Alacant
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '03'), 'Alicante/Alacant', '03014', 337304, ST_SetSRID(ST_MakePoint(-0.4838, 38.3452), 4326));

-- Castellón de la Plana
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '12'), 'Castellón de la Plana', '12040', 171723, ST_SetSRID(ST_MakePoint(-0.0514, 39.9864), 4326));

-- Elche / Elx
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '03'), 'Elche/Elx', '03065', 238327, ST_SetSRID(ST_MakePoint(-0.7022, 38.2682), 4326));

-- Valencia
INSERT INTO municipios (provincia_id, nombre, codigo_ine, poblacion, geom) VALUES
((SELECT id FROM provincias WHERE codigo_ine = '46'), 'Valencia', '46250', 792040, ST_SetSRID(ST_MakePoint(-0.3763, 39.4699), 4326));
