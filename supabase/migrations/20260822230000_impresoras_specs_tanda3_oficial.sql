-- Tanda 3. Aquí ya no hubo PDF en la tienda: las fichas se bajaron del sitio de Canon Latinoamérica,
-- que publica los folletos en español con sección para Panamá (cla.canon.com/es_PA/...).

-- Canon PIXMA G4170 — mismo error que su hermana G3170: la tabla decía 8.8/5 y Canon publica
-- ESAT 11,0 / 6,0 ipm. Tiene sentido que coincidan: la G4170 es la G3170 con ADF y fax.
update public.impresoras_specs set
  ppm_negro    = '11',
  ppm_color    = '6',
  adf          = true,
  consumibles  = 'Botellas GI-11: GI-11 PGBK negro pigmentado, GI-11 C/M/Y color',
  notas        = 'ESAT 11,0 ipm negro / 6,0 ipm color (ISO/IEC 24734); MegaTank 4 en 1 con ADF y fax; hasta 4800 x 1200 dpi',
  fuente_url   = 'https://www.cla.canon.com/es_PA/app/pdf/brochures/G-Series_Inkjet_Printers/PIXMA-G4170_Brochure.pdf',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Canon PIXMA G4170';

-- Epson EcoTank L4360 — la página oficial de Epson confirma el dúplex automático y las botellas T504,
-- y agrega el rendimiento. NO confirma la velocidad ISO exacta, así que ppm_negro/ppm_color se quedan
-- como están: no se toca un dato que la fuente no afirma.
update public.impresoras_specs set
  consumibles  = 'Botellas T504 (juego de reemplazo rinde hasta 8.500 páginas); incluye tinta para ~6.600 págs en negro y ~5.500 en color',
  notas        = 'Impresión automática a doble cara; bandeja de 100 hojas; Wi-Fi doble banda; vida útil hasta 50.000 páginas',
  fuente_url   = 'https://epson.com.mx/Para-el-hogar/Impresoras/Inyecci%C3%B3n-de-tinta/Epson-EcoTank-L4360-Impresora-Multifuncional-a-Color-Wi-Fi-y-D%C3%BAplex/p/C11CL41301',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Epson EcoTank L4360';
