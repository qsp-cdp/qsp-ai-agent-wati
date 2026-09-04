-- Quinta tanda: Brother. Y la trampa de borrador vs ISO aparece otra vez, con otro nombre.
--
-- Brother no dice "borrador": dice "Modo Eco" o "modo rápido". Es lo mismo — la cifra alta que no
-- sirve para comparar. La ficha de la DCP-T730DW publica las dos, una debajo de la otra:
--   "Negro (Modo Eco): hasta 27 ppm    Color (Modo Eco): hasta 23 ppm"
--   "Negro (ISO/IEC 24734): hasta 16 ipm   Color (ISO/IEC 24734): hasta 15 ipm"
-- La tabla tenía 27/23 — la de Modo Eco. Va la de norma: 16/15.
update public.impresoras_specs set
  ppm_negro = 16, ppm_color = 15,
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'ISO 16/15 ipm; en Modo Eco sube a 27/23'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/brochure_DCP-T730DW-MEX.pdf?v=1760984553',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother DCP-T730DW';

-- La MFC-T4500DW en cambio SÍ estaba bien: 22/20 es su cifra ISO (su modo rápido es 35/27).
update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end || 'ISO 22/20 ipm; en modo rápido sube a 35/27'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/PE_MFC-T4500DW.pdf?v=1724357559',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother MFC-T4500DW' and fuente_url is null;

-- LAS TRES SIN FICHA — sospecha anotada, número NO tocado.
-- La T230 y la T530DW tienen 28/11 y la T930DW 30/26: el mismo rango en que sus hermanas publican el
-- modo rápido, y muy por encima de las cifras ISO de la familia (16/15 y 22/20). Es MUY probable que
-- también estén con la cifra rápida.
-- Pero no hay fuente que lo diga, y corregir por parecido es exactamente lo que produjo este desorden.
-- Se deja el número como está, con la duda escrita, y SIN fuente_url — así el centinela las sigue
-- contando como pendientes en vez de darlas por buenas.
-- (La ficha de la MFC-T930DW existe en Shopify pero es un PDF escaneado sin capa de texto: haría
--  falta OCR o buscar otra copia.)
update public.impresoras_specs set
  notas = btrim(coalesce(notas,'') || case when coalesce(notas,'') = '' then '' else '; ' end
          || 'OJO velocidad sin verificar: sus hermanas publican cifras de este rango como modo rápido, y su ISO real es bastante menor (la DCP-T730DW es 16/15 ISO frente a 27/23 en Modo Eco). Falta la ficha oficial'),
  updated_at = now()
where modelo in ('Brother DCP-T230', 'Brother DCP-T530DW', 'Brother MFC-T930DW');

-- Las láser Brother sí estaban correctas (su folleto solo publica una cifra, sin modo rápido).
update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/DCP-L2640DW_Brochure.pdf?v=1724882742',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother DCP-L2640DW' and fuente_url is null;

update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/HL-L2460DW_Brochure.pdf?v=1745422044',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother HL-L2460DW' and fuente_url is null;

update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/MFC-L3720CDW_2_Page_Brochure.pdf?v=1736870944',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother MFC-L3720CDW' and fuente_url is null;

-- Las de ETIQUETAS no se miden en ppm (imprimen etiquetas por minuto sobre rollo continuo), igual que
-- las POS. Su ppm en NULL es correcto; solo se ata la fuente.
update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Brother_QL-800-Ficha.pdf?v=1712676972',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother QL-800' and fuente_url is null;

update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/CL_QL-810W-Ficha-300721.pdf?v=1742311339',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother QL-810W' and fuente_url is null;

update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Brochure_QL820NWB_EN1.pdf?v=1732909328',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother QL-820NWB' and fuente_url is null;

update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/brother-ql1100-impresora-etiquetas.pdf?v=1732909429',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother QL-1100' and fuente_url is null;
