-- ref_codes — mapeo {ref_code → wa_id, producto_handle} para el stitching WhatsApp→web (v28).
-- El bot (buscar_producto) inserta una fila por link de producto que emite; el CDP resuelve
-- ref_code → wa_id vía el endpoint GET ?ref_code= del copilot-webhook (guardado por RESOLVE_SECRET).
-- Privacidad: el wa_id vive solo en esta tabla, NUNCA en la URL (la URL lleva solo el ref_code opaco).
-- Nota: aplicada a mano en el SQL Editor el 2026-06-24; este archivo la versiona (idempotente).

create table if not exists public.ref_codes (
  ref_code        text primary key,            -- 8 alfanuméricos [A-Za-z0-9]; UNIQUE por el PK
  wa_id           text not null,               -- teléfono (dígitos, sin +), llave de unión con el CDP
  producto_handle text,                        -- handle de Shopify (para enriquecer interés en el CDP)
  created_at      timestamptz not null default now()
);

-- RLS on, solo service_role (auto-expose OFF en este proyecto → GRANT manual obligatorio).
alter table public.ref_codes enable row level security;
grant select, insert on public.ref_codes to service_role;

-- Índice para la limpieza por fecha (purga de ref_codes viejos sin resolver).
create index if not exists ref_codes_created_at_idx on public.ref_codes (created_at);
