-- Detecta contactos que parecen PROVEEDOR y no cliente, para que el watchdog avise.
--
-- Caso real (25-ago-2026): el copiloto llevaba 44 respuestas contestándole a un proveedor. Y no era
-- solo ruido: el asesor le preguntaba "¿tienes 0692C005AA?" para COMPRARLE, el proveedor contestaba
-- "$46.80, disponible 7", y el bot se metía con NUESTRO precio de venta ("$54.99 + ITBMS, 5 unidades").
-- Le mostró a un proveedor nuestro margen y nuestro inventario, durante 60 días, sin que nadie lo viera.
--
-- LA SEÑAL es que NOSOTROS somos los que compramos: mensajes de `human-agent` con el verbo en segunda
-- persona ("¿tienes…?", "¿me cotizas…?", "¿cuánto te…?"). Un asesor no le habla así a un cliente. Se
-- exigen 2+ para que una frase suelta no dispare. Probado sobre 60 días: de 3.043 conversaciones
-- devuelve exactamente una, la del proveedor.
--
-- SOLO REPORTA. El `status='cerrada'` lo pone una persona (v70.1 del copiloto): cerrar por cuenta
-- propia silenciaría a un cliente real cada vez que la heurística se equivoque, y eso no se ve venir.
create or replace function public.contactos_posibles_proveedores(dias int default 30)
returns table (wa_id text, nombre text, respuestas_bot bigint, preguntas bigint)
language sql
stable
security definer
set search_path = public
as $$
  with senal as (
    select c.wa_id, c.sender_name,
           count(*) filter (
             where m.role = 'assistant' and coalesce(m.model,'') <> 'human-agent'
           ) as respuestas_bot,
           count(*) filter (
             where m.model = 'human-agent'
               and m.content ~* '\y(tienes|tendrás|tendras|manejas|me consigues|me cotizas|te queda|cuánto te|cuanto te|me puedes conseguir|precio de costo)\y'
           ) as preguntas
    from public.conversations c
    join public.messages m on m.conversation_id = c.id
    where m.created_at > now() - make_interval(days => greatest(1, least(dias, 180)))
      and c.status <> 'cerrada'
    group by c.wa_id, c.sender_name
  )
  select s.wa_id, s.sender_name, s.respuestas_bot, s.preguntas
  from senal s
  where s.preguntas >= 2 and s.respuestas_bot >= 1
  order by s.respuestas_bot desc
  limit 20;
$$;

-- P0-1: la función lee mensajes de clientes. NUNCA ejecutable con la clave pública.
revoke all on function public.contactos_posibles_proveedores(int) from public, anon, authenticated;
grant execute on function public.contactos_posibles_proveedores(int) to service_role;

-- El proveedor que destapó el caso queda cerrado. Reversible con status='bot'.
update public.conversations set status = 'cerrada' where wa_id = '50767417632';
