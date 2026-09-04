-- P4: capa 3 del resolvedor (geocodificación externa) + DICCIONARIO QUE APRENDE.
--
-- geocache: la misma dirección normalizada no se paga dos veces (hits mide el ahorro). Se cachean
-- también los fallos, para no reintentar en bucle una dirección imposible.
-- geocache_llamadas_hoy(): tope de gasto en código (la Edge Function corta antes de llamar a Google).
create table if not exists public.geocache (
  consulta_norm text primary key,
  consulta_raw  text,
  lat double precision,
  lng double precision,
  zona text,
  corregimiento text,
  estado text not null,                 -- ok | sin_resultado | fuera_area | error
  fuente text not null default 'google',
  hits int not null default 1,
  nombre_lugar text,                    -- displayName de Google: el nombre canónico que se aprende
  promovido boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists geocache_created_idx on public.geocache (created_at desc);
alter table public.geocache enable row level security;
grant select, insert, update on public.geocache to service_role;

create or replace function public.geocache_llamadas_hoy()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.geocache where created_at >= now() - interval '24 hours';
$$;
revoke execute on function public.geocache_llamadas_hoy() from public, anon, authenticated;
grant execute on function public.geocache_llamadas_hoy() to service_role;

-- EL DICCIONARIO APRENDE: cada lugar que Google resuelve se vuelve una entrada permanente, para que
-- la próxima vez —y cualquier VARIANTE de la frase— resuelva gratis por texto.
-- Se indexa el NOMBRE CANÓNICO de Google (ej. "EMTOP Vía Brasil"), no la frase del cliente.
--
-- GUARDARRAÍL CLAVE: solo se aprende si ese nombre APARECE en lo que escribió el cliente. Si escribió
-- "emtop" y Google respondió "EMTOP Vía Brasil", el solapamiento confirma que acertó el lugar; si
-- escribió "la casa de mi tía" y Google devolvió cualquier cosa, no hay solapamiento y NO se aprende.
-- Además: la zona sale del polígono oficial (no de Google), el nombre debe ser distintivo (>=6 chars,
-- primera palabra >=4), no puede pisar una entrada existente, y homónimos con zonas distintas se
-- descartan. Marcado tipo_zona='Aprendido (Google)' → auditable y reversible con un DELETE.
-- Nota: las columnas de RETURNS TABLE llevan prefijo out_ porque, sin él, chocan con las columnas
-- homónimas de las tablas ("column reference zona is ambiguous").
drop function if exists public.promover_geocache_al_diccionario();

create or replace function public.promover_geocache_al_diccionario()
returns TABLE(out_nombre text, out_zona text, out_correg text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with listos as (
    select g.consulta_norm as cn, g.nombre_lugar as nl, g.zona as zn, g.corregimiento as cg,
           norm_lugar(g.nombre_lugar) as nom_norm
    from public.geocache g
    where g.estado = 'ok' and g.zona is not null and g.promovido = false
      and coalesce(btrim(g.nombre_lugar), '') <> ''
  ),
  validos as (
    select * from listos l
    where length(l.nom_norm) >= 6
      and l.nom_norm ~ '[a-z]'
      and (' ' || l.cn || ' ') like ('%' || split_part(l.nom_norm, ' ', 1) || '%')
      and length(split_part(l.nom_norm, ' ', 1)) >= 4
      and not exists (
        select 1 from public.sectores_entrega s
        where norm_lugar(s.barrio) = l.nom_norm or norm_lugar(s.corregimiento) = l.nom_norm
           or (', ' || coalesce(s.alias_norm,'') || ',') like ('%, ' || l.nom_norm || ',%')
      )
  ),
  unicos as (
    select v.nom_norm, min(v.zn) as zn, min(v.cg) as cg, min(v.nl) as nl
    from validos v group by v.nom_norm having count(distinct v.zn) = 1
  ),
  insertados as (
    insert into public.sectores_entrega
      (corregimiento, barrio, barrio_norm, alias_norm, zona, tipo_zona, validacion, nota, updated_at)
    select u.cg, u.nl, u.nom_norm, u.nom_norm, u.zn, 'Aprendido (Google)', 'Media',
           'Aprendido automáticamente: Google ubicó este lugar y el polígono oficial dio la zona. Revisar si la entrega es crítica.',
           now()
    from unicos u
    returning sectores_entrega.barrio, sectores_entrega.zona, sectores_entrega.corregimiento
  )
  select i.barrio, i.zona, i.corregimiento from insertados i;

  update public.geocache g set promovido = true
  where g.estado = 'ok' and g.zona is not null and g.promovido = false
    and coalesce(btrim(g.nombre_lugar), '') <> '';
end $$;

revoke execute on function public.promover_geocache_al_diccionario() from public, anon, authenticated;
grant execute on function public.promover_geocache_al_diccionario() to service_role;
