-- Cierre de las 17 filas que ya tenían ficha extraída: la mitad Canon/Epson.
-- Aquí, a diferencia de la tanda HP, las diez velocidades ya estaban bien. Lo que faltaba era atar
-- la fuente y anotar lo que la ficha aclara y la fila callaba (tamaño de papel, modo de medición).

-- Canon imageCLASS LBP6030w — 19 ppm, y la ficha precisa que es en CARTA.
update public.impresoras_specs set
  notas = notas || '; 19 ppm en carta',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/iC_LBP6030w_Eng.pdf?v=1722979801',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Canon imageCLASS LBP6030w';

-- Canon imageCLASS MF465dw II — 42 ppm en carta.
update public.impresoras_specs set
  notas = notas || '; 42 ppm en carta',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Brochure_iC-MF465dw_CMX_Low.pdf?v=1726169033',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Canon imageCLASS MF465dw II';

-- Canon imageRUNNER 1643i — 45 ppm en carta. La ficha además publica 36 ppm en legal, y este equipo
-- se vende con vidrio tamaño legal: el cliente que imprime legal va a ver 36, no 45. Va en la nota
-- para que el asesor no prometa la cifra de portada.
update public.impresoras_specs set
  notas = notas || '; 45 ppm en carta; en legal baja a 36 ppm',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/iR1643_Series_Brochure.pdf?v=1723665759',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Canon imageRUNNER 1643i';

-- Canon imageCLASS X MF1538C — 40 ppm en carta, y una advertencia que hay que dejar por escrito:
-- la tabla de la ficha etiqueta esos 40 ppm como velocidad a COLOR y no publica una cifra aparte
-- para negro. El 40 en `ppm_negro` es plausible (en láser color suelen coincidir) pero ESTA fuente
-- no lo afirma. Se ata la fuente y se dice qué respalda y qué no, en vez de fingir que respalda todo.
update public.impresoras_specs set
  notas = notas || '; 40 ppm en carta; la ficha solo etiqueta la velocidad a COLOR — no publica cifra aparte para negro',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/1001_Color_imageCLASS_X_MF1538C_Brochure_100322.pdf?v=1745529495',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Canon imageCLASS X MF1538C';

-- Los dos plóters TM-340: `ppm_*` en NULL es lo correcto, un plóter no se mide en ppm. La ficha da
-- tiempo por página A1 (21 s) y aclara que es en "modo económico rápido" — o sea el equivalente al
-- borrador. Se guarda la cifra con su modo pegado, nunca suelta.
update public.impresoras_specs set
  notas = notas || '; CAD en A1: 21 s por página en modo económico rápido (2,7 ppm); A0: 41 s',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/imageprograf-tm-340_datasheet_es_final_hr_b851be148227444e8f60fe5734422808.pdf?v=1746737701',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Canon imagePROGRAF TM-340';

update public.impresoras_specs set
  notas = notas || '; CAD en A1: 21 s por página en modo económico rápido (2,7 ppm); A0: 41 s',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/plotter-canon-imageprograf-tm-340-mfp-lm36-a0.pdf?v=1746737624',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Canon imagePROGRAF TM-340 MFP';

-- Canon imagePROGRAF TC-20 — su folleto oficial NO publica velocidad de impresión. El NULL se queda
-- y ahora tiene fuente: no es un dato que falte por pereza, es un dato que el fabricante no da.
update public.impresoras_specs set
  notas = notas || '; su folleto oficial no publica velocidad de impresión',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/imagePROGRAF-TC-20_Brochure.pdf?v=1724276662',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Canon imagePROGRAF TC-20';

-- Las dos WorkForce Pro: 25/25 ISO a una cara, correcto. Lo que faltaba es que a doble cara baja a
-- 16 — y estos equipos se venden por volumen de oficina, donde el dúplex es el uso normal.
update public.impresoras_specs set
  notas = notas || '; ISO 25/25 ppm a una cara; a doble cara baja a 16',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/1958149_EAI-BIJ_WorkForce_WF-C5810_PT_V06_SEM_CORTE.pdf.pdf?v=1732898978',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson WorkForce Pro WF-C5810';

update public.impresoras_specs set
  notas = notas || '; ISO 25/25 ppm a una cara; a doble cara baja a 16',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Especificaciones-WF-C5890-v2.pdf.pdf?v=1740001454',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson WorkForce Pro WF-C5890';

-- La que NO se cierra: Brother SP-1. Tiene "ficha" en fichas_pdf, pero ese PDF es el manual de
-- usuario de 257 páginas, no una hoja de especificaciones. Un manual no es fuente de velocidad, así
-- que la fila se queda sin `fuente_url` a propósito. Falta conseguirle el folleto real.
