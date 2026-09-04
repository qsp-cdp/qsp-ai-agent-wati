-- Trazabilidad + primer modelo cargado desde la ficha oficial del fabricante.
--
-- El origen de todo esto: "no confío en esos datos". La respuesta correcta no es cargar datos mejores,
-- es que cada dato diga DE DÓNDE salió. Estas dos columnas son eso: `fuente_url` apunta al documento
-- del fabricante y `fuente_fecha` a cuándo se leyó. Una fila con fuente se puede auditar; una sin
-- fuente hay que volver a creerla.
alter table public.impresoras_specs add column if not exists fuente_url   text;
alter table public.impresoras_specs add column if not exists fuente_fecha date;

comment on column public.impresoras_specs.fuente_url is
  'Documento del fabricante del que salieron los specs (su texto queda en fichas_pdf). Sin esto, el dato no es auditable.';

-- Epson EcoTank L5590 — leída del folleto oficial de Epson (el PDF que la propia tienda hospeda).
-- Confirma la corrección de la mañana (ISO 15/8) y destapa dos cosas más:
--   · La velocidad de BORRADOR real es 30/20 ppm, no 33/20 como dice el título del producto.
--   · Soporta Oficio (215,9 x 355,6 mm), así que su tamaño máximo es legal, no carta.
-- El dúplex sigue sin ser automático: el folleto no lo lista entre las características.
update public.impresoras_specs set
  ppm_negro     = '15',
  ppm_color     = '8',
  adf           = true,
  duplex_auto   = false,
  wifi          = true,
  ethernet      = true,
  tamano_maximo = 'legal',
  consumibles   = 'Botellas T544: T544120-AL negro, T544220-AL cian, T544320-AL magenta, T544420-AL amarillo. Caja de mantenimiento C9344',
  notas         = 'ADF de 30 hojas; dúplex MANUAL; ISO 15/8 ppm (borrador 30/20 según Epson — el título del producto dice 33, es incorrecto); Wi-Fi + Wi-Fi Direct + Ethernet 10/100; soporta Oficio; reemplaza a la L5290',
  fuente_url    = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Folleto-EcoTank-L5590-v2.pdf.pdf?v=1679493051',
  fuente_fecha  = date '2026-08-22',
  updated_at    = now()
where modelo = 'Epson EcoTank L5590';
