-- P3-c: directorio de PH (Propiedad Horizontal) de Panamá para el diccionario de direcciones.
-- Fuente: eldeph.com (directorio público, ~2,477 PH). Se captura nombre + ubicación
-- ("Ciudad, Corregimiento") desde las 207 páginas del listado con la Edge Function ph-loader.
-- Uso futuro: resolver_tarifa_v2 podrá reconocer "PH Terrasol" → corregimiento San Francisco → zona.
-- Solo service_role la lee/escribe (RLS sin políticas, mismo patrón que las demás tablas operativas).

create table if not exists public.ph_directorio (
  id bigint generated always as identity primary key,
  slug text not null unique,          -- slug de eldeph.com: identidad estable para re-cargas (upsert)
  nombre text not null,               -- "P.H. TERRASOL" tal como aparece en el directorio
  ubicacion_raw text,                 -- "Ciudad de Panamá, San Francisco." (crudo, por si el split falla)
  ciudad text,                        -- best-effort: parte antes de la coma
  corregimiento text,                 -- best-effort: parte después de la coma (llave para cruzar con zonas)
  fuente text not null default 'eldeph',
  pagina int,                         -- página del listado de la que salió (trazabilidad de la carga)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Búsquedas del resolvedor: por nombre normalizado y por corregimiento.
create index if not exists ph_directorio_nombre_idx on public.ph_directorio (lower(nombre));
create index if not exists ph_directorio_correg_idx on public.ph_directorio (lower(corregimiento));

alter table public.ph_directorio enable row level security;
-- Sin políticas a propósito: PostgREST solo permite service_role (anon/authenticated quedan fuera).
