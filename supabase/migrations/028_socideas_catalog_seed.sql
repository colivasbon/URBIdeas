-- Fase 2A SOCideas: catálogo inicial (fuente INE Tempus3 + indicadores demográficos).
-- Idempotente: INSERT ... ON CONFLICT (slug) DO UPDATE.
-- Solo contiene tablas/series del INE verificadas en vivo (ver
-- docs/socideas-ine-integration.md). Sin datos de ejemplo.

INSERT INTO public.statistical_sources
  (slug, organismo, nombre, descripcion, url_base, licencia, frecuencia_actualizacion, activo)
VALUES
  ('ine_tempus3', 'Instituto Nacional de Estadística', 'API JSON Tempus3',
   'Tablas estadísticas oficiales del INE en formato JSON: Cifras oficiales de población municipal (DPOP, op. 22) y Padrón Continuo por edad y sexo (op. 188).',
   'https://servicios.ine.es/wstempus/js/ES/',
   'https://www.ine.es/aviso_legal',
   'según operación estadística (DPOP anual definitiva; Padrón Continuo 2003-2022)',
   true)
ON CONFLICT (slug) DO UPDATE SET
  organismo = EXCLUDED.organismo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  url_base = EXCLUDED.url_base,
  licencia = EXCLUDED.licencia,
  frecuencia_actualizacion = EXCLUDED.frecuencia_actualizacion,
  activo = EXCLUDED.activo,
  updated_at = now();

-- Indicadores demográficos de Fase 2A ---------------------------------------
-- Población extranjera y saldo migratorio NO se definen aquí: sin cobertura
-- municipal verificada en Tempus3 (ECP no desagrega a municipio). La ficha
-- los muestra como pendientes sin datos ficticios.
WITH src AS (
  SELECT id FROM public.statistical_sources WHERE slug = 'ine_tempus3'
)
INSERT INTO public.indicator_definitions
  (slug, nombre, grupo, descripcion, unidad, metodologia, fuente_principal_id, periodicidad, visualizacion_recomendada, activo)
SELECT v.slug, v.nombre, v.grupo, v.descripcion, v.unidad, v.metodologia, src.id, v.periodicidad, v.visualizacion, true
FROM src CROSS JOIN (VALUES
  ('population_total', 'Población total', 'demografia',
   'Cifras oficiales de población municipal (revisión del Padrón). DPOP op. 22, tabla provincial PROV-MUN.',
   'personas', 'Valor definitivo anual a 1 de enero (DPOP). Comparativas: provincia (misma tabla), CCAA y España (tabla 2853).',
   'anual', 'stat_card'),
  ('population_male', 'Población masculina', 'demografia',
   'Idéntica fuente y método que population_total, sexo = Hombres (variable 18, valor 452).',
   'personas', 'Serie por sexo de la tabla DPOP provincial.',
   'anual', 'stat_card'),
  ('population_female', 'Población femenina', 'demografia',
   'Idéntica fuente y método que population_total, sexo = Mujeres (variable 18, valor 453).',
   'personas', 'Serie por sexo de la tabla DPOP provincial.',
   'anual', 'stat_card'),
  ('population_evolution', 'Evolución de la población', 'demografia',
   'Serie anual 1996-actualidad de population_total (DPOP). Base de variaciones 5/10 años.',
   'personas', 'n últimos periodos de DATOS_TABLA con filtro tv=19:{valor_municipio}.',
   'anual', 'line_chart'),
  ('population_age_sex', 'Población por edad y sexo', 'demografia',
   'Padrón Continuo op. 188: tabla nacional 33570 (grupos quinquenales, var. 360/357) o provincial equivalente. Año de referencia 2022 (último disponible). Base de pirámide e índices.',
   'personas', 'Filtro tv=19:{valor_municipio}; validación H+M por grupo y coherencia con el total.',
   'anual', 'pyramid'),
  ('population_density', 'Densidad de población', 'demografia',
   'Población DPOP dividida por superficie municipal. PENDIENTE: sin fuente de superficie municipal validada en esta fase.',
   'hab/km2', 'Solo si superficie validada con unidades compatibles; si no, estado pendiente.',
   'anual', 'stat_card'),
  ('population_change_5y', 'Variación de población a 5 años', 'demografia',
   'Derivado propio: (P_t − P_{t−5}) / P_{t−5} × 100 sobre population_evolution.',
   'porcentaje', 'Solo si existen ambos años; si no, se omite con aviso.',
   'anual', 'stat_card'),
  ('population_change_10y', 'Variación de población a 10 años', 'demografia',
   'Derivado propio: (P_t − P_{t−10}) / P_{t−10} × 100 sobre population_evolution.',
   'porcentaje', 'Solo si existen ambos años; si no, se omite con aviso.',
   'anual', 'stat_card')
) AS v(slug, nombre, grupo, descripcion, unidad, metodologia, periodicidad, visualizacion)
ON CONFLICT (slug) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  grupo = EXCLUDED.grupo,
  descripcion = EXCLUDED.descripcion,
  unidad = EXCLUDED.unidad,
  metodologia = EXCLUDED.metodologia,
  fuente_principal_id = EXCLUDED.fuente_principal_id,
  periodicidad = EXCLUDED.periodicidad,
  visualizacion_recomendada = EXCLUDED.visualizacion_recomendada,
  activo = EXCLUDED.activo,
  updated_at = now();
