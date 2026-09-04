-- Tanda 2: tres modelos más leídos de la ficha oficial del fabricante.
-- Misma regla: se escribe solo lo que el documento afirma; donde calla, la fila se queda como está.

-- HP Smart Tank 750 — ISO 15/9, ADF y dúplex AUTOMÁTICO confirmados (la tabla ya estaba bien).
-- Se agregan los consumibles con su rendimiento y se corrige el tamaño máximo: la hoja de HP lista
-- Oficio entre las capacidades de entrada, así que no es carta.
update public.impresoras_specs set
  tamano_maximo = 'legal',
  consumibles  = 'Botellas HP: GT53XL negro (~6.000 págs) o GT53 negro (~4.000); GT52 cian, magenta y amarillo (~8.000 c/u)',
  notas        = 'ISO 15/9 ppm; copiado ISO 13/6 cpm; dúplex AUTOMÁTICO; admite Oficio; incluye 2 botellas GT53XL negras en la caja',
  fuente_url   = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/HP_SMART_TANK_750.pdf?v=1664565067',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'HP Smart Tank 750';

-- HP Laser 137fnw — el dúplex estaba SIN DATO y la hoja de HP lo dice con todas las letras:
-- "Opciones de dúplex: Manual". También precisa el ADF (40 hojas, no un genérico "sí") y que admite
-- personalizados hasta 216 x 356 mm, o sea oficio.
update public.impresoras_specs set
  duplex_auto   = false,
  tamano_maximo = 'legal',
  notas         = 'Hasta 20 ppm A4 (monocromática); ADF de 40 hojas; dúplex MANUAL; bandeja de entrada 150 hojas, salida 100; admite personalizados de 76 x 127 hasta 216 x 356 mm',
  fuente_url    = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/HP_Laser_MFP_137FNW_e0632fab-80d8-42df-acb4-258bb84f3d22.pdf?v=1701447448',
  fuente_fecha  = date '2026-08-22', updated_at = now()
where modelo = 'HP Laser 137fnw';

-- Epson SureColor F170 — la conectividad estaba en NULO y la ficha oficial la nombra completa:
-- USB, Ethernet o inalámbrica. Se precisa además el tipo de tinta.
update public.impresoras_specs set
  wifi         = true,
  ethernet     = true,
  consumibles  = 'Tinta de sublimación Epson UltraChrome DS, 4 colores (C, M, Y, K)',
  notas        = 'Bandeja de alimentación automática de 150 hojas; cabezal PrecisionCore MicroTFP; conectividad USB, Ethernet e inalámbrica; para personalización (tazas, camisetas)',
  fuente_url   = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Ficha-tecnica-Epson-SureColor-F170.pdf?v=1696868795',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Epson SureColor F170';
