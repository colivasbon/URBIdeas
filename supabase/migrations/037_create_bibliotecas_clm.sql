-- Tabla de bibliotecas públicas de Castilla-La Mancha
-- Fuente: https://datosabiertos.castillalamancha.es/dataset/directorio-de-bibliotecas-de-castilla-la-mancha
-- Poblada por scripts/sync-bibliotecas-clm.ts

CREATE TABLE IF NOT EXISTS bibliotecas_clm (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_ine VARCHAR(5) NOT NULL,
  nombre_municipio TEXT NOT NULL,
  provincia TEXT NOT NULL,
  nombre_biblioteca TEXT NOT NULL,
  direccion TEXT,
  codigo_postal VARCHAR(5),
  telefono TEXT,
  email TEXT,
  fuente_url TEXT NOT NULL,
  fuente_fecha DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bibliotecas_clm_ine ON bibliotecas_clm(codigo_ine);
CREATE INDEX IF NOT EXISTS idx_bibliotecas_clm_provincia ON bibliotecas_clm(provincia);

COMMENT ON TABLE bibliotecas_clm IS 'Bibliotecas públicas de Castilla-La Mancha (Directorio 2025)';
