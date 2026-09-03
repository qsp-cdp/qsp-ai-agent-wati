-- v47 (parche) — Refactor de la zona ESTE (vieja Z4) según el modelo operativo real de entrega.
-- Contexto: Servientrega maneja la ruta de reparto a domicilio (no QSP) → entregas impredecibles (si el
-- camión pasa y el cliente no responde, se va al día siguiente) → quejas. Decisión de QSP para simplificar:
--   · Tocumen / Las Mañanitas / 24 de Diciembre  → RETIRO en agente verde ($6). NO se ofrece domicilio.
--     Puntos: AV Shop Box Don Bosco y AV Nuevo Tocumen Shopline (el cliente elige el más cercano).
--   · Pacora / Las Garzas / Felipillo (barrio de 24-Dic) + Ancón-Canal (Paraíso, Pedro Miguel, Summit,
--     Gamboa) → PUERTA A PUERTA vía Servientrega ($9), al día hábil siguiente. (Sin agente verde cercano.)
--   · Cerro Azul (barrios de 24-Dic, en la montaña) → un ASESOR coordina (sin tarifa fija).
-- Es un PARCHE sobre la migración 20260706170000 (que ya está aplicada): reasigna los sectores del viejo
-- 'Z4 Este extendido' a 3 zonas nuevas y actualiza el resolver. Idempotente. Aplicar en el SQL Editor.
-- Z5 Norte (Chilibre, Cumbres…) queda IGUAL por ahora (mismo problema, pero sin punto de retiro cercano).

-- 1) Permitir los métodos nuevos, tarifa nula (para 'asesor') y un campo de puntos de retiro.
alter table public.zonas_entrega drop constraint if exists zonas_entrega_metodo_check;
alter table public.zonas_entrega add  constraint zonas_entrega_metodo_check
  check (metodo in ('propia','servientrega','retiro_agente_verde','asesor'));
alter table public.zonas_entrega alter column tarifa_base_usd drop not null;
alter table public.zonas_entrega add column if not exists puntos_retiro text;

-- 2) Las 3 zonas nuevas del este.
insert into public.zonas_entrega (zona, descripcion, tarifa_base_usd, metodo, plazo, observaciones, puntos_retiro) values
  ('Z4a Este retiro','Este cercano — retiro en agente verde Servientrega', 6, 'retiro_agente_verde',
   'Listo para retirar al día hábil siguiente. En esta zona NO se hace entrega a domicilio.',
   'El cliente retira en el punto; para domicilio, deriva a un asesor.',
   'AV Shop Box Don Bosco (detrás de Plaza Tocumen) o AV Nuevo Tocumen Shopline (Plaza Nuevo Tocumen)'),
  ('Z4b Puerta a puerta','Este lejano / Canal — Servientrega a domicilio', 9, 'servientrega',
   'Al día hábil siguiente a domicilio (vía Servientrega). Confirmar dirección y punto de referencia.',
   'Sin agente verde cercano para retiro; se entrega a la puerta.', null),
  ('Z4c Asesor','Zonas de acceso difícil (Cerro Azul) — coordina un asesor', null, 'asesor',
   'Un asesor coordina la entrega y el costo según la dirección exacta.',
   'Sin tarifa fija; lo maneja un humano.', null)
on conflict (zona) do update set
  descripcion=excluded.descripcion, tarifa_base_usd=excluded.tarifa_base_usd, metodo=excluded.metodo,
  plazo=excluded.plazo, observaciones=excluded.observaciones, puntos_retiro=excluded.puntos_retiro;

-- 3) Reasignar los sectores del viejo 'Z4 Este extendido'.
-- 3a) RETIRO $6: Tocumen, Las Mañanitas, y 24 de Diciembre (salvo Felipillo y Cerro Azul).
update public.sectores_entrega set zona='Z4a Este retiro', updated_at=now()
  where zona='Z4 Este extendido' and corregimiento in ('Tocumen','Las Mañanitas');
update public.sectores_entrega set zona='Z4a Este retiro', updated_at=now()
  where zona='Z4 Este extendido' and corregimiento='24 de Diciembre'
    and barrio_norm not like '%felipillo%' and barrio_norm not like '%cerro azul%';
-- 3b) PUERTA A PUERTA $9: Pacora, Las Garzas, San Martín (San Martín de Pacora, área de Pacora),
--     Felipillo (barrio de 24-Dic) y Ancón-Canal.
update public.sectores_entrega set zona='Z4b Puerta a puerta', updated_at=now()
  where zona='Z4 Este extendido' and corregimiento in ('Pacora','Las Garzas','San Martín','Ancón');
