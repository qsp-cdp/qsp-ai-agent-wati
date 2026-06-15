-- Fase 1.5 — store_facts: fuente única de datos de tienda para la tool `info_tienda`
-- (envíos, pagos, ubicación, horarios). Rellenar `value` con los datos oficiales;
-- mientras esté vacío, la tool lo omite y el bot deriva a un asesor.

create table public.store_facts (
  key text primary key,                  -- envios | pagos | ubicacion | horarios
  label text not null,                   -- título legible para el cliente
  value text not null default '',        -- vacío = no disponible (la tool lo omite)
  updated_at timestamptz not null default now()
);

-- Guardrail del proyecto: auto-expose OFF => GRANT manual a service_role.
alter table public.store_facts enable row level security;
grant select, insert, update, delete on public.store_facts to service_role;

-- Semillas (value vacío hasta completarlas con datos reales de QSP).
insert into public.store_facts (key, label, value) values
  ('envios',    'Envíos y entregas',    ''),
  ('pagos',     'Métodos de pago',      ''),
  ('ubicacion', 'Ubicación',            ''),
  ('horarios',  'Horarios de atención', '')
on conflict (key) do nothing;
