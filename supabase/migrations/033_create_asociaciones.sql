-- Migración 033: Tabla `asociaciones` (SOCideas, hoja «07 Asociaciones»).
-- Registro autonómico de asociaciones: datos abiertos descargados por CCAA.
-- Convenciones verificadas contra el esquema existente:
-- - PK uuid con gen_random_uuid() (igual que datos_fichas / data_sync_runs)
-- - created_at timestamptz DEFAULT now()
-- - RLS habilitado con SELECT público (dato público de solo lectura)
-- - ccaa_code: código INE de CCAA de 2 dígitos ('01'..'19')

CREATE TABLE IF NOT EXISTS asociaciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre               text NOT NULL,
  codigo_ine           text,
  municipio            text,
  provincia            text,
  ccaa_code            text NOT NULL,
  tipo                 text,
  nif                  text,
  fecha_inscripcion    date,
  estado               text,
  fuente_url           text NOT NULL,
  fuente_fecha         date NOT NULL,
  aviso_verificacion   text NOT NULL DEFAULT 'Datos procedentes del registro autonómico. Pueden no reflejar bajas, nuevas inscripciones o cambios de estado posteriores a la fecha de descarga. Verificar en el registro autonómico antes de cualquier uso oficial.',
  raw_data             jsonb,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asoc_ine  ON asociaciones (codigo_ine);
CREATE INDEX IF NOT EXISTS idx_asoc_ccaa ON asociaciones (ccaa_code);
CREATE INDEX IF NOT EXISTS idx_asoc_tipo ON asociaciones (tipo);

-- Búsqueda por nombre (ordenación/filtros del listado).
CREATE INDEX IF NOT EXISTS idx_asoc_nombre_lower ON asociaciones (lower(nombre));

-- Clave de upsert del script de ingesta: (nif, ccaa_code).
-- Parcial (nif IS NOT NULL) porque los metadatos por CCAA no llevan NIF.
-- NOTA: con índice parcial, el upsert de supabase-js (ON CONFLICT (nif,ccaa_code)
-- sin predicado) NO infiere el índice; por eso se añade también el índice
-- único NO parcial, que sí admite inferencia: en PostgreSQL los NULL no colisionan
-- (NULLS DISTINCT), así que las filas de metadatos (nif NULL) no lo violan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_asoc_nif_ccaa ON asociaciones (nif, ccaa_code) WHERE nif IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_asoc_nif_ccaa_inferible ON asociaciones (nif, ccaa_code);

ALTER TABLE asociaciones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "public read" ON asociaciones FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
