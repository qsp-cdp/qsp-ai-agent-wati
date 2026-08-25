-- Puente entre WATI y el freno del copiloto: el atributo `no_es_cliente` del contacto pasa a
-- `status='cerrada'`. Estas dos columnas son lo que hace que el puente sea barato y, sobre todo, que
-- no se le lleve por delante una decisión tomada a mano.
--
-- POR QUÉ UN ATRIBUTO Y NO EL EQUIPO. La idea original era marcar a los proveedores con un EQUIPO de
-- WATI, que es el lugar correcto: la decisión viviría donde el equipo de ventas ya trabaja. Se midió y
-- no se puede, hoy:
--   · El equipo NO viaja en el webhook. En 8 mensajes de clientes el campo del asignado vino vacío, y
--     ninguno de los tres tipos de evento trae equipo.
--   · La API que el copiloto alcanza con su token devuelve `teamIds: null` INCLUSO con el contacto ya
--     dentro del equipo. Se probaron cinco rutas: `/api/v1/getContacts` responde 200 pero con el campo
--     vacío, y `/api/v2/getContacts`, `/api/v1/getTeams`, `/api/v1/getContact/<num>` y
--     `/api/v1/getContactAttributes/<num>` responden 404. El token abre solo la v1 pública.
-- Los atributos personalizados sí vuelven en esa misma llamada — verificado de ida y vuelta — y el
-- copiloto ya sabe escribirlos con `updateContactAttributes`. Es el único camino sin incógnitas.
--
-- `no_cliente_revisado_at` — cuándo se le preguntó por última vez a WATI por este contacto. Sin esto
-- habría una llamada de red por CADA mensaje. Con esto es una por contacto cada 12 h.
--
-- `cerrada_por` — QUIÉN cerró la conversación, y es la columna importante. El copiloto solo puede
-- reabrir lo que él mismo cerró (`'wati_atributo'`). Una conversación cerrada a mano queda intocable:
-- reabrirla porque un atributo no está sería repetir exactamente el defecto que costó la fuga del
-- 25-ago, donde el código pisó una decisión del negocio porque no miró de dónde venía.
alter table public.conversations
  add column if not exists no_cliente_revisado_at timestamptz,
  add column if not exists cerrada_por text;

comment on column public.conversations.no_cliente_revisado_at is
  'Última vez que se consultó el atributo no_es_cliente del contacto en WATI. Limita la consulta a una por contacto cada 12 h.';
comment on column public.conversations.cerrada_por is
  'Quién puso status=cerrada. ''wati_atributo'' = lo cerró el copiloto leyendo WATI, y solo eso lo puede reabrir solo. NULL = decisión humana, el código no la toca.';

-- La del proveedor la cerré yo a mano esta tarde, así que se queda como decisión humana (cerrada_por
-- NULL): que el puente no la reabra si alguien le quita el atributo sin querer. El freno duro del
-- secret WA_IGNORAR sigue debajo de todo esto de todas formas.
