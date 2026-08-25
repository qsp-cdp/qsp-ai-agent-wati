-- Cuarta tanda: láser HP. Y aquí salió un problema NUEVO, distinto al de borrador vs ISO.
--
-- LA TABLA MEZCLA CIFRAS DE A4 CON CIFRAS DE CARTA. HP publica las dos para cada equipo (la carta es
-- un poco más rápida porque la hoja es más corta), y quien llenó la tabla tomó a veces una y a veces
-- la otra. Se ve clarísimo en dos parejas de hermanos que salen de la MISMA ficha:
--
--   M111w      tenía 20  <- A4        M141w     tenía 21  <- carta
--   3003dw     tenía 35  <- carta     3103fdw   tenía 33  <- A4
--
-- No es un error de velocidad: es el mismo equipo medido en dos tamaños de papel. Pero rompe la
-- comparación igual que mezclar borrador con ISO, solo que más disimulado (~5% en vez de 2x), y hace
-- que dos equipos iguales aparezcan distintos en el orden del asesor.
--
-- Se arregla lo que se puede arreglar SIN DEDUCIR: cada pareja queda con la cifra que su ficha
-- ETIQUETA explícitamente, la misma para ambos hermanos, y el tamaño de papel queda escrito en la
-- nota. El "21/20 ppm" de la portada de la M111w/M141w no dice cuál es cuál — no se usa.

-- M111w y M141w: su tabla dice "Velocidad de impresión en negro A4: Hasta 20 ppm". Ambas a 20.
update public.impresoras_specs set
  ppm_negro = 20,
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '20 ppm en A4 (la ficha anuncia "21/20" sin decir cuál tamaño es cuál)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Impresora-HP-LaserJet-Pro-M111w--600-x-600-DPI--21-ppm--8000-paginas-por-mes-959700.pdf?v=1706129851',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP LaserJet M111w';

update public.impresoras_specs set
  ppm_negro = 20,
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '20 ppm en A4 (la ficha anuncia "21/20" sin decir cuál tamaño es cuál)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/M141W.pdf?v=1732903513',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP LaserJet M141w';

-- 3003dw y 3103fdw: misma ficha, que SÍ etiqueta las dos — "Carta: Hasta 35 ppm" y "A4: Hasta 33 ppm".
-- Se usa la de CARTA, que es el papel que se usa en Panamá y lo que el cliente va a experimentar.
update public.impresoras_specs set
  ppm_negro = 35,
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '35 ppm en carta (33 en A4)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/impresora-hp-laserjet-pro-3003dw.pdf?v=1732903012',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP LaserJet Pro 3003dw';

update public.impresoras_specs set
  ppm_negro = 35,
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '35 ppm en carta (33 en A4)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/HPM3103FDW.pdf?v=1732908102',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP LaserJet Pro MFP 3103fdw';

-- 4003DW: la mejor etiquetada de todas — "Velocidad de impresión monocromática (ISO, carta) Hasta
-- 42 ppm", con la nota "Measured using ISO/IEC 24734". Ya estaba en 42; solo se ata la fuente.
update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '42 ppm ISO en carta (ISO/IEC 24734)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/HP-2Z610A.pdf?v=1732907949',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP LaserJet Pro 4003DW' and fuente_url is null;
