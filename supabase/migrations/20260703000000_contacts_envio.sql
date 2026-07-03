-- Campos de envío capturados por el flujo de WATI:
-- referencia (punto de referencia) y maps_url (link de Google Maps o similar).
alter table public.contacts
  add column if not exists referencia text,
  add column if not exists maps_url text;
