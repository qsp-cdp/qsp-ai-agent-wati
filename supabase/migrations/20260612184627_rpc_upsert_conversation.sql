-- Upsert atómico de conversación por wa_id + contador diario de turnos
create or replace function public.upsert_conversation(p_wa_id text, p_sender_name text)
returns table (id uuid, status text, turns_today int)
language plpgsql security definer set search_path = public
as $$
begin
  return query
  insert into conversations as c (wa_id, sender_name, last_message_at)
  values (p_wa_id, p_sender_name, now())
  on conflict (wa_id) do update set
    sender_name = coalesce(excluded.sender_name, c.sender_name),
    last_message_at = now(),
    turns_today = case when c.turns_date = current_date then c.turns_today + 1 else 1 end,
    turns_date = current_date
  returning c.id, c.status, c.turns_today;
end;
$$;
revoke all on function public.upsert_conversation(text, text) from public, anon, authenticated;
