-- messages: columnas de telemetría de prompt caching (v38). El prompt caching (v35) abarató el input,
-- pero tokens_in (= usage.input_tokens) NO incluye lo leído/escrito al caché, así que no se podía medir
-- el ahorro $ exacto ni el hit-rate. Estas dos columnas guardan, por turno, los tokens de caché que
-- reporta la API de Anthropic (usage.cache_read_input_tokens / usage.cache_creation_input_tokens),
-- sumados a través de las iteraciones del loop de tool-use. Solo telemetría: no cambian comportamiento.
-- Lectura de caché se factura 0.1×, escritura 1.25×, el resto (tokens_in) 1×.
-- Nota: ADD COLUMN sobre una tabla existente NO requiere GRANT nuevo (el grant a service_role es a nivel
-- de tabla y cubre las columnas nuevas). Idempotente; aplicar en el SQL Editor.

alter table public.messages
  add column if not exists cache_read_input_tokens     integer,
  add column if not exists cache_creation_input_tokens integer;

comment on column public.messages.cache_read_input_tokens     is 'Tokens leídos del prompt cache (usage.cache_read_input_tokens), facturados 0.1×. v38.';
comment on column public.messages.cache_creation_input_tokens is 'Tokens escritos al prompt cache (usage.cache_creation_input_tokens), facturados 1.25×. v38.';
