-- INCideas: columna de atributos específicos de la fuente
-- Evita forzar una columna por cada campo particular de cada fuente
-- (líneas de bus, distrito/área de partida, personal y alumnado, etc.).
-- Migración aditiva, no destructiva.

ALTER TABLE incideas_registros
  ADD COLUMN IF NOT EXISTS atributos JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN incideas_registros.atributos IS
  'Atributos específicos de la fuente que no tienen columna propia (líneas de bus, distrito/área de partida, etc.).';
