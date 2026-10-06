-- Fase 3 Hito 1: catálogos de bloques y fuentes verificadas (solo creación).
-- Decisión documentada: NO se toca la tabla existente `incideas_fuentes`
-- (registro de conectores del piloto, otra forma); el catálogo de fuentes
-- nacionales/autonómicas con licencia+edición+conector vive en
-- `incideas_fuentes_nac`. Nada existente se modifica.
-- Reversión: 042_incideas_fase3_down.sql

CREATE TABLE IF NOT EXISTS incideas_bloques (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  fase SMALLINT NOT NULL CHECK (fase BETWEEN 1 AND 4),
  via TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS incideas_fuentes_nac (
  codigo TEXT PRIMARY KEY,
  organismo TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  licencia TEXT NOT NULL DEFAULT '',
  edicion TEXT NOT NULL DEFAULT '',
  cobertura TEXT NOT NULL DEFAULT '',
  conector TEXT NOT NULL DEFAULT '',
  frecuencia TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'candidata' CHECK (estado IN ('candidata','verificada','parcial','no_abierta','caida'))
);

ALTER TABLE incideas_bloques ENABLE ROW LEVEL SECURITY;
ALTER TABLE incideas_fuentes_nac ENABLE ROW LEVEL SECURITY;

INSERT INTO incideas_bloques (codigo, nombre, fase, via, descripcion) VALUES
  ('limites', 'Términos municipales', 1, 'IGN AU (WFS)', 'Límite oficial por municipio; el punto municipal no se sustituye.'),
  ('poblacion', 'Padrón INE (observación anual)', 1, 'INE Tempus3 DPOP', 'Anualidades; no son recursos ni llevan coordenadas.'),
  ('hidrografia', 'Red hidrográfica IGR', 1, 'IGN hidro WFS (Fase 2A)', 'Miembros originales; no equivalen a cauces.'),
  ('inundabilidad', 'Inundabilidad SNCZI/PATRICOVA', 1, 'MITECO/IDEE + GVA', 'Raster SNCZI + SHP PATRICOVA en CV; contención vectorial pendiente.'),
  ('depuradoras', 'Estaciones depuradoras (EDAR)', 1, 'PRTR + CCAA', 'PRTR cubre >=100k e-h; resto por agregación autonómica.'),
  ('combustible', 'Estaciones de servicio', 1, 'MINETUR', 'Conector existente verificado.'),
  ('recarga', 'Puntos de recarga eléctrica', 1, 'NAP DATEX2 + RIPREE', 'Muestra verificada; RIPREE vía POST.'),
  ('educacion', 'Centros educativos', 1, 'RCD/CCAA + RUCT', 'RCD parcial por CCAA; RUCT solo ficha.'),
  ('sanidad', 'Centros sanitarios', 1, 'REGCESS', 'XLSX nacional sin coordenadas.'),
  ('farmacias', 'Oficinas de farmacia', 1, 'REGCESS-E', 'Parcial sin coordenadas; BOT PLUS no abierto.'),
  ('carreteras', 'Red viaria', 2, 'Nacional/autonómica', 'Fase 2 con evidencia.'),
  ('ferrocarril', 'Ferrocarril', 2, 'Nacional/autonómica', 'Fase 2 con evidencia.'),
  ('autobus', 'Autobús y GTFS verificado', 2, 'Autonómica/operador', 'GTFS solo verificado.'),
  ('deporte', 'Instalaciones deportivas', 2, 'Mixta', 'Fase 2 con evidencia.'),
  ('cultura', 'Equipamientos culturales', 2, 'Mixta', 'Fase 2 con evidencia.'),
  ('turismo', 'Turismo y hostelería', 2, 'Mixta', 'Fase 2 con evidencia.'),
  ('sociosanitario', 'Recursos sociosanitarios', 2, 'Mixta', 'Fase 2 con evidencia.'),
  ('administracion', 'Administración', 2, 'Mixta', 'Fase 2 con evidencia.'),
  ('nucleos', 'Núcleos de población', 2, 'Mixta', 'Fase 2 con evidencia.'),
  ('incendios', 'Incendios forestales', 2, 'Mixta', 'Sin dataset autonómico verificado aún.'),
  ('hidrantes', 'Hidrantes y bocas de riego', 4, 'Aportación municipal', '1.132 filas en el documento; sin fuente abierta nacional.'),
  ('transformadores', 'Centros de transformación', 4, 'Aportación operador', '531 filas en el documento.'),
  ('autoproteccion', 'Planes de autoprotección', 4, 'Aportación municipal', '141 en el documento.'),
  ('evacuacion', 'Evacuación y albergues', 4, 'Aportación municipal', 'Solo lo designado formalmente.'),
  ('vulnerables', 'Población vulnerable (agregados)', 4, 'Aportación municipal', 'Agregados, nunca datos individuales.')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO incideas_fuentes_nac (codigo, organismo, url, licencia, edicion, cobertura, conector, frecuencia, estado) VALUES
  ('ign-au', 'IGN', 'https://www.ign.es/wfs-inspire/unidades-administrativas', 'CC BY 4.0', 'continua', 'nacional', 'fase2a-pipeline', 'anual', 'verificada'),
  ('ine-dpop', 'INE', 'https://servicios.ine.es/wstempus/', 'abierta INE', '2025 definitivo', 'nacional', 'sync-all-municipios', 'anual', 'verificada'),
  ('ign-hidro', 'IGN', 'https://servicios.idee.es/wfs-inspire/hidrografia', 'CC BY 4.0', 'IGR v0 2019', 'nacional', 'fase2a-pipeline', 'por edición', 'verificada'),
  ('snczi-inspire', 'MITECO', 'https://servicios.idee.es/wms-inspire/riesgos-naturales/inundaciones', 'CC BY 4.0', 'continua', 'nacional (raster)', 'fase2a-pipeline', 'por edición', 'verificada'),
  ('patricova', 'Generalitat Valenciana', 'https://dadesobertes.gva.es/', 'CC BY', 'vigente', 'Comunitat Valenciana', 'fase2a-pipeline', 'por edición', 'verificada'),
  ('minetur-carburantes', 'MINETUR', 'https://geoportalgasolineras.es/', 'abierta', 'continua', 'nacional', 'minetur-carburantes', 'mensual', 'verificada'),
  ('nap-recarga', 'NAP', 'NAP DATEX II', 'abierta', '24 h', 'nacional (muestra)', 'fase3-recarga', 'diaria', 'verificada'),
  ('regcess', 'Ministerio de Sanidad', 'REGCESS', 'abierta', '2026-10-01', 'nacional sin coords', 'fase3-regcess', 'mensual', 'verificada'),
  ('regcess-e', 'Ministerio de Sanidad', 'REGCESS-E', 'abierta', 'nacional sin coords', 'nacional (farmacias, parcial)', 'fase3-regcess', 'mensual', 'parcial'),
  ('prtr', 'MITECO PRTR', 'PRTR España', 'abierta', 'continua', 'instalaciones >=100k e-h', 'fase3-prtr', 'anual', 'parcial'),
  ('rcd', 'Ministerio de Educación', 'RCD', 'abierta', 'continua', 'nacional por CCAA, sin bulk', 'fase3-rcd', 'anual', 'parcial'),
  ('bot-plus', 'CGCOF', 'BOT PLUS', 'suscripción', '—', 'sin descarga abierta', '—', '—', 'no_abierta'),
  ('navarra-educacion-2026', 'Gobierno de Navarra', 'https://datosabiertos.navarra.es/', 'CC BY', '2026-09-16', 'Navarra', 'fase3-autonomicas', 'anual', 'verificada'),
  ('navarra-farmacias', 'Gobierno de Navarra', 'https://datosabiertos.navarra.es/', 'CC BY', '2026-09-30', 'Navarra', 'fase3-autonomicas', 'mensual', 'verificada'),
  ('gva-educacion-2020', 'Generalitat Valenciana', 'https://dadesobertes.gva.es/', 'CC BY', '2021-06-01', 'Comunitat Valenciana', 'fase3-autonomicas', 'por edición', 'verificada'),
  ('tenerife-sanidad-farmacias', 'Cabildo de Tenerife', 'https://datos.tenerife.es/', 'abierta', '2026-05-31', 'Tenerife', 'fase3-autonomicas', 'por edición', 'verificada')
ON CONFLICT (codigo) DO NOTHING;
