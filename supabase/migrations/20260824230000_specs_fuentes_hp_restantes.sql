-- Los 7 HP que quedaban con ficha. Cinco estaban BIEN — vale decirlo, porque el reflejo después de
-- tantos errores es asumir que todo está mal y "corregir" lo que ya servía.

-- M480f: el caso más curioso de la tanda. La tabla tenía 28/28, y su ficha da
--   "Print speed black (ISO, A4) Up to 27 ppm"  /  "Print speed black (ISO, letter) Up to 29 ppm"
-- El 28 no es ninguno de los dos: es el titular de la portada ("speeds up to 28 ppm"), que en esta
-- ficha no coincide con ninguna de las dos cifras medidas. Va la de carta: 29/29.
update public.impresoras_specs set
  ppm_negro = 29, ppm_color = 29,
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'ISO 29/29 ppm en carta (27/27 en A4); el "28 ppm" de la portada no corresponde a ningún tamaño'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/M480f_data_sheet.pdf?v=1732903859',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP Color LaserJet Enterprise MFP M480f';

-- 4203dw: tenía la cifra de A4. Su ficha etiqueta las dos: "hasta 35 ppm (carta)/33 ppm (A4)".
update public.impresoras_specs set
  ppm_negro = 35, ppm_color = 35,
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '35/35 ppm en carta (33/33 en A4)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/5HH48A_FT.pdf?v=1732907810',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP Color LaserJet Pro 4203dw';

update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '26/26 ppm en carta (25/25 en A4)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/HPColorLaserJetProMFP3303fdw_3303fdw.pdf?v=1720645073',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP Color LaserJet Pro 3303fdw' and fuente_url is null;

update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '42 ppm en carta (40 en A4)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/MFP-4103dw-fdw.pdf?v=1736785756',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP LaserJet Pro MFP 4103fdw' and fuente_url is null;

-- OfficeJet 200 (portátil): 10/7 ISO correcto. La ficha agrega un dato que SÍ importa para venderla —
-- con batería baja a 9/6, y es una impresora que se compra justamente para usar sin enchufe.
update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'ISO 10/7 ppm con corriente; con batería baja a 9/6'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/200_MOBILE.pdf?v=1664565065',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP OfficeJet 200' and fuente_url is null;

update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'ISO 25/20 ppm (igual en carta y A4); en borrador sube a 39/39'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/404K5C_FT.pdf?v=1751641436',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP OfficeJet Pro 9130' and fuente_url is null;

update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'ISO 12/5 ppm; en borrador sube a 22/16'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/4A8D7A_FT_1.pdf?v=1767903593',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP Smart Tank 583' and fuente_url is null;
