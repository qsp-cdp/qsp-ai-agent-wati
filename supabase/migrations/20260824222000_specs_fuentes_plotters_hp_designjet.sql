-- Tercera tanda: los cinco HP DesignJet.
--
-- Un plóter NO se mide en páginas por minuto. Su unidad es IMPRESIONES A1 POR HORA (y su inverso,
-- segundos por página A1), porque lo que imprime son planos de gran formato. Meter un ppm en estas
-- columnas sería mezclar unidades y romper el orden por velocidad del asesor, que compara
-- impresoras de oficina entre sí. Los cinco quedan con ppm en NULL a propósito.
--
-- La cifra real va a las notas, con su unidad, para que el asesor pueda decirla sin inventar.

update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '30 s por página A1 (76 A1/hora)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/5HB06A-ES.pdf?v=1732908899',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP DesignJet T250' and fuente_url is null;

-- OJO con la T650: la ficha da DOS cifras, una por ancho. La que vende la tienda es la de 36"
-- (handle ploter-hp-designjet-t650-36-pulgadas), así que va la de 36": 25 s / 82 A1 por hora.
-- La de 24" es 26 s / 81 A1 por hora — parecida, pero no es la de este producto.
update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '36": 25 s por página A1 (82 A1/hora)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Ficha-Tecnica-Plotter-HP-DesignJet-T650_00035301-fc5b-4944-9dd6-33a0edc8ac85.pdf?v=1732909027',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP DesignJet T650' and fuente_url is null;

update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '25 s por página A1 (90 A1/hora)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Ploter_T850.pdf?v=1705591738',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP DesignJet T850 MFP' and fuente_url is null;

update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'dibujos de línea: 28 s por página A1 (116 A1/hora)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/1VD88A.pdf?v=1705594255',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP DesignJet T1700dr PS' and fuente_url is null;

update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || '19,3 s por página A1 (180 A1/hora)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/3EK15A.pdf?v=1745527874',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP DesignJet T2600dr PS MFP' and fuente_url is null;
