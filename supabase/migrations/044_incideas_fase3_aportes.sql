-- Fase 3 Hito 1: entidades designadas/aportadas y control de aportaciones.
-- El grueso nacional vive en R2 por municipio; aquí solo índices operativos
-- y aportación municipal con revisión. Solo creación.
-- Reversión: 044_incideas_fase3_down.sql

CREATE TABLE IF NOT EXISTS incideas_entidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio CHARACTER(5) NOT NULL,
  bloque TEXT NOT NULL REFERENCES incideas_bloques (codigo),
  fuente TEXT NOT NULL DEFAULT '',
  nombre TEXT NOT NULL DEFAULT '',
  atributos JSONB NOT NULL DEFAULT '{}',
  lon NUMERIC,
  lat NUMERIC,
  origen TEXT NOT NULL CHECK (origen IN ('oficial','calculado','aportado')),
  snapshot TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incideas_entidades_municipio_bloque_idx ON incideas_entidades (municipio, bloque);

CREATE TABLE IF NOT EXISTS incideas_aportaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio CHARACTER(5) NOT NULL,
  bloque TEXT NOT NULL REFERENCES incideas_bloques (codigo),
  archivo_r2 TEXT NOT NULL DEFAULT '',
  checksum TEXT NOT NULL DEFAULT '',
  estado_revision TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_revision IN ('pendiente','aceptada','rechazada')),
  version INTEGER NOT NULL DEFAULT 1,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_en TIMESTAMPTZ,
  notas TEXT NOT NULL DEFAULT ''
);

ALTER TABLE incideas_entidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE incideas_aportaciones ENABLE ROW LEVEL SECURITY;
