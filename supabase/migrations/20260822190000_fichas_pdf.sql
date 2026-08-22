-- Caché del texto de las fichas técnicas en PDF (fabricante y/o los que ya hospeda Shopify).
--
-- Por qué hace falta: los datos duros que le faltan a `impresoras_specs` —velocidad ISO, dúplex
-- automático, rendimiento, códigos de consumible— no están ni en la ficha de la tienda ni en los
-- metacampos ni en el HTML de la página oficial del fabricante (Epson los deja fuera del marcado,
-- se cargan por JS). Sí están en el PDF de la ficha técnica. Y el PDF es binario: pg_net devuelve
-- `content` como texto, así que no sirve para bajarlo — por eso el trabajo lo hace una Edge Function
-- (`ficha-pdf`) que lo descarga, le saca el texto y lo deja aquí.
--
-- Se guarda el texto para poder consultarlo con SQL las veces que haga falta sin volver a descargar,
-- y para que quede TRAZABLE de dónde salió cada dato que después se escriba en los metacampos: la
-- desconfianza en los datos de la tienda es justamente lo que originó todo esto.
create table if not exists public.fichas_pdf (
  url          text primary key,
  modelo       text,                    -- a qué modelo se le atribuyó (puede ser null hasta revisarlo)
  paginas      integer,
  bytes        integer,
  texto        text not null,
  extraido_en  timestamptz not null default now()
);

comment on table public.fichas_pdf is
  'Texto extraído de fichas técnicas en PDF. Fuente de los specs oficiales; la columna url es la trazabilidad.';

alter table public.fichas_pdf enable row level security;
revoke all on public.fichas_pdf from anon, authenticated;

-- Sin esto el INSERT de la función rebota con 401 dentro de un catch, como pasó con direcciones_hist.
grant select, insert, update on public.fichas_pdf to service_role;
