-- Fase 2C Batch 1: trazabilidad económica por municipio
-- No aplicar en producción sin autorización. Solo diseño + registro.
-- Amplía data_sync_runs sin romper compatibilidad.

-- Añade columnas ligeras para distinguir consolidado/provisional y bloque/fuente
alter table data_sync_runs
  add column if not exists estado_dato text check (estado_dato in ('consolidado','provisional')),
  add column if not exists bloque text,
  add column if not exists periodo text,
  add column if not exists fuente text;

-- Índice para bloqueo temporal de 10 minutos por municipio+tipo
create index if not exists idx_data_sync_runs_bloqueo
  on data_sync_runs (municipio_codigo_ine, tipo_sincronizacion, inicio desc);

-- Comentarios
comment on column data_sync_runs.estado_dato is 'consolidado o provisional; provisional nunca sobrescribe consolidado';
comment on column data_sync_runs.bloque is 'renta|desigualdad|empresas|paro|afiliacion';
comment on column data_sync_runs.periodo is 'YYYY o YYYY-MM para mensual (SEPE/TGSS)';
comment on column data_sync_runs.fuente is 'ine_adrh|aeat_edm|ine_dirce|sepe|tgss';

-- RLS ya activo en data_sync_runs (solo service_role). No se crean políticas públicas.
-- Cómo aplicar (manual, con service_role):
-- supabase db push --include-all
-- o psql con transacción: \i supabase/migrations/030_socideas_economia_phase2c_sync.sql
