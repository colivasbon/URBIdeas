-- 026: resolución territorial del ámbito (CCAA + municipio por centroide).
-- El cruce debe resolverse contra el territorio del recinto, no contra todo el
-- catálogo nacional. Esta función la usa /api/territorio al cerrar el recinto.

drop function if exists resolver_territorio(float, float);
create function resolver_territorio(p_lng float, p_lat float)
returns table (
  municipio_id uuid,
  municipio text,
  codigo_ine text,
  provincia text,
  ccaa text,
  exacto boolean
)
language sql stable as $$
  -- 1) Contención exacta; 2) si el punto cae en un hueco entre geometrías,
  -- vecino más próximo en 10 km marcado como aproximado (exacto=false).
  (select m.id, m.nombre, m.codigo_ine::text, p.nombre, c.nombre, true
  from municipios m
  join provincias p on p.id = m.provincia_id
  join comunidades_autonomas c on c.id = p.comunidad_autonoma_id
  where m.geom is not null
    and ST_Contains(m.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  limit 1)
  union all
  (select m.id, m.nombre, m.codigo_ine::text, p.nombre, c.nombre, false
  from municipios m
  join provincias p on p.id = m.provincia_id
  join comunidades_autonomas c on c.id = p.comunidad_autonoma_id
  where m.geom is not null
    and not exists (
      select 1 from municipios m2
      where m2.geom is not null
        and ST_Contains(m2.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
    )
    and ST_DWithin(
      m.geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      10000
    )
  order by m.geom::geography <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  limit 1)
  limit 1;
$$;
