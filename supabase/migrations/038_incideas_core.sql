-- INCideas: núcleo común de registros territoriales para emergencias

CREATE TABLE IF NOT EXISTS incideas_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ine VARCHAR(5) NOT NULL REFERENCES municipios(codigo_ine) ON DELETE CASCADE,
  categoria VARCHAR(50) NOT NULL,
  subcategoria VARCHAR(100),
  nombre_oficial VARCHAR(255) NOT NULL,
  nombre_normalizado VARCHAR(255) NOT NULL,
  nombres_alternativos TEXT[],
  descripcion TEXT,
  direccion VARCHAR(500),
  nucleo VARCHAR(255),
  barrio VARCHAR(255),
  distrito VARCHAR(255),
  codigo_postal VARCHAR(5),
  geometria GEOMETRY,
  coordenadas JSONB,
  crs_original VARCHAR(50),
  tipo_geometria VARCHAR(20) CHECK (tipo_geometria IN ('punto', 'linea', 'poligono')),
  titularidad VARCHAR(255),
  gestor VARCHAR(255),
  telefono_publico VARCHAR(50),
  correo_publico VARCHAR(255),
  web VARCHAR(500),
  horario VARCHAR(255),
  capacidad INTEGER,
  unidad_capacidad VARCHAR(50),
  aforo INTEGER,
  personal_publicado INTEGER,
  accesibilidad BOOLEAN,
  estado_operativo VARCHAR(100),
  funcion_emergencia TEXT,
  riesgos_asociados TEXT[],
  plan_autoproteccion BOOLEAN DEFAULT FALSE,
  fuente_principal VARCHAR(255) NOT NULL,
  fuentes_secundarias TEXT[],
  url_fuente VARCHAR(500),
  fecha_dato DATE,
  fecha_consulta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_validacion TIMESTAMPTZ,
  metodo_obtencion VARCHAR(100),
  licencia VARCHAR(255),
  calidad VARCHAR(10) CHECK (calidad IN ('alta', 'media', 'baja')),
  confianza INTEGER CHECK (confianza BETWEEN 0 AND 100),
  estado_validacion VARCHAR(50) NOT NULL DEFAULT 'automatico_sin_revisar'
    CHECK (estado_validacion IN (
      'automatico_sin_revisar',
      'contrastado',
      'validado_tecnicamente',
      'validado_ayuntamiento',
      'incompleto',
      'conflictivo',
      'potencialmente_obsoleto',
      'no_disponible',
      'restringido',
      'estimado',
      'pendiente_municipal'
    )),
  unidad_validadora VARCHAR(255),
  observaciones TEXT,
  posible_duplicado BOOLEAN DEFAULT FALSE,
  dato_sensible BOOLEAN DEFAULT FALSE,
  visibilidad VARCHAR(20) NOT NULL DEFAULT 'publica'
    CHECK (visibilidad IN ('publica', 'tecnica', 'restringida', 'personal_protegida')),
  nivel_automatizacion VARCHAR(10) NOT NULL DEFAULT 'baja'
    CHECK (nivel_automatizacion IN ('alta', 'media', 'baja')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por VARCHAR(255),
  actualizado_por VARCHAR(255)
);

CREATE INDEX idx_incideas_registros_codigo_ine ON incideas_registros(codigo_ine);
CREATE INDEX idx_incideas_registros_categoria ON incideas_registros(categoria);
CREATE INDEX idx_incideas_registros_estado ON incideas_registros(estado_validacion);
CREATE INDEX idx_incideas_registros_geometria ON incideas_registros USING GIST(geometria);

-- Tabla de fuentes de INCideas

CREATE TABLE IF NOT EXISTS incideas_fuentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organismo VARCHAR(255) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  tipo VARCHAR(50) NOT NULL
    CHECK (tipo IN (
      'oficial_estructurada',
      'oficial_cartografica',
      'oficial_documental',
      'municipal',
      'operador',
      'colaborativa',
      'comercial',
      'elaboracion_propia',
      'estimacion_tecnica',
      'declaracion_municipal'
    )),
  cobertura VARCHAR(255),
  categorias TEXT[],
  formato VARCHAR(255),
  licencia VARCHAR(255),
  fecha DATE,
  frecuencia VARCHAR(100),
  estabilidad VARCHAR(10) CHECK (estabilidad IN ('alta', 'media', 'baja')),
  limitaciones TEXT,
  campos_disponibles TEXT[],
  nivel_confianza_inicial INTEGER CHECK (nivel_confianza_inicial BETWEEN 0 AND 100),
  url VARCHAR(500),
  comunidad_autonoma VARCHAR(255),
  activa BOOLEAN DEFAULT TRUE,
  ultima_ejecucion TIMESTAMPTZ,
  ultima_ejecucion_correcta TIMESTAMPTZ,
  estado VARCHAR(20) DEFAULT 'pendiente'
    CHECK (estado IN ('activa', 'fallida', 'pendiente', 'inactiva')),
  errores TEXT,
  version_esquema VARCHAR(50),
  transformaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incideas_fuentes_activa ON incideas_fuentes(activa);
CREATE INDEX idx_incideas_fuentes_comunidad ON incideas_fuentes(comunidad_autonoma);

-- Tabla de historial de cambios

CREATE TABLE IF NOT EXISTS incideas_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id UUID NOT NULL REFERENCES incideas_registros(id) ON DELETE CASCADE,
  accion VARCHAR(50) NOT NULL,
  campo VARCHAR(100),
  valor_anterior TEXT,
  valor_nuevo TEXT,
  usuario VARCHAR(255),
  unidad_validadora VARCHAR(255),
  observaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incideas_historial_registro ON incideas_historial(registro_id);

-- Tabla de importaciones

CREATE TABLE IF NOT EXISTS incideas_importaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ine VARCHAR(5) NOT NULL REFERENCES municipios(codigo_ine) ON DELETE CASCADE,
  categoria VARCHAR(50) NOT NULL,
  archivo_nombre VARCHAR(255),
  archivo_url VARCHAR(500),
  filas_totales INTEGER,
  filas_correctas INTEGER,
  filas_con_errores INTEGER,
  filas_duplicadas INTEGER,
  estado VARCHAR(20) DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'previsualizando', 'importada', 'validada', 'publicada', 'fallida')),
  informe JSONB,
  usuario VARCHAR(255),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incideas_importaciones_codigo_ine ON incideas_importaciones(codigo_ine);
