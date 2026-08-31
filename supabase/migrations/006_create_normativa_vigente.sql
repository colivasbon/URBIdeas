-- Migration 006: Normativa Vigente de Urbanismo
-- Registro de la legislación vigente en materia de suelo y urbanismo

CREATE TABLE IF NOT EXISTS normativa_vigente (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ambito TEXT NOT NULL CHECK (ambito IN ('estatal', 'autonomico')),
  comunidad_autonoma_id UUID REFERENCES comunidades_autonomas(id),
  titulo TEXT NOT NULL,
  referencia_legal TEXT NOT NULL,
  fecha_publicacion DATE,
  enlace_boe_boletin TEXT,
  estado_vigencia TEXT NOT NULL DEFAULT 'vigente' CHECK (estado_vigencia IN ('vigente', 'derogada', 'parcialmente derogada', 'en revisión')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE normativa_vigente IS 'Normativa vigente de suelo y urbanismo en España';
COMMENT ON COLUMN normativa_vigente.ambito IS 'Ámbito de aplicación: estatal o autonómico';
COMMENT ON COLUMN normativa_vigente.estado_vigencia IS 'Estado de vigencia de la norma';

CREATE INDEX IF NOT EXISTS idx_normativa_ambito ON normativa_vigente(ambito);
