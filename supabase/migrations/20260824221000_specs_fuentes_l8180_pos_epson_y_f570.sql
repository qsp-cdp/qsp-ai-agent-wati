-- Segunda tanda: la EcoTank L8180 (que sí gana velocidad) y las que se miden en otra unidad.

-- L8180 — el caso de manual, y el único de esta tanda donde había dato que ganar. Su ficha separa
-- las dos cifras con todas las letras:
--   "Hasta 32 ppm negro/color en modo BORRADOR(1) ... Hasta 16 ppm ISO(2)"
--   nota 2: "la velocidad normal de impresión ISO ppm ... de acuerdo al estándar ISO/IEC 24734"
--   "Símplex: negro 16 ppm y color 12 ppm (A4/carta)"
-- Va la de norma: 16 / 12. El 32/32 es borrador y NO entra en estas columnas — es exactamente el
-- error que tenía la L5590 (33 en el título) y la GX7110 (45/25).
update public.impresoras_specs set
  ppm_negro = 16, ppm_color = 12,
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/ECOTANK_L8180.pdf?v=1664565068',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson EcoTank L8180';

-- LAS TÉRMICAS DE PUNTO DE VENTA se miden en MILÍMETROS POR SEGUNDO, no en páginas por minuto:
-- imprimen un rollo continuo, no hay "página" que contar. Su ppm queda en NULL a propósito, igual
-- que en las matriciales, y la velocidad real va a las notas con su unidad correcta.
update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'hasta 250 mm/s'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Ficha-Tecnica-TM-T20III-para-web.pdf?v=1695419477',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson TM-T20III' and fuente_url is null;

-- La TM-T88VII trae una condición que el titular esconde, y que cambia lo que se le promete al
-- cliente: los 500 mm/s dependen de la fuente de poder. La ficha lo dice literal: "las
-- configuraciones que no incluyen PS-190 o PS-180 tendrán una velocidad predeterminada de 450 mm/s".
update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'hasta 500 mm/s con fuente PS-190/PS-180; sin ellas, 450 mm/s'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Especificaciones-TM-T88VII.pdf.pdf?v=1714165688',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson TM-T88VII' and fuente_url is null;

update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'hasta 300 mm/s'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/AF_2239872_EAI_SD_Catsheet_TM-m30III_ESPANOL_1_.pdf.pdf?v=1758656143',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson TM-m30III' and fuente_url is null;

-- F570: sublimación de gran formato. Su ficha da la velocidad del MOTOR de impresión, no un ppm de
-- oficina, así que tampoco hay cifra comparable que poner. Solo se ata la fuente.
update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Ficha-Tecnica-F570-para-web.pdf?v=1738178407',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson SureColor F570' and fuente_url is null;
