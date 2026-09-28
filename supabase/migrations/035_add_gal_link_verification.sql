-- Añade columnas de verificación de enlaces a la tabla grupos_accion_local
-- para almacenar la URL fuente, la URL declarada, la URL verificada,
-- la fecha de verificación y el estado del enlace.

ALTER TABLE grupos_accion_local
  ADD COLUMN IF NOT EXISTS url_fuente TEXT,
  ADD COLUMN IF NOT EXISTS url_declarada TEXT,
  ADD COLUMN IF NOT EXISTS url_oficial_verificada TEXT,
  ADD COLUMN IF NOT EXISTS fecha_verificacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estado_enlace TEXT DEFAULT 'pendiente';

-- Índice para consultas por estado de enlace
CREATE INDEX IF NOT EXISTS idx_grupos_accion_local_estado_enlace
  ON grupos_accion_local(estado_enlace);

-- Comentarios para documentar las columnas
COMMENT ON COLUMN grupos_accion_local.url_fuente IS 'URL tal como aparece en la fuente (Red PAC WFS o CLM)';
COMMENT ON COLUMN grupos_accion_local.url_declarada IS 'URL declarada en la tabla (puede diferir de la fuente)';
COMMENT ON COLUMN grupos_accion_local.url_oficial_verificada IS 'URL verificada por sonda HTTP (null si no se ha verificado)';
COMMENT ON COLUMN grupos_accion_local.fecha_verificacion IS 'Fecha de la última verificación del enlace';
COMMENT ON COLUMN grupos_accion_local.estado_enlace IS 'Estado del enlace: verificado, pendiente, no_verificado, fuente_caida';
