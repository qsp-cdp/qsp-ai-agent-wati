-- Quince filas cerradas con fichas que la PROPIA TIENDA ya hospedaba. Ninguna hubo que buscarla
-- afuera: estaban en Shopify Files con el nombre puesto por quien las subió, y catorce de ellas con
-- nombres que no dicen nada (mmo_110498370…, 647a4ff83d0dd0…, high.pdf, original.pdf, P012-518.pdf).
-- Se extrajeron sin modelo y se identificaron por su primera línea. Cuatro velocidades salieron mal.

-- ── Lexmark ────────────────────────────────────────────────────────────────────────────────────
-- MX331adn: el 40 guardado ESTÁ BIEN y por poco lo corrijo. La tabla de especificaciones solo trae
-- "38 ppm (A4)" y de ahí salía la corrección; el titular de la misma ficha dice "hasta 40/38 páginas
-- por minuto (carta/A4)". El número de la tabla no era otro dato: era el mismo en el otro tamaño.
update public.impresoras_specs set
  notas = notas || '; 40 ppm ISO (ESAT) en carta, 38 en A4',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/MX331adn-Brochure.pdf?v=1647456645',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Lexmark MX331ADN';

-- CX532adwe: guardaba 35 negro / 33 color, y el 33 NO es la velocidad a color. La ficha dice
-- "up to 35/33 ppm on letter/A4 paper" — o sea 35 en carta y 33 en A4, las dos del MISMO modo. La
-- tabla lo confirma: "Black: 35 ppm (Letter) / Color: 35 ppm (Letter)". Alguien leyó ese "35/33"
-- como negro/color. Imprime a color igual de rápido que en negro, que es justo lo que se vende.
update public.impresoras_specs set
  ppm_color = 35,
  notas = notas || '; 35/35 ppm ISO (ESAT) en carta — en A4 baja a 33',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/folleto-lote12-lexmark-cx532adwe-50m7040-en.pdf?v=1786551895',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Lexmark CX532adwe';

-- ── HP ─────────────────────────────────────────────────────────────────────────────────────────
-- M501dn: guardaba 43, que es la cifra en A4. La ficha publica las dos: "A4: Hasta 43 ppm; Carta:
-- Hasta 45 ppm". Aquí se prefiere carta, que es el tamaño que se usa en Panamá.
update public.impresoras_specs set
  ppm_negro = 45,
  notas = notas || '; 45 ppm en carta (43 en A4)',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/4AA6-4361SPL.pdf?v=1774896754',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP LaserJet Pro M501dn';

-- M528dn: el 45 guardado ya era el de carta. La ficha agrega un dato que vende solo: el modo "HP de
-- alta velocidad" la lleva a 52 ppm en carta.
update public.impresoras_specs set
  notas = notas || '; 45 ppm en carta (43 en A4); con el modo HP de alta velocidad sube a 52',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/4AA7-5278SPL.pdf?v=1737063267',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP LaserJet Enterprise M528dn';

-- 5700dn y 5800dn: guardaban 45/45 y su ficha oficial (número de producto 6QN28A, el mismo MPN que
-- tenemos) dice 43 ppm en A4, negro y color, y NO publica cifra en carta — se buscó "carta" en todo
-- el documento y solo aparece en las listas de tamaños de papel admitidos.
--
-- Podría deducir el de carta: en la M501dn y la M528 la diferencia es de 2 ppm. Pero deducir es
-- exactamente lo que produjo el 45 que estoy borrando. Se escribe lo que la ficha afirma, con el
-- tamaño pegado, y la nota avisa que el de carta no está publicado — así el asesor sabe que 43 es
-- el piso, no el techo, en vez de repetir un número que nadie puede comprobar.
update public.impresoras_specs set
  ppm_negro = 43, ppm_color = 43,
  notas = notas || '; 43/43 ppm en A4 — la ficha no publica cifra en carta; ciclo máximo 80.000 págs/mes, volumen recomendado 2.000–10.000',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/mmo_110498370_1700988198_4566_2774827.pdf?v=1720561397',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP Color LaserJet Enterprise 5700dn';

update public.impresoras_specs set
  ppm_negro = 43, ppm_color = 43,
  notas = notas || '; 43/43 ppm en A4 — la ficha no publica cifra en carta; volumen recomendado 2.000–10.000 págs/mes',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/mmo_110498372_1683602558_9097_1201877.pdf?v=1732903950',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP Color LaserJet Enterprise MFP 5800dn';

