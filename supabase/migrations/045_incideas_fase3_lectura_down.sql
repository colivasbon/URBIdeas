-- Reversión de 045.
DROP POLICY IF EXISTS incideas_bloques_lectura ON incideas_bloques;
DROP POLICY IF EXISTS incideas_fuentes_nac_lectura ON incideas_fuentes_nac;
DROP POLICY IF EXISTS incideas_cobertura_lectura ON incideas_cobertura;
DROP POLICY IF EXISTS incideas_snapshots_lectura ON incideas_snapshots;
DROP POLICY IF EXISTS incideas_aportaciones_lectura ON incideas_aportaciones;
