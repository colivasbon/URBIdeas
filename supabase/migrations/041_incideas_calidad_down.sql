-- 041_incideas_calidad_down.sql
--
-- REVERSIÓN de 041_incideas_calidad.sql.
--
-- Qué deshace y qué no:
--   · elimina las 9 columnas añadidas a incideas_registros
--   · elimina los 4 índices creados
--   · elimina las 3 tablas nuevas
--
-- Qué NO puede deshacer, y hay que saber antes de ejecutarlo:
--   · si algún conector ha escrito ya valores en las columnas nuevas, esos valores
--     se pierden. Antes de revertir, la tabla de propuestas conserva la corrección
--     propuesta y el historial conserva el rastro, pero el valor aplicado en
--     utm_x / utm_y / precision_geolocalizacion / fecha_edicion_origen se pierde.
--     Los conectores que rellenan esas columnas deben volver a ejecutarse después
--     de revertir para recuperar los datos.
--   · las tablas nuevas se pierden con todo su contenido. Exportar antes si hay
--     propuestas o cambios que conservar:
--       SELECT * FROM incideas_correcciones_propuestas WHERE codigo_ine = '03031';
--       SELECT * FROM incideas_control_carga WHERE codigo_ine = '03031';
--       SELECT * FROM incideas_cambios WHERE codigo_ine = '03031';
--
-- La migración no borra ni altera ningún registro existente de la tabla original,
-- de modo que revertir no puede producir pérdida de inventario.

-- 1. Índices
DROP INDEX IF EXISTS idx_incideas_registros_utm;
DROP INDEX IF EXISTS idx_incideas_registros_precision;
DROP INDEX IF EXISTS idx_incideas_registros_enlace;
DROP INDEX IF EXISTS idx_correcciones_codigo_ine;
DROP INDEX IF EXISTS idx_correcciones_registro;
DROP INDEX IF EXISTS idx_control_carga_estado;
DROP INDEX IF EXISTS idx_cambios_codigo_ine;

-- 2. Restricciones añadidas (van con las columnas, pero se dejan explícitas
--    para que la reversión no dependa del orden interno de PostgreSQL)
ALTER TABLE incideas_registros DROP CONSTRAINT IF EXISTS chk_incideas_utm_huso;
ALTER TABLE incideas_registros DROP CONSTRAINT IF EXISTS chk_incideas_precision_geo;

-- 3. Tablas nuevas
DROP TABLE IF EXISTS incideas_cambios;
DROP TABLE IF EXISTS incideas_control_carga;
DROP TABLE IF EXISTS incideas_correcciones_propuestas;

-- 4. Columnas nuevas
ALTER TABLE incideas_registros
  DROP COLUMN IF EXISTS utm_x,
  DROP COLUMN IF EXISTS utm_y,
  DROP COLUMN IF EXISTS utm_huso,
  DROP COLUMN IF EXISTS precision_geolocalizacion,
  DROP COLUMN IF EXISTS fecha_edicion_origen,
  DROP COLUMN IF EXISTS version_origen,
  DROP COLUMN IF EXISTS enlace_origen,
  DROP COLUMN IF EXISTS tipo_origen,
  DROP COLUMN IF EXISTS id_origen_tipo,
  DROP COLUMN IF EXISTS refcat,
  DROP COLUMN IF EXISTS etiquetas_origen;

-- 5. Comprobación: deben quedar 66 columnas, las mismas que antes de la 041.
DO $$
DECLARE
  columnas INTEGER;
BEGIN
  SELECT count(*) INTO columnas
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'incideas_registros';

  IF columnas <> 66 THEN
    RAISE EXCEPTION
      'Reversión 041 incompleta: incideas_registros tiene % columnas, se esperaban 66', columnas;
  END IF;
END $$;