-- Libreta de direcciones migrada desde Tookan.
-- phone_digits: últimos 8 dígitos del teléfono, para buscar ignorando el
-- formato (+507, espacios, guiones) — es la llave de búsqueda del bot de WATI.
create table if not exists public.contacts (
  id bigint generated always as identity primary key,
  tookan_customer_id text,
  name text not null default '',
  phone text not null default '',
  phone_digits text generated always as (
    right(regexp_replace(phone, '\D', '', 'g'), 8)
  ) stored,
  email text,
  address text not null default '',
  latitude double precision,
  longitude double precision,
  source text not null default 'tookan',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_phone_digits_idx on public.contacts (phone_digits);

-- Solo las Edge Functions (service role) acceden a la tabla; sin políticas
-- públicas, el API anónimo no puede leer datos personales.
alter table public.contacts enable row level security;
