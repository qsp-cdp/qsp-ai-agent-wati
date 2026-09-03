-- Señal autoritativa de contacto nuevo desde el evento newContactMessageReceived de WATI
alter table public.conversations add column if not exists confirmed_new boolean not null default false;
alter table public.conversations add column if not exists first_contact_at timestamptz;
