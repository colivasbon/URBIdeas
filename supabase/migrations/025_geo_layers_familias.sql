-- 025: familias de veto en geo_layers (revisión manual del catálogo).
-- capas_wms ya tiene familia/severidad/norma_ref (023). Esta migración añade las
-- mismas columnas a geo_layers para que las correcciones manuales persistan y la
-- API las respete. Sin esto, el clasificador automático sobrescribiría lo corregido.

alter table geo_layers
  add column if not exists familia text not null default 'usos'
    check (familia in ('planeamiento','catastro','usos','patrimonio','inundacion','dominio','infra','medio','pecuarias')),
  add column if not exists severidad text not null default 'informativo'
    check (severidad in ('veto','condicionante','informativo')),
  add column if not exists norma_ref text not null default 'Fuente WMS (ver ficha de capa)';

create index if not exists idx_geo_layers_familia on geo_layers (familia);
create index if not exists idx_geo_layers_severidad on geo_layers (severidad);
