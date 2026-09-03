-- 024: expedientes de ámbito (Fase 5 del visor de dictamen).
-- Guarda cada ámbito con nombre, perfil, geojson, estado, confianza y fecha.
-- Local-first en cliente (localStorage); esta tabla prepara el guardado en cuenta
-- cuando exista autenticación. Radar y comparativa siguen fuera de alcance.

create table if not exists ambitos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  nombre text not null default 'Ámbito sin nombre',
  perfil text not null default 'parcela' check (perfil in ('parcela','rustico','cribado','afecciones')),
  geojson jsonb not null default '{"type":"FeatureCollection","features":[]}'::jsonb,
  tipo text not null default 'poligono' check (tipo in ('poligono','punto','linea')),
  estado text check (estado in ('compatible','condicionado','incompatible')),
  confianza text check (confianza in ('alta','media','baja')),
  subtitulo_pendiente boolean not null default false,
  fecha_dictamen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ambitos_user on ambitos (user_id);
create index if not exists idx_ambitos_updated on ambitos (updated_at desc);

alter table ambitos enable row level security;

drop policy if exists "ambitos_select_own" on ambitos;
create policy "ambitos_select_own" on ambitos for select using (auth.uid() = user_id);
drop policy if exists "ambitos_insert_own" on ambitos;
create policy "ambitos_insert_own" on ambitos for insert with check (auth.uid() = user_id);
drop policy if exists "ambitos_update_own" on ambitos;
create policy "ambitos_update_own" on ambitos for update using (auth.uid() = user_id);
drop policy if exists "ambitos_delete_own" on ambitos;
create policy "ambitos_delete_own" on ambitos for delete using (auth.uid() = user_id);
