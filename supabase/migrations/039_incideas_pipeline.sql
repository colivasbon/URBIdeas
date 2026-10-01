-- INCideas: pipeline de carga idempotente, ejecuciones y extensiones por categoría
--
-- NO aplicar en producción sin autorización expresa.
-- Esta migración es aditiva: no elimina ni sobrescribe datos existentes.

-- ============================================================
-- 1. Extensión de incideas_registros para carga idempotente
-- ============================================================

ALTER TABLE incideas_registros
  ADD COLUMN IF NOT EXISTS id_origen TEXT,
  ADD COLUMN IF NOT EXISTS huella TEXT,
  ADD COLUMN IF NOT EXISTS id_ejecucion_ultima UUID,
  ADD COLUMN IF NOT EXISTS procedencia_atributos JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estado_espacial TEXT,
  ADD COLUMN IF NOT EXISTS version_registro INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nombre_origen TEXT,
  ADD COLUMN IF NOT EXISTS direccion_normalizada TEXT,
  ADD COLUMN IF NOT EXISTS telefono_normalizado TEXT,
  ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_baja TEXT,
  ADD COLUMN IF NOT EXISTS desactualizado_desde TIMESTAMPTZ;

COMMENT ON COLUMN incideas_registros.id_origen IS
  'Identificador estable proporcionado por la fuente. Clave de idempotencia junto a fuente_principal.';
COMMENT ON COLUMN incideas_registros.huella IS
  'Huella determinista (fuente+codigo_ine+categoria+nombre_normalizado+coords). Se usa cuando la fuente no aporta id_origen.';
COMMENT ON COLUMN incideas_registros.procedencia_atributos IS
  'Procedencia por atributo: { "campo": { "fuente": "...", "fecha": "...", "metodo": "..." } }.';
COMMENT ON COLUMN incideas_registros.estado_espacial IS
  'Resultado de la validación espacial: valido | fuera_municipio | proximo_limite | sin_geometria | geometria_invalida | coordenadas_sospechosas | localizacion_aproximada.';
COMMENT ON COLUMN incideas_registros.eliminado_en IS
  'Borrado lógico. Un registro desaparecido de la fuente se marca aquí, nunca se elimina automáticamente.';

-- ============================================================
-- 2. Índices de idempotencia (redes de seguridad)
-- ============================================================

-- Clave lógica preferente: fuente + identificador de origen
CREATE UNIQUE INDEX IF NOT EXISTS uq_incideas_fuente_origen
  ON incideas_registros(codigo_ine, categoria, fuente_principal, id_origen)
  WHERE id_origen IS NOT NULL AND eliminado_en IS NULL;

-- Clave lógica alternativa: huella determinista (ya incluye la fuente)
CREATE UNIQUE INDEX IF NOT EXISTS uq_incideas_huella
  ON incideas_registros(codigo_ine, categoria, huella)
  WHERE id_origen IS NULL AND huella IS NOT NULL AND eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS idx_incideas_registros_estado_espacial
  ON incideas_registros(estado_espacial);
CREATE INDEX IF NOT EXISTS idx_incideas_registros_eliminado
  ON incideas_registros(eliminado_en);
CREATE INDEX IF NOT EXISTS idx_incideas_registros_id_origen
  ON incideas_registros(id_origen);

-- ============================================================
-- 3. Modelo de ejecuciones
-- ============================================================

CREATE TABLE IF NOT EXISTS incideas_ejecuciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_fuente UUID REFERENCES incideas_fuentes(id) ON DELETE SET NULL,
  conector TEXT NOT NULL,
  version_conector TEXT,
  codigo_ine CHAR(5) REFERENCES municipios(codigo_ine) ON DELETE CASCADE,
  categoria TEXT,
  parametros JSONB DEFAULT '{}'::jsonb,
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'en_curso'
    CHECK (estado IN ('en_curso', 'completada', 'parcial', 'fallida')),
  registros_leidos INTEGER NOT NULL DEFAULT 0,
  registros_insertados INTEGER NOT NULL DEFAULT 0,
  registros_actualizados INTEGER NOT NULL DEFAULT 0,
  registros_sin_cambios INTEGER NOT NULL DEFAULT 0,
  posibles_bajas INTEGER NOT NULL DEFAULT 0,
  registros_rechazados INTEGER NOT NULL DEFAULT 0,
  errores JSONB NOT NULL DEFAULT '[]'::jsonb,
  resumen_calidad JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incideas_ejecuciones_codigo_ine
  ON incideas_ejecuciones(codigo_ine);
CREATE INDEX IF NOT EXISTS idx_incideas_ejecuciones_conector
  ON incideas_ejecuciones(conector);

COMMENT ON TABLE incideas_ejecuciones IS
  'Cada carga constituye una ejecución auditable. No se guardan respuestas masivas; se guardan metadatos, contadores y errores.';

-- ============================================================
-- 4. Extensiones específicas por categoría
-- ============================================================

-- Instalaciones aptas como albergue (evacuación)
CREATE TABLE IF NOT EXISTS incideas_ext_albergue (
  registro_id UUID PRIMARY KEY REFERENCES incideas_registros(id) ON DELETE CASCADE,
  capacidad_ordinaria INTEGER,
  capacidad_adaptada INTEGER,
  cocina BOOLEAN,
  duchas BOOLEAN,
  aseos BOOLEAN,
  agua BOOLEAN,
  suministro_electrico_respaldo BOOLEAN,
  aparcamiento BOOLEAN,
  acceso_vehiculos_pesados BOOLEAN,
  zona_animales BOOLEAN,
  compatible_animales BOOLEAN,
  restricciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recursos veterinarios y de atención animal
CREATE TABLE IF NOT EXISTS incideas_ext_veterinaria (
  registro_id UUID PRIMARY KEY REFERENCES incideas_registros(id) ON DELETE CASCADE,
  especies_atendidas TEXT[],
  urgencias BOOLEAN,
  capacidad_acogida INTEGER,
  transporte BOOLEAN,
  almacenamiento_medicacion BOOLEAN,
  disponibilidad_alimento BOOLEAN,
  alojamiento_temporal BOOLEAN,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE incideas_ext_albergue IS
  'Atributos específicos de instalaciones utilizables como albergue. Evita llenar el núcleo común.';
COMMENT ON TABLE incideas_ext_veterinaria IS
  'Atributos específicos de recursos veterinarios y de acogida animal.';

-- ============================================================
-- 5. Registro de revisiones (trazabilidad de acciones humanas)
-- ============================================================

CREATE TABLE IF NOT EXISTS incideas_revisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id UUID NOT NULL REFERENCES incideas_registros(id) ON DELETE CASCADE,
  accion TEXT NOT NULL
    CHECK (accion IN (
      'aceptar_valor',
      'rechazar_valor',
      'validar',
      'marcar_conflictivo',
      'marcar_pendiente',
      'marcar_obsoleto',
      'fusionar',
      'separar',
      'corregir_categoria',
      'corregir_geometria',
      'observar',
      'confirmar_baja'
    )),
  campo TEXT,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  unidad_validadora TEXT,
  usuario TEXT,
  observaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incideas_revisiones_registro
  ON incideas_revisiones(registro_id);

COMMENT ON TABLE incideas_revisiones IS
  'Cada acción de revisión humana queda registrada. Nunca se edita sin trazabilidad.';
