-- 041_incideas_calidad.sql
--
-- Migración ADITIVA y reversible. Solo añade columnas y tablas nuevas.
-- No modifica ni borra ningún registro existente.
--
-- Motivo (docs/incideas-auditoria-calidad.md, apartados 2.2, 3.2 y 4):
-- el libro carecía de coordenada UTM, huso, precisión de geolocalización, fecha
-- de edición en el origen y enlace al objeto, y la base de datos no tenía columna
-- donde guardarlos. Tampoco había forma de proponer correcciones de dato sin tocar
-- los registros, que es lo que permite la tabla de propuestas de este fichero.
--
-- Reversión: supabase/migrations/041_incideas_calidad_down.sql

-- ---------------------------------------------------------------------------
-- 1. Columnas de geolocalización y trazabilidad por registro
-- ---------------------------------------------------------------------------

ALTER TABLE incideas_registros
  -- Coordenada en ETRS89 UTM, el sistema de referencia que usa el Plan Territorial
  -- Municipal (por ejemplo «coord. (749923; 4269043)»). Se guarda calculada, no
  -- estimada por el lector, para que la exportación no dependa del conversor.
  ADD COLUMN IF NOT EXISTS utm_x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS utm_y DOUBLE PRECISION,
  -- 28 en Canarias, 30 en la península y en Baleares, 31 en el este de Cataluña y
  -- Menorca. Cálculo por longitud: huso = floor((longitud + 180) / 6) + 1.
  ADD COLUMN IF NOT EXISTS utm_huso SMALLINT,
  -- Cómo se obtuvo el punto. Distingue un punto verificado de un centroide, que es
  -- una diferencia relevante para una evacuación.
  ADD COLUMN IF NOT EXISTS precision_geolocalizacion TEXT,
  -- Última edición del objeto en el origen. Permite descartar lo que lleve más de
  -- cinco años sin revisión.
  ADD COLUMN IF NOT EXISTS fecha_edicion_origen TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version_origen INTEGER,
  -- Enlace directo al objeto en el portal de su fuente, para trazar y corregir.
  ADD COLUMN IF NOT EXISTS enlace_origen TEXT,
  -- Tipo y identificador originales del objeto (node/way/relation en OpenStreetMap,
  -- IDEESS en el Geoportal de Gasolineras, código de centro en el registro
  -- autonómico). Conservado aunque no se muestre como dato principal.
  ADD COLUMN IF NOT EXISTS tipo_origen TEXT,
  ADD COLUMN IF NOT EXISTS id_origen_tipo TEXT,
  -- Referencia catastral, presente en la capa del Catastro (INSPIRE).
  ADD COLUMN IF NOT EXISTS refcat VARCHAR(20),
  -- Etiquetas originales completas del objeto, en JSON. Permite recuperar
  -- atributos que el mapeo normalizado no contempla sin volver a consultar.
  ADD COLUMN IF NOT EXISTS etiquetas_origen JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN incideas_registros.utm_x IS
  'Coordenada X (easting) en ETRS89 UTM, sistema de referencia del Plan Territorial Municipal.';
COMMENT ON COLUMN incideas_registros.utm_y IS
  'Coordenada Y (northing) en ETRS89 UTM.';
COMMENT ON COLUMN incideas_registros.utm_huso IS
  'Huso UTM utilizado: 28 en Canarias, 30 en península y Baleares, 31 en el este de Cataluña y Menorca.';
COMMENT ON COLUMN incideas_registros.precision_geolocalizacion IS
  'punto | punto_verificado | centroide_edificio | centroide_municipio | sin_ubicacion. Distingue posición real de posición aproximada.';
COMMENT ON COLUMN incideas_registros.fecha_edicion_origen IS
  'Fecha de la última edición del objeto en su fuente de origen.';
COMMENT ON COLUMN incideas_registros.enlace_origen IS
  'Enlace directo al objeto en el portal de la fuente.';
COMMENT ON COLUMN incideas_registros.etiquetas_origen IS
  'Etiquetas originales completas del objeto de origen, sin normalizar.';

-- Restricciones de dominio. La tabla tiene 1.378 filas, de modo que se validan
-- de inmediato sin coste apreciable.
ALTER TABLE incideas_registros
  DROP CONSTRAINT IF EXISTS chk_incideas_utm_huso;
ALTER TABLE incideas_registros
  ADD CONSTRAINT chk_incideas_utm_huso
  CHECK (utm_huso IS NULL OR utm_huso BETWEEN 28 AND 31);

ALTER TABLE incideas_registros
  DROP CONSTRAINT IF EXISTS chk_incideas_precision_geo;
ALTER TABLE incideas_registros
  ADD CONSTRAINT chk_incideas_precision_geo
  CHECK (precision_geolocalizacion IS NULL OR precision_geolocalizacion IN (
    'punto', 'punto_verificado', 'centroide_edificio', 'centroide_municipio', 'sin_ubicacion'
  ));