update public.sectores_entrega set zona='Z4b Puerta a puerta', updated_at=now()
  where zona='Z4 Este extendido' and corregimiento='24 de Diciembre' and barrio_norm like '%felipillo%';
-- 3c) ASESOR: Cerro Azul (barrios de 24-Dic).
update public.sectores_entrega set zona='Z4c Asesor', updated_at=now()
  where zona='Z4 Este extendido' and corregimiento='24 de Diciembre' and barrio_norm like '%cerro azul%';

-- 4) Eliminar la vieja Z4 SOLO si ya no quedan sectores apuntándole (si no, no borra: revisar).
delete from public.zonas_entrega z where z.zona='Z4 Este extendido'
  and not exists (select 1 from public.sectores_entrega s where s.zona='Z4 Este extendido');

-- 5) Resolver actualizado: ahora devuelve `puntos_retiro` y maneja método 'asesor' (tarifa nula).
--    El veredicto 'ok' se decide por (metodo, tarifa) único —no solo tarifa— para que 'asesor' (tarifa
--    nula) no caiga por error en 'ambiguo', y para distinguir retiro $6 de propia $6.
create or replace function public.resolver_tarifa(p_lugar text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q text;
  v jsonb;
begin
  q := lower(translate(coalesce(p_lugar,''),
        'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun'));
  q := btrim(regexp_replace(q, '\s+', ' ', 'g'));
  if length(q) < 2 then
    return jsonb_build_object('estado','sin_match','consulta',q);
  end if;

  with base as (
    select s.corregimiento, s.barrio, s.zona, z.tarifa_base_usd, z.metodo, z.plazo, z.puntos_retiro, s.validacion,
           lower(translate(s.corregimiento,'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun')) as correg_norm,
           s.barrio_norm as bn, coalesce(s.alias_norm,'') as an
    from public.sectores_entrega s
    join public.zonas_entrega z on z.zona = s.zona
  ),
  scored as (
    select base.*,
      case
        when correg_norm = q or bn = q or an = q then 3
        when bn like '%'||q||'%' or q like '%'||bn||'%'
             or (an <> '' and (an like '%'||q||'%' or q like '%'||an||'%')) then 1
        else 0
      end as score
    from base
  ),
  m as (
    select * from scored where score = (select max(score) from scored where score > 0)
  )
  select
    case
      when not exists (select 1 from m) then
        jsonb_build_object('estado','sin_match','consulta',q)
      -- un solo (metodo, tarifa) entre los matches -> veredicto único
      when (select count(*) from (select distinct metodo, tarifa_base_usd from m) d) = 1 then
        (select jsonb_build_object(
          'estado','ok','consulta',q,
          'metodo', min(metodo), 'tarifa_usd', min(tarifa_base_usd), 'plazo', min(plazo),
          'puntos_retiro', min(puntos_retiro), 'zona', min(zona),
          'confianza', case when bool_or(validacion = 'Media') then 'Media' else 'Alta' end,
          'sectores', (select jsonb_agg(distinct corregimiento || ': ' || barrio) from m))
         from m)
      -- varios (metodo/tarifa): el nombre cae en zonas distintas -> pedir desambiguación
      else
        jsonb_build_object('estado','ambiguo','consulta',q,
          'opciones', (select jsonb_agg(distinct jsonb_build_object(
            'corregimiento',corregimiento,'zona',zona,'metodo',metodo,'tarifa_usd',tarifa_base_usd,
            'plazo',plazo,'puntos_retiro',puntos_retiro)) from m))
    end
  into v;
  return v;
end;
$$;

grant execute on function public.resolver_tarifa(text) to service_role;

-- Verificación (correr aparte):
--   select public.resolver_tarifa('tocumen');    -- ok  $6 retiro_agente_verde + puntos_retiro
--   select public.resolver_tarifa('pacora');     -- ok  $9 servientrega (puerta a puerta)
--   select public.resolver_tarifa('summit');     -- ok  $9 servientrega
--   select public.resolver_tarifa('cerro azul'); -- ok  metodo asesor, tarifa null
--   select public.resolver_tarifa('el dorado');  -- ok  $6 propia (sin cambios)
--   select public.resolver_tarifa('san jose');   -- ambiguo (Betania $6 retiro? no: propia $6 vs Mañanitas $6 retiro)
