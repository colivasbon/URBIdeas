-- Migration 016: Expand normativa model for municipal scope + traceability

-- 1. Add municipio_id column (nullable - estatal/autonomico norms don't have a municipio)
ALTER TABLE normativa_vigente 
  ADD COLUMN IF NOT EXISTS municipio_id UUID REFERENCES municipios(id);

-- 2. Add traceability fields
ALTER TABLE normativa_vigente 
  ADD COLUMN IF NOT EXISTS fuente_oficial TEXT,
  ADD COLUMN IF NOT EXISTS administracion_emisora TEXT,
  ADD COLUMN IF NOT EXISTS fecha_verificacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS url_verificada TEXT,
  ADD COLUMN IF NOT EXISTS resultado_verificacion TEXT,
  ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- 3. Add CHECK constraint for expanded ambito values
ALTER TABLE normativa_vigente 
  DROP CONSTRAINT IF EXISTS normativa_vigente_ambito_check;
ALTER TABLE normativa_vigente 
  ADD CONSTRAINT normativa_vigente_ambito_check 
  CHECK (ambito IN ('estatal', 'autonomico', 'provincial', 'municipal', 'planeamiento'));

-- 4. Add indexes
CREATE INDEX IF NOT EXISTS idx_normativa_municipio ON normativa_vigente(municipio_id);
CREATE INDEX IF NOT EXISTS idx_normativa_fuente ON normativa_vigente(fuente_oficial);

-- 5. Update existing estatal norms with fuente_oficial
UPDATE normativa_vigente SET fuente_oficial = 'BOE', administracion_emisora = 'Gobierno de España' WHERE ambito = 'estatal' AND fuente_oficial IS NULL;
UPDATE normativa_vigente SET administracion_emisora = 'Comunidad Autónoma' WHERE ambito = 'autonomico' AND administracion_emisora IS NULL;
