-- Fase 3 Hito 6: lectura pública de control y catálogos (sin datos personales
-- en estas tablas: solo estados, recuentos y metadatos de fuentes).
-- Escritura: solo service_role (servidor/scripts). Reversión: _down.

CREATE POLICY incideas_bloques_lectura ON incideas_bloques FOR SELECT USING (true);
CREATE POLICY incideas_fuentes_nac_lectura ON incideas_fuentes_nac FOR SELECT USING (true);
CREATE POLICY incideas_cobertura_lectura ON incideas_cobertura FOR SELECT USING (true);
CREATE POLICY incideas_snapshots_lectura ON incideas_snapshots FOR SELECT USING (true);
CREATE POLICY incideas_aportaciones_lectura ON incideas_aportaciones FOR SELECT USING (true);
