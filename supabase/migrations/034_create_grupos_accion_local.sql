-- 034 · Grupos de Acción Local (GAL/GDR · LEADER/FEADER/PAC) — SOCideas SA3
-- Cada municipio pertenece como máximo a un GAL (o a ninguno). La cobertura
-- municipal se guarda en `municipios_codigo_ine` (text[] de códigos INE-5) y se
-- indexa con GIN para consultas `.contains()`.
-- Fuentes estructuradas (ver scripts/sync-gal.ts y tmp/audit/gal-fuentes.txt):
--   · Red PAC / MAPA — GeoServer WFS RRN:MUN + RRN:GAL (cobertura nacional)
--   · Datos Abiertos CLM — PEPAC 2023-2027 (cobertura Castilla-La Mancha)
-- No se imputa ninguna cobertura: lo no publicado queda fuera de la tabla.

CREATE TABLE IF NOT EXISTS grupos_accion_local (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_gal text UNIQUE,
  nombre text NOT NULL,
  ccaa_code text,
  ambito_territorial text,
  municipios_codigo_ine text[],
  web_oficial text,
  email text,
  telefono text,
  periodo_programacion text,
  fuente_url text NOT NULL,
  fuente_fecha date NOT NULL,
  aviso text DEFAULT 'Verificar en la web del GAL la vigencia de la información y los municipios incluidos en el ámbito territorial actual.',
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gal_ccaa ON grupos_accion_local (ccaa_code);
CREATE INDEX IF NOT EXISTS idx_gal_municipios ON grupos_accion_local USING GIN (municipios_codigo_ine);

ALTER TABLE grupos_accion_local ENABLE ROW LEVEL SECURITY;

-- Lectura pública (guard frente a duplicate_object si la política ya existe).
DO $$
BEGIN
  CREATE POLICY "grupos_accion_local_public_read" ON grupos_accion_local
    FOR SELECT USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
