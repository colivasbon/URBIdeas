-- Fase 3 Hito 1: control de cargas y snapshots (solo creación).
-- Reversión: 043_incideas_fase3_down.sql

CREATE TABLE IF NOT EXISTS incideas_cobertura (
  id BIGGENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  municipio CHARACTER(5) NOT NULL,
  bloque TEXT NOT NULL REFERENCES incideas_bloques (codigo),
  fuente TEXT NOT NULL REFERENCES incideas_fuentes_nac (codigo),
  edicion TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL CHECK (estado IN ('cargado','cargado_parcial','sin_cobertura','no_aplicable','fuente_caida','cero_resultados','pendiente_aportacion')),
  inicio TIMESTAMPTZ,
  fin TIMESTAMPTZ,
  objetos_leidos INTEGER NOT NULL DEFAULT 0,
  objetos_publicados INTEGER NOT NULL DEFAULT 0,
  errores INTEGER NOT NULL DEFAULT 0,
  reintentos INTEGER NOT NULL DEFAULT 0,
  version_conector TEXT NOT NULL DEFAULT '',
  snapshot TEXT,
  UNIQUE (municipio, bloque, fuente, edicion)
);

CREATE INDEX IF NOT EXISTS incideas_cobertura_municipio_idx ON incideas_cobertura (municipio);
CREATE INDEX IF NOT EXISTS incideas_cobertura_bloque_estado_idx ON incideas_cobertura (bloque, estado);

CREATE TABLE IF NOT EXISTS incideas_snapshots (
  id TEXT PRIMARY KEY,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  fuentes_hash TEXT NOT NULL DEFAULT '',
  algoritmo_version TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','aprobada','retirada')),
  notas TEXT NOT NULL DEFAULT ''
);

ALTER TABLE incideas_cobertura ENABLE ROW LEVEL SECURITY;
ALTER TABLE incideas_snapshots ENABLE ROW LEVEL SECURITY;
