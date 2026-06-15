-- Copiloto WATI — esquema inicial (Fase 0)
-- Diseño: docs/design/2026-06-12-proyecto-copilot-wati.md (repo qsp-cdp-docs)

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,            -- teléfono WhatsApp (llave natural; misma llave que el CDP)
  sender_name text,
  status text not null default 'bot' check (status in ('bot','handoff','cerrada')),
  turns_today int not null default 0,    -- tope anti-loop de costos
  turns_date date not null default current_date,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id),
  role text not null check (role in ('user','assistant','tool','system')),
  content text,
  tool_calls jsonb,                      -- llamadas a tools del turno (si hubo)
  mode text not null default 'shadow' check (mode in ('shadow','live')),
  model text,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  wati_message_id text,                  -- dedup de webhooks reintentados
  created_at timestamptz not null default now()
);
create unique index messages_wati_msg_uq on public.messages (wati_message_id) where wati_message_id is not null;
create index messages_conv_idx on public.messages (conversation_id, created_at desc);

create table public.handoffs (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id),
  motivo text not null,
  resuelto boolean not null default false,
  created_at timestamptz not null default now()
);

-- Log operativo de la función (patrón outbound_job_log del CDP, simplificado)
create table public.job_log (
  id bigint generated always as identity primary key,
  function_name text not null,
  action text not null,
  ok boolean not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- RLS: activado sin policies => solo service_role (las edge functions) accede.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.handoffs enable row level security;
alter table public.job_log enable row level security;
