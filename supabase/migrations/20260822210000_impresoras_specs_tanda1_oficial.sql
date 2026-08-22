-- Tanda 1: los 6 modelos más preguntados por clientes reales, leídos de la ficha oficial del
-- fabricante (los PDF que la propia tienda hospeda; su texto queda en `fichas_pdf`).
--
-- Sobre las UNIDADES, que es donde se cayó la L5590: Epson publica "ISO ppm", HP publica "ISO ppm" y
-- Canon publica "ESAT ipm". Los tres salen de la MISMA norma (ISO/IEC 24734), así que son comparables
-- entre sí y el orden por `ppm_negro` de `asesorar_impresora` sigue significando algo. Lo que NO se
-- puede mezclar es la velocidad de borrador con la ISO — ese fue el error de la L5590.
--
-- Se escribe solo lo que el documento AFIRMA. Donde el PDF calla, la fila se queda como está.

-- Epson EcoTank L3250 — ISO 10/5 confirmado (la tabla ya estaba bien). Se agregan los consumibles.
-- Dato de paso: su velocidad de borrador es 33/15 ppm — exactamente los números que el metacampo
-- `schemaapp` de la L5590 mostraba como suyos. Confirma que ese metacampo tiene pegada la ficha de
-- este modelo.
update public.impresoras_specs set
  consumibles  = 'Botellas T544: T544120-AL negro, T544220-AL cian, T544320-AL magenta, T544420-AL amarillo',
  notas        = 'ISO 10/5 ppm (borrador 33/15); 3 en 1 sin ADF; bandeja trasera 100 hojas; Wi-Fi + Wi-Fi Direct, sin Ethernet',
  fuente_url   = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/ECOTANK_L3250.pdf?v=1664565066',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Epson EcoTank L3250';

-- Epson EcoTank L14150 — el folleto confirma dúplex AUTOMÁTICO y ADF, y precisa que el ADF es de
-- 35 hojas (no 30). Cama de escáner tamaño oficio; imprime hasta A3+.
update public.impresoras_specs set
  adf          = true,
  duplex_auto  = true,
  consumibles  = 'Botellas T504: T504120-AL negro, T504220-AL cian, T504320-AL magenta, T504420-AL amarillo',
  notas        = 'ADF de 35 hojas (A4/carta/oficio); impresión automática a doble cara (A4/carta); cama de escáner tamaño oficio; imprime hasta A3+ (13"x19")',
  fuente_url   = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/L14150.pdf?v=1664565066',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Epson EcoTank L14150';

-- Canon PIXMA G3170 — la tabla decía 8.8/5; Canon publica ESAT 11,0 / 6,0 ipm.
update public.impresoras_specs set
  ppm_negro    = '11',
  ppm_color    = '6',
  consumibles  = 'Botellas GI-11: GI-11 PGBK negro pigmentado (170 ml), GI-11 C/M/Y color (70 ml). Cabezales BH-10 y CH-10',
  notas        = 'ESAT 11,0 ipm negro / 6,0 ipm color (ISO/IEC 24734, comparable con el ISO ppm de Epson y HP); MegaTank 3 en 1; hasta 4800 x 1200 dpi',
  fuente_url   = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/PIXMA-G3170_Brochure.pdf?v=1707159188',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Canon PIXMA G3170';

-- Canon MAXIFY GX4010 — la tabla decía 30/18 ppm; Canon publica ESAT 18,0 / 13,0 ipm. Es la
-- discrepancia más grande de la tanda: la tabla la presentaba ~67% más rápida de lo que es, y como
-- `asesorar_impresora` ordena por velocidad, la habría puesto por delante de equipos que le ganan.
-- No hay otra cifra de velocidad en el documento oficial: ESAT es la única que Canon publica.
update public.impresoras_specs set
  ppm_negro    = '18',
  ppm_color    = '13',
  adf          = true,
  duplex_auto  = true,
  consumibles  = 'Botellas GI-16 pigmentadas: GI-16 BK negro (167 ml), GI-16 C/M/Y color (132 ml)',
  notas        = 'ESAT 18,0 ipm negro / 13,0 ipm color (ISO/IEC 24734); ADF de 35 hojas; impresión a doble cara automática',
  fuente_url   = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/MAXIFY-GX4010_Specs.pdf?v=1715891798',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Canon MAXIFY GX4010';

-- HP Smart Tank 530 — ISO 11/5 confirmado, ADF de 35 hojas y dúplex MANUAL (HP lo dice con esas
-- palabras: "Opciones de dúplex: Manual"). La tabla ya estaba bien; se agregan consumibles y fuente.
update public.impresoras_specs set
  adf          = true,
  duplex_auto  = false,
  consumibles  = 'Botellas HP GT53XL negro (incluye 2 en la caja, hasta 6.000 páginas c/u) + juego de 3 botellas de color',
  notas        = 'ISO 11/5 ppm (borrador 22/16); ADF de 35 hojas; dúplex MANUAL; bandeja de entrada 100 hojas, salida 30; escaneo ADF hasta 216 x 356 mm',
  fuente_url   = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/HP_530.pdf?v=1664565066',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'HP Smart Tank 530';

-- HP Smart Tank 580 — ISO 12/5 confirmado. El documento la describe como imprime/copia/escanea, sin
-- mencionar ADF: no se afirma nada sobre el ADF, la fila queda como está.
update public.impresoras_specs set
  consumibles  = 'Botellas HP GT53XL negro (incluye 2 en la caja, hasta 6.000 páginas c/u) + botellas de color',
  notas        = 'ISO 12/5 ppm; copiado ISO 10/2 cpm; imprime, copia y escanea',
  fuente_url   = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/MULTIFUNCIONAL-HP-SMART-TANK-580-WIRELESS-1F3Y2A.pdf?v=1704924036',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'HP Smart Tank 580';
