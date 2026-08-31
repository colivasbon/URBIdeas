-- Migration 005: Instrumentos de Planeamiento Urbanístico
-- Registra los diferentes instrumentos de planificación urbanística municipal

CREATE TABLE IF NOT EXISTS instrumentos_planeamiento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  municipio_id UUID NOT NULL REFERENCES municipios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('PGOU', 'Normas Subsidiarias', 'Plan de Ordenación Municipal', 'Plan Parcial', 'Plan Especial', 'Modificación Puntual', 'OPA', 'PDI')),
  estado TEXT NOT NULL CHECK (estado IN ('vigente', 'en tramitación', 'en revisión', 'aprobado definitivamente', 'aprobado provisionalmente')),
  fecha_aprobacion_inicial DATE,
  fecha_aprobacion_definitiva DATE,
  enlace_documento_oficial TEXT,
  enlace_geoportal TEXT,
  fuente TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE instrumentos_planeamiento IS 'Instrumentos de planeamiento urbanístico de cada municipio';
COMMENT ON COLUMN instrumentos_planeamiento.tipo IS 'Tipo de instrumento: PGOU, Normas Subsidiarias, Plan Parcial, etc.';

CREATE INDEX IF NOT EXISTS idx_instrumentos_municipio ON instrumentos_planeamiento(municipio_id);
CREATE INDEX IF NOT EXISTS idx_instrumentos_estado ON instrumentos_planeamiento(estado);
