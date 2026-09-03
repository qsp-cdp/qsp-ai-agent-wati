-- Fase 1.5 — store_facts: espejo (snapshot) del metaobjeto Shopify `store_facts/datos-tienda`.
-- Fuente única que lee la tool `info_tienda`. Mismas keys que el metaobjeto (canónico).
-- Al editar el metaobjeto en Shopify, vuelve a correr el upsert de abajo para sincronizar.

create table public.store_facts (
  key text primary key,                  -- misma key que el campo del metaobjeto
  value text not null default '',        -- vacío = no disponible (info_tienda lo omite)
  updated_at timestamptz not null default now()
);

-- Guardrail del proyecto: auto-expose OFF => GRANT manual a service_role (la edge function).
alter table public.store_facts enable row level security;
grant select, insert, update, delete on public.store_facts to service_role;

-- Seed = valores reales del metaobjeto Shopify (2026-06-16). 🔒 Sin números de cuenta.
insert into public.store_facts (key, value) values
 ('nombre_negocio','Quick Service Panamá'),
 ('envio_gratis_umbral_usd','300'),
 ('envio_resumen','En compras en línea mayores a US$300, el envío es gratis. Despachamos el mismo día en la Ciudad de Panamá y al día hábil siguiente en el interior del país.'),
 ('plazo_ciudad_panama','Mismo día en pedidos antes de las 3:00 p.m.; después, al día hábil siguiente.'),
 ('tarifa_ciudad_panama','desde B/.6.00 (San Miguelito B/.7.00; Tocumen B/.10.00)'),
 ('plazo_interior','Día hábil siguiente; Bocas del Toro y Darién de 3 a 5 días hábiles.'),
 ('tarifa_interior','B/.6.00 a sucursal / B/.9.00 puerta a puerta (vía Servientrega)'),
 ('comarcas_sin_servicio','Por el momento no entregamos en las comarcas: Guna Yala, Emberá-Wounaan y Ngäbe-Buglé.'),
 ('recoger_en_tienda','Elige "Recoger en tienda" al pagar y retira en Plaza Aventura, Piso 4, Oficina 454, Vía Ricardo J. Alfaro, Ciudad de Panamá (lunes a viernes, 9:00 a.m. – 5:00 p.m.).'),
 ('seguimiento','Para dar seguimiento, escríbenos por WhatsApp al +507 6950-9988. Si la dirección proporcionada es incorrecta, el costo del reenvío corre por cuenta del cliente.'),
 ('reembolso_dias','15'),
 ('reembolso_resumen','Reembolso hasta 15 días después de la compra con factura, producto sin usar y en empaque original. El transporte de la devolución corre por cuenta del cliente. Falla de fábrica dentro de los 15 días: reemplazo sujeto a inventario; pasado ese plazo aplica la garantía del fabricante.'),
 ('metodos_pago','Visa y Mastercard en el checkout en línea. Yappy, ACH y transferencia bancaria se coordinan por WhatsApp al confirmar el pedido.'),
 ('direccion','Plaza Aventura, Piso 4, Oficina 454, Vía Ricardo J. Alfaro, Ciudad de Panamá'),
 ('horario','Lunes a viernes, 9:00 a.m. – 5:00 p.m.'),
 ('whatsapp','+507 6950-9988'),
 ('correo','ventas@quickservicepanama.com')
on conflict (key) do update set value = excluded.value, updated_at = now();
