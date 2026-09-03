-- 023: familias de veto urbanístico (Fase 0 del visor de dictamen).
-- El clasificador cliente/servidor (src/lib/familias.ts) funciona sin estas columnas;
-- esta migración las persiste para que el catálogo hable por familia, no por CCAA.

alter table capas_wms
  add column if not exists familia text not null default 'usos'
    check (familia in ('planeamiento','catastro','usos','patrimonio','inundacion','dominio','infra','medio','pecuarias')),
  add column if not exists severidad text not null default 'informativo'
    check (severidad in ('veto','condicionante','informativo')),
  add column if not exists norma_ref text not null default 'Fuente WMS (ver ficha de capa)';

create index if not exists idx_capas_wms_familia on capas_wms (familia);
create index if not exists idx_capas_wms_severidad on capas_wms (severidad);
