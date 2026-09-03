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
-- El RPC filtra por wa_id NORMALIZADO (dígitos) en ambos lados → índice funcional para que sea sargable
-- aunque una fila se hubiera guardado con "+507"/espacios (los escritores deben guardar dígitos, ver doc).
create index if not exists pedidos_wa_norm_idx on public.pedidos ((regexp_replace(wa_id, '\D', '', 'g')));

-- Convergencia / arbitro del upsert = (fuente, pedido_ref). Cada escritor (shopify-webhook / shipday-status
-- / wati-order) conoce el NÚMERO de pedido; en cambio shipday-status NO trae un id interno de Shipday en su
-- webhook, así que (fuente, pedido_ref) es la llave natural común. Un pedido real deja una fila 'shopify' y
-- una 'shipday' con el MISMO pedido_ref → el RPC las agrupa y fusiona (estado por rango de avance, atributos
-- no nulos). pedido_ref nulo (entradas manuales) → varias filas conviven (en un índice compuesto un NULL
-- hace la fila distinta). shopify_order_id/shipday_order_id quedan como columnas de referencia (sin unicidad).
create unique index if not exists pedidos_fuente_ref_key on public.pedidos (fuente, pedido_ref);

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

  -- Un pedido real puede dejar 2 filas (una 'shopify', otra 'shipday'). Se agrupan por número de pedido
  -- (clave prefijada 'id:'||id si no hay número, para que un pedido_ref numérico "5" no choque con un id 5).
  with mine as (
    select id, pedido_ref, estado, estado_raw, metodo, tracking, total_usd, resumen, updated_at,
      coalesce(pedido_ref, 'id:' || id::text) as k,
      -- rango de AVANCE de entrega: un estado avanzado/terminal gana a uno inicial aunque una escritura
      -- TARDÍA lo pise por recencia (p.ej. shopify escribe 'nuevo' en un orders/updated después de que
      -- shipday ya marcó 'en_camino'). Evita que el estado RETROCEDA a 'nuevo'.
      (case estado when 'entregado' then 6 when 'cancelado' then 6 when 'fallido' then 5
                   when 'en_camino' then 4 when 'asignado' then 3 when 'nuevo' then 2 else 1 end) as rk
    from public.pedidos
    where regexp_replace(wa_id, '\D', '', 'g') = wa
  ),
  -- fila PRIMARIA por pedido: la de mayor avance (rk), desempatando por más reciente. De ELLA salen
  -- estado + estado_raw + tracking juntos (coherentes entre sí, no mezclados de filas distintas).
  prim as (
    select distinct on (k) k, estado, estado_raw, tracking
    from mine order by k, rk desc, updated_at desc
  ),
  -- atributos ESTABLES del pedido: el valor NO NULO más fresco entre las filas del grupo (no se pierden si
  -- método/total/resumen vienen de la fila shopify y el estado de la fila shipday).
  attrs as (
    select k, max(updated_at) as last_upd,
      (array_agg(pedido_ref order by updated_at desc) filter (where pedido_ref is not null))[1] as pedido_ref,
      (array_agg(metodo     order by updated_at desc) filter (where metodo     is not null))[1] as metodo,
      (array_agg(total_usd  order by updated_at desc) filter (where total_usd  is not null))[1] as total_usd,
      (array_agg(resumen    order by updated_at desc) filter (where resumen    is not null))[1] as resumen
    from mine group by k
  ),
  top3 as (
    select a.pedido_ref, p.estado, p.estado_raw, a.metodo, p.tracking, a.total_usd, a.resumen, a.last_upd
    from attrs a join prim p on p.k = a.k
    order by a.last_upd desc limit 3
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
--   insert into public.pedidos (wa_id, fuente, pedido_ref, estado, metodo, total_usd)
--     values ('50761234567','shopify','1001','nuevo','propia',127)
--     on conflict (fuente, pedido_ref) do update set estado=excluded.estado, updated_at=now();
--   insert into public.pedidos (wa_id, fuente, pedido_ref, estado, tracking)
--     values ('50761234567','shipday','1001','en_camino','https://track/abc')
--     on conflict (fuente, pedido_ref) do update set estado=excluded.estado, tracking=excluded.tracking, updated_at=now();
--   select public.estado_pedido('+507 6123-4567');   -- ok, 1 pedido 1001 en_camino (rank) + metodo propia + total
--   select public.estado_pedido('50769999999');       -- sin_pedidos
