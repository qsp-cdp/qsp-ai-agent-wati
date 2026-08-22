-- Re-sincronización de 3 modelos cuyas fichas de Shopify estaban mal y ya fueron corregidas
-- (22-ago-2026). La tabla se sembró DESDE esas fichas, así que arrastraba el mismo error.
--
-- 1. Brother SP-1 — la ficha tenía pegada la descripción de la Epson F170. Ya es la real:
--    sublimación compacta, diseños desde la app Artspira, cartuchos CMYK de 47 ml, requiere
--    prensa de calor aparte. (El tamaño de papel NO aparece en la ficha, así que queda en nulo
--    en vez de deducirlo.)
--
-- 2. Epson LQ-590II — la ficha estaba vacía (solo el título). Ya trae los datos: matricial de
--    24 agujas, 584 cps a 12 cpi en borrador, formularios de hasta 7 partes, USB + paralelo.
--    Sin ppm a propósito: una matricial se mide en caracteres por segundo, igual que las otras
--    de su categoría en esta tabla.
--
-- 3. Epson EcoTank L5590 — el error era peor de lo que parecía. La fila decía 33 ppm negro /
--    15 ppm color, que NO son un par: 33 es la velocidad en BORRADOR y 15 es la velocidad ISO
--    en NEGRO metida en la columna de color. Las demás EcoTank de la tabla están todas en ISO
--    (L3250 10/5, L4360 15/8, L6370 18/9), así que la L5590 quedaba comparándose contra sus
--    hermanas con otra vara — y como `asesorar_impresora` ordena por ppm_negro, el bot la habría
--    presentado como más del doble de rápida de lo que es. Su ISO real es 15/8. La velocidad de
--    borrador (33/20, la que anuncia el título) queda en las notas, que es donde no engaña.
update public.impresoras_specs set
  wifi = true,
  ethernet = false,
  consumibles = 'Cartuchos de sublimación Brother CMYK de 47 ml (incluye 4)',
  notas = 'Sublimación compacta; diseños desde la app Artspira; requiere prensa de calor (se vende aparte); transfiere a poliéster y artículos con recubrimiento polimérico',
  updated_at = now()
where modelo = 'Brother SP-1';

update public.impresoras_specs set
  tamano_maximo = 'carta',
  wifi = false,
  ethernet = false,
  consumibles = 'Cinta negra, hasta 5 millones de caracteres',
  notas = '24 agujas; 584 cps a 12 cpi en borrador; 80 columnas a 10 cpi; formularios de hasta 7 partes; USB 2.0 + Paralelo IEEE 1284; cabezal de 400 millones de caracteres',
  updated_at = now()
where modelo = 'Epson LQ-590II';

update public.impresoras_specs set
  ppm_negro = '15',
  ppm_color = '8',
  adf = true,
  duplex_auto = false,
  notas = 'ADF de 30 hojas; dúplex MANUAL; ISO 15/8 ppm (en borrador llega a 33/20); Wi-Fi Direct + Ethernet; reemplaza a la L5290',
  updated_at = now()
where modelo = 'Epson EcoTank L5590';