-- 4303fdw: el 33 guardado coincide con la ficha, pero la ficha solo publica A4 (igual que las dos
-- de arriba). Se le pega el tamaño para que no se compare de frente con una cifra en carta: su
-- hermana 4203dw hace 35 en carta y 33 en A4, y sin la etiqueta parecerían iguales.
update public.impresoras_specs set
  notas = notas || '; 33/33 ppm en A4 — la ficha no publica cifra en carta; a doble cara baja a 29 ipm',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/647a4ff83d0dd0.39995500.pdf?v=1732903293',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP Color LaserJet Pro 4303fdw';

-- ── Epson ──────────────────────────────────────────────────────────────────────────────────────
-- L6370 y WF-M5899: las dos correctas. Se agrega el dúplex, que es donde se sienten de verdad:
-- la L6370 pasa de 18/9 a 7/5, y la M5899 de 25 a 16.
update public.impresoras_specs set
  notas = notas || '; ISO 18/9 ppm a una cara; a doble cara baja a 7/5',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Catsheet_EcoTank_L6370_ESP_digital_v2.pdf.pdf?v=1779223212',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson EcoTank L6370';

update public.impresoras_specs set
  notas = notas || '; 25 ppm ISO en negro a una cara; a doble cara baja a 16',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/CATSHEET-M5899-ESPANOL.pdf.pdf?v=1780505615',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson WorkForce Pro WF-M5899';

-- Los tres plotters SureColor: `ppm_*` en NULL es correcto y ahora tiene respaldo. Epson publica
-- tiempo por lámina A1/D, y su propio pie aclara que esa cifra "se basa únicamente en la velocidad
-- del motor de impresión" — es decir NO es ISO y no incluye el procesamiento. Va dicho en la nota,
-- porque un cliente de CAD compara justo por ahí.
update public.impresoras_specs set
  notas = notas || '; A1/D en 34 s (velocidad del motor, no ISO)',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/original.pdf?v=1732909161',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson SureColor T3170';

update public.impresoras_specs set
  notas = notas || '; A1/D en 31 s (velocidad del motor, no ISO)',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/T5170-Catsheet_Final_2.20.19_Spa.pdf?v=1780086757',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson SureColor T5170';

update public.impresoras_specs set
  notas = notas || '; A1/D en 22 s (velocidad del motor, no ISO)',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/original_1.pdf?v=1739909816',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson SureColor T5470M';

-- ── Canon ──────────────────────────────────────────────────────────────────────────────────────
-- SELPHY CP1500: su hoja de especificaciones no publica velocidad de impresión, igual que la TC-20.
-- El NULL deja de ser un hueco y pasa a ser un hecho con fuente.
update public.impresoras_specs set
  notas = notas || '; su ficha oficial no publica velocidad de impresión',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/canon-selphy-cp1500-spec-sheet.pdf?v=1786549734',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Canon SELPHY CP1500';

-- MF665Cdw: 26 ppm en carta, correcto. Cuidado con esta ficha — cubre la MF662Cdw y la MF665Cdw, y
-- su encabezado comparativo anuncia "Print Speeds Up to 35 pages per minute". La tabla propia del
-- modelo dice 26 (carta) y 17,9 (legal). Manda la tabla del modelo, no el titular de la portada.
update public.impresoras_specs set
  notas = notas || '; 26 ppm en carta; en legal baja a 17,9; la ficha publica una sola cifra, sin separar negro y color',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/imageCLASS-MF662Cdw-MF665Cdw-Brochurepdf?v=1786551898',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Canon imageCLASS MF665Cdw';

-- ── Brother ────────────────────────────────────────────────────────────────────────────────────
-- MFC-L5705DW: 42 ppm es lo que publica, pero con dos reservas que la ficha misma pone y que hay
-- que arrastrar. Primera: la llama "Print Speed (maximum)" y en ningún lado cita ISO/IEC 24734, así
-- que NO es una cifra ESAT y no es comparable de frente con las Lexmark o las HP de esta tabla.
-- Segunda, la nota al pie 1: "Based on one-sided printing. Change from default setting required" —
-- de fábrica el equipo sale en dúplex, y esos 42 ppm requieren cambiarle la configuración.
update public.impresoras_specs set
  notas = notas || '; 42 ppm máximo a una cara — la ficha no la declara ISO y advierte que requiere cambiar la configuración predeterminada (de fábrica viene en dúplex)',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/P012-518.pdf?v=1727383714',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother MFC-L5705DW';
