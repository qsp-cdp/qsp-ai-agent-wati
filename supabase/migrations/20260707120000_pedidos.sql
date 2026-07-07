-- pedidos — estado de pedidos/entregas para que el COPILOTO esté "anuente" (v48).
-- Contexto: hoy el bot no sabe si un cliente tiene un pedido en curso. Cuando el cliente pregunta
-- "¿dónde está mi pedido?" el bot no tiene fuente y adivina o deriva a ciegas. Esta tabla es el PUENTE:
--   · La ESCRIBEN las funciones de despacho (shopify-webhook / shipday-status / wati-order) — cada una
--     hace un upsert cuando crea un pedido o cambia su estado (ver docs/handoff-pedidos-conciencia.md).
--   · La LEE el copiloto vía la tool `estado_pedido` → RPC `estado_pedido(p_wa_id)` (solo lectura, por el
--     wa_id del CONTEXTO, nunca del modelo) y frasea el estado en CÓDIGO (grounded, nunca inventa). Si no
--     hay pedido → deriva a un asesor.
-- Llave natural = wa_id (el teléfono), igual que conversations/ref_codes → puente al CDP a futuro.
-- Privacidad: NO se guarda dirección, cédula, RUC ni datos de pago aquí (el bot nunca los necesita para
--   decir el estado). Solo lo mínimo para responder "en qué va su pedido". Retención vía created_at (purga
--   futura de pedidos entregados/cancelados viejos, como ref_codes).
-- Idempotente. Aplicar en el SQL Editor. Auto-expose OFF en este proyecto → GRANT manual obligatorio.

create table if not exists public.pedidos (
  id               bigint generated always as identity primary key,
  wa_id            text not null,                 -- teléfono (dígitos, sin +), llave de unión / lectura del bot
  fuente           text not null                  -- de dónde nació el pedido
                    check (fuente in ('shopify','wati','shipday','manual')),
  pedido_ref       text,                          -- número de pedido visible (ej. "#1234")
  shopify_order_id text,                          -- id externo Shopify (reconciliación / upsert)
  shipday_order_id text,                          -- id externo Shipday (reconciliación / upsert)
  estado           text not null default 'nuevo'  -- estado NORMALIZADO (el bot frasea sobre este)
                    check (estado in ('nuevo','asignado','en_camino','entregado','fallido','cancelado','desconocido')),
  estado_raw       text,                          -- estado crudo del proveedor (no perder fidelidad)
  metodo           text                           -- amarra al modelo de zonas (propia/servientrega/retiro/asesor)
                    check (metodo is null or metodo in ('propia','servientrega','retiro_agente_verde','asesor')),
  tracking         text,                          -- guía Servientrega / link de seguimiento Shipday (si hay)
  total_usd        numeric(10,2),                 -- total del pedido (opcional; no es dato fiscal)
  resumen          text,                          -- resumen corto y liviano (ej. "1x Epson L3250")
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Lectura del bot: los pedidos recientes de un wa_id, del más nuevo al más viejo.
create index if not exists pedidos_wa_id_updated_idx on public.pedidos (wa_id, updated_at desc);

-- Upsert por cada escritor sobre SU id externo. UNIQUE simple (no parcial): en Postgres los NULL son
-- distintos entre sí, así que muchas filas SIN ese id conviven, y el id no-nulo queda único → el escritor
-- puede hacer `on conflict (shopify_order_id) do update ...` sin predicado. (Un pedido real puede dejar una
-- fila 'shopify' y otra 'shipday'; la lectura deduplica por número de pedido y devuelve la más fresca.)
create unique index if not exists pedidos_shopify_order_id_key on public.pedidos (shopify_order_id);
create unique index if not exists pedidos_shipday_order_id_key on public.pedidos (shipday_order_id);

-- RLS on, solo service_role (el ?key= del webhook es el guard; RLS sin policies = solo service_role).
alter table public.pedidos enable row level security;
grant select, insert, update on public.pedidos to service_role;

-- RPC de LECTURA para el bot: pedidos recientes de un wa_id, deduplicados por número de pedido (la fila más
-- fresca por pedido), máx 3. Normaliza el teléfono a dígitos en AMBOS lados (robusto a "+507"/espacios). El
-- copiloto pasa el wa_id del CONTEXTO (no del modelo). security definer → corre con el grant de la tabla.
create or replace function public.estado_pedido(p_wa_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wa text;
  arr jsonb;
begin
  wa := regexp_replace(coalesce(p_wa_id,''), '\D', '', 'g');
  if length(wa) < 6 then
    return jsonb_build_object('estado','sin_pedidos','wa_id',wa);
  end if;

  with mine as (
    select pedido_ref, estado, estado_raw, metodo, tracking, total_usd, resumen, updated_at, id
    from public.pedidos
    where regexp_replace(wa_id, '\D', '', 'g') = wa
  ),
  -- Un pedido real puede dejar 2 filas (una 'shopify', otra 'shipday'). Se agrupan por número de pedido
  -- (o id si no hay número) y se toma: el estado de la fila MÁS FRESCA, y por cada campo el valor NO NULO
  -- más fresco (así el estado sale del último evento y método/total/resumen no se pierden si vienen de la
  -- otra fila). Sin depender de que los escritores converjan a una sola fila.
  grp as (
    select
      coalesce(pedido_ref, id::text) as k,
      max(updated_at) as last_upd,
      (array_agg(estado      order by updated_at desc))[1] as estado,
      (array_agg(estado_raw  order by updated_at desc) filter (where estado_raw is not null))[1] as estado_raw,
      (array_agg(pedido_ref  order by updated_at desc) filter (where pedido_ref is not null))[1] as pedido_ref,
      (array_agg(metodo      order by updated_at desc) filter (where metodo     is not null))[1] as metodo,
      (array_agg(tracking    order by updated_at desc) filter (where tracking   is not null))[1] as tracking,
      (array_agg(total_usd   order by updated_at desc) filter (where total_usd  is not null))[1] as total_usd,
      (array_agg(resumen     order by updated_at desc) filter (where resumen    is not null))[1] as resumen
    from mine
    group by coalesce(pedido_ref, id::text)
  ),
  top3 as (
    select * from grp order by last_upd desc limit 3
  )
  select jsonb_agg(jsonb_build_object(
    'pedido_ref', pedido_ref, 'estado', estado, 'estado_raw', estado_raw,
    'metodo', metodo, 'tracking', tracking, 'total_usd', total_usd, 'resumen', resumen
  ) order by last_upd desc) into arr from top3;

  if arr is null then
    return jsonb_build_object('estado','sin_pedidos','wa_id',wa);
  end if;
  return jsonb_build_object('estado','ok','wa_id',wa,'pedidos',arr);
end;
$$;

grant execute on function public.estado_pedido(text) to service_role;

-- Verificación (correr aparte):
--   insert into public.pedidos (wa_id, fuente, pedido_ref, shopify_order_id, estado, metodo)
--     values ('50761234567','shopify','#1001','gid://shopify/Order/1001','en_camino','propia')
--     on conflict (shopify_order_id) do update set estado=excluded.estado, updated_at=now();
--   select public.estado_pedido('+507 6123-4567');   -- ok, 1 pedido #1001 en_camino propia
--   select public.estado_pedido('50769999999');       -- sin_pedidos
