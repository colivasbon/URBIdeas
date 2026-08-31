-- Migration 003: Provincias de España
-- 52 provincias con sus códigos INE y relación con comunidades autónomas

CREATE TABLE IF NOT EXISTS provincias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comunidad_autonoma_id UUID NOT NULL REFERENCES comunidades_autonomas(id),
  nombre TEXT NOT NULL,
  codigo_ine CHAR(2)
);

COMMENT ON TABLE provincias IS 'Provincias de España con sus códigos INE';
CREATE UNIQUE INDEX idx_provincias_ine ON provincias(codigo_ine);

-- Andalucía
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'), 'Almería', '04'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'), 'Cádiz', '11'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'), 'Córdoba', '14'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'), 'Granada', '18'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'), 'Huelva', '21'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'), 'Jaén', '23'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'), 'Málaga', '29'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Andalucía'), 'Sevilla', '41');

-- Aragón
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Aragón'), 'Huesca', '22'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Aragón'), 'Teruel', '44'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Aragón'), 'Zaragoza', '50');

-- Asturias
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Asturias'), 'Asturias', '33');

-- Islas Baleares
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Islas Baleares'), 'Illes Balears', '07');

-- Canarias
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Canarias'), 'Las Palmas', '35'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Canarias'), 'Santa Cruz de Tenerife', '38');

-- Cantabria
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cantabria'), 'Cantabria', '39');

-- Castilla y León
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'), 'Ávila', '05'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'), 'Burgos', '09'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'), 'León', '24'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'), 'Palencia', '34'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'), 'Salamanca', '37'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'), 'Segovia', '40'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'), 'Soria', '42'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'), 'Valladolid', '47'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla y León'), 'Zamora', '49');

-- Castilla-La Mancha
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla-La Mancha'), 'Albacete', '02'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla-La Mancha'), 'Ciudad Real', '13'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla-La Mancha'), 'Cuenca', '16'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla-La Mancha'), 'Guadalajara', '19'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Castilla-La Mancha'), 'Toledo', '45');

-- Cataluña
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'), 'Barcelona', '08'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'), 'Girona', '17'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'), 'Lleida', '25'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Cataluña'), 'Tarragona', '43');

-- Extremadura
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Extremadura'), 'Badajoz', '06'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Extremadura'), 'Cáceres', '10');

-- Galicia
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Galicia'), 'A Coruña', '15'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Galicia'), 'Lugo', '27'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Galicia'), 'Ourense', '32'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Galicia'), 'Pontevedra', '36');

-- La Rioja
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'La Rioja'), 'La Rioja', '26');

-- Comunidad de Madrid
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad de Madrid'), 'Madrid', '28');

-- Región de Murcia
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Región de Murcia'), 'Murcia', '30');

-- Comunidad Foral de Navarra
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunidad Foral de Navarra'), 'Navarra', '31');

-- País Vasco
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'País Vasco'), 'Álava', '01'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'País Vasco'), 'Bizkaia', '48'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'País Vasco'), 'Gipuzkoa', '20');

-- Comunitat Valenciana
INSERT INTO provincias (comunidad_autonoma_id, nombre, codigo_ine) VALUES
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunitat Valenciana'), 'Alicante', '03'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunitat Valenciana'), 'Castellón', '12'),
((SELECT id FROM comunidades_autonomas WHERE nombre = 'Comunitat Valenciana'), 'Valencia', '46');