-- Índices para las consultas nuevas: por municipio y por categoría, que es como
-- lee la aplicación, y por precisión para el filtro de calidad.
CREATE INDEX IF NOT EXISTS idx_incideas_registros_utm
  ON incideas_registros (codigo_ine, utm_huso)
  WHERE utm_x IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incideas_registros_precision
  ON incideas_registros (codigo_ine, precision_geolocalizacion);

CREATE INDEX IF NOT EXISTS idx_incideas_registros_enlace
  ON incideas_registros (codigo_ine)
  WHERE enlace_origen IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Correcciones de dato propuestas, sin aplicarlas
-- ---------------------------------------------------------------------------
--
-- Reúne las correcciones que la auditoría ha detectado y que NO se aplican
-- automáticamente: se proponen, se revisan y, solo con autorización expresa, se
-- aplican. Así se respeta «no inventar ni sobrescribir» y se deja traza de quién
-- decidió qué.

CREATE TABLE IF NOT EXISTS incideas_correcciones_propuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id UUID NOT NULL REFERENCES incideas_registros(id) ON DELETE CASCADE,
  codigo_ine VARCHAR(5) NOT NULL,
  campo TEXT NOT NULL,
  valor_actual TEXT,
  valor_propuesto TEXT,
  motivo TEXT NOT NULL,
  fuente_propuesta TEXT,
  confianza_propuesta SMALLINT CHECK (confianza_propuesta BETWEEN 0 AND 100),
  estado TEXT NOT NULL DEFAULT 'propuesta'
    CHECK (estado IN ('propuesta', 'aceptada', 'rechazada', 'aplicada', 'descartada')),
  aplicado_en TIMESTAMPTZ,
  aplicado_por TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (registro_id, campo)
);

COMMENT ON TABLE incideas_correcciones_propuestas IS
  'Correcciones de dato detectadas por la auditoría o por los conectores, pendientes de revisión. No modifica incideas_registros: solo una fila aprobada lo hace.';

CREATE INDEX IF NOT EXISTS idx_correcciones_codigo_ine
  ON incideas_correcciones_propuestas (codigo_ine, estado);

CREATE INDEX IF NOT EXISTS idx_correcciones_registro
  ON incideas_correcciones_propuestas (registro_id);

-- ---------------------------------------------------------------------------
-- 3. Control de la carga por lotes (Fase 5)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS incideas_control_carga (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ine VARCHAR(5) NOT NULL,
  provincia VARCHAR(2),
  comunidad_autonoma TEXT,
  categoria TEXT NOT NULL,
  conector TEXT NOT NULL,
  fuente TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_curso', 'completada', 'parcial', 'fallida', 'omitida')),
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  registros_leidos INTEGER NOT NULL DEFAULT 0,
  registros_escritos INTEGER NOT NULL DEFAULT 0,
  registros_rechazados INTEGER NOT NULL DEFAULT 0,
  posible_baja INTEGER NOT NULL DEFAULT 0,
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_error TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (codigo_ine, categoria, conector)
);

COMMENT ON TABLE incideas_control_carga IS
  'Estado de la carga por municipio, categoría y conector. Permite reanudar tras un fallo sin repetir lo ya hecho.';

CREATE INDEX IF NOT EXISTS idx_control_carga_estado
  ON incideas_control_carga (estado, provincia);

-- ---------------------------------------------------------------------------
-- 4. Registro de cambios entre extracciones (actualización mensual)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS incideas_cambios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ine VARCHAR(5) NOT NULL,
  registro_id UUID REFERENCES incideas_registros(id) ON DELETE SET NULL,
  subcategoria TEXT,
  nombre_registro TEXT,
  tipo_cambio TEXT NOT NULL CHECK (tipo_cambio IN ('nuevo', 'modificado', 'desaparecido')),
  campos_modificados TEXT[],
  valor_anterior TEXT,
  valor_nuevo TEXT,
  ejecucion_id UUID,
  detectado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE incideas_cambios IS
  'Listado de altas, modificaciones y bajas detectadas entre dos extracciones consecutivas.';

CREATE INDEX IF NOT EXISTS idx_cambios_codigo_ine
  ON incideas_cambios (codigo_ine, detectado_en DESC);

-- ---------------------------------------------------------------------------
-- 5. Verificación
-- ---------------------------------------------------------------------------
--
-- Comprobación que debe devolver exactamente 0 filas: si aparece alguna, algún
-- registro quedó con una coordenada UTM a medio rellenar.

DO $$
DECLARE
  incompletos INTEGER;
BEGIN
  SELECT count(*) INTO incompletos
  FROM incideas_registros
  WHERE (utm_x IS NOT NULL) IS DISTINCT FROM (utm_y IS NOT NULL);

  IF incompletos > 0 THEN
    RAISE EXCEPTION
      'Migración 041 incompleta: % registros con UTM a medio rellenar', incompletos;
  END IF;
END $$;