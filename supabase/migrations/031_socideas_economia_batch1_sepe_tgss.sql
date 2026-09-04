-- Batch 1: SEPE y TGSS – fuentes y catálogo de indicadores
-- No aplicar sin autorización. Solo diseño + registro.

insert into statistical_sources (slug, organismo, nombre, url_base, activo) values
  ('sepe', 'SEPE', 'Paro registrado y contratos por municipio', 'https://www.sepe.es/SiteSepe/contenidos/que_es_el_sepe/estadisticas/datos_avance/datos', true),
  ('tgss', 'TGSS', 'Afiliación a la Seguridad Social por municipio (último día del mes)', 'https://www.seg-social.es/wps/portal/wss/internet/EstadisticasPresupuestosEstudios/Estadisticas', true)
on conflict (slug) do update set organismo=excluded.organismo, nombre=excluded.nombre, url_base=excluded.url_base, activo=true;

insert into indicator_definitions (slug, nombre, unidad, grupo, activo) values
  ('paro_registrado', 'Paro registrado', 'personas', 'economia', true),
  ('afiliacion_total', 'Afiliados a la Seguridad Social', 'personas', 'economia', true)
on conflict (slug) do update set nombre=excluded.nombre, unidad=excluded.unidad, grupo='economia', activo=true;

-- Comentario: TGSS "<5" nunca se guarda como 0; se omite fila y se registra sin_cobertura. SEPE libro completo ~4 MB, mensual.
