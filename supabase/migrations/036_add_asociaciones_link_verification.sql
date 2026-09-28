-- Añade columnas de verificación de enlaces individuales a la tabla asociaciones
-- para almacenar la URL web verificada, la URL de red social verificada,
-- el tipo de enlace, la fecha de verificación y el estado.

ALTER TABLE asociaciones
  ADD COLUMN IF NOT EXISTS web_verificada TEXT,
  ADD COLUMN IF NOT EXISTS social_verificada TEXT,
  ADD COLUMN IF NOT EXISTS tipo_enlace TEXT DEFAULT 'ninguno',
  ADD COLUMN IF NOT EXISTS fecha_verificacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enlace_estado TEXT DEFAULT 'pendiente';

-- Índice para consultas por estado de enlace
CREATE INDEX IF NOT EXISTS idx_asociaciones_enlace_estado
  ON asociaciones(enlace_estado);

-- Comentarios para documentar las columnas
COMMENT ON COLUMN asociaciones.web_verificada IS 'URL web verificada por sonda HTTP (null si no se ha verificado)';
COMMENT ON COLUMN asociaciones.social_verificada IS 'URL de red social verificada por sonda HTTP (null si no se ha verificado)';
COMMENT ON COLUMN asociaciones.tipo_enlace IS 'Tipo de enlace: web, social, web_y_social, ninguno';
COMMENT ON COLUMN asociaciones.fecha_verificacion IS 'Fecha de la última verificación del enlace';
COMMENT ON COLUMN asociaciones.enlace_estado IS 'Estado del enlace: verificado, pendiente, no_verificado';
