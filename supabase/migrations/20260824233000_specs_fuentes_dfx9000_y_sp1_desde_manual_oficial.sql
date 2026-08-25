-- Las dos que quedaron colgadas por no tener folleto: se cierran con el MANUAL oficial del
-- fabricante. Antes había descartado el manual de la SP-1 por ser de 257 páginas y no ser una hoja
-- de especificaciones. Eso estaba mal planteado: lo que descalifica a un documento no es su largo
-- sino que no traiga el dato. Los dos manuales traen apéndice de especificaciones, y ahí está.

-- DFX-9000: la ficha que hospeda la tienda salió ilegible y se borró. El manual oficial de Epson sí
-- se lee, y trae la tabla completa. Tres cosas que la fila no decía:
--   · Velocidades: 1.550 cps borrador alta velocidad, 1.320 cps borrador, 330 cps NLQ — TODAS
--     "a 10 cpp". Es la misma trampa de la LX-350: sin el cpp, la cifra no significa nada.
--   · La nota decía "9 agujas". El manual dice "matriz de puntos de impacto de 36 agujas
--     (9 × 4, alternantes)": son cuatro cabezales de 9. Por eso hace 1.550 cps y por eso se vende
--     para volumen. Decir "9 agujas" la deja pareciendo una matricial cualquiera.
--   · `ppm_negro`/`ppm_color` siguen en NULL, que es lo correcto: se mide en cps.
update public.impresoras_specs set
  notas = replace(notas, '9 agujas industrial', 'Matriz de impacto de 36 agujas (9 × 4 alternantes, cuatro cabezales)')
          || '; 1.550 cps en borrador de alta velocidad, 1.320 cps en borrador y 330 cps en calidad casi de carta (NLQ), todas a 10 cpp; 136 columnas',
  fuente_url = 'https://files.support.epson.com/pdf/dfx9k_/dfx9k_uu6.pdf',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson DFX-9000';

-- SP-1: su manual oficial TIENE apéndice "Printer Specifications", y ahí Brother publica resolución
-- (1.200 × 2.400 dpi) y ancho de impresión (210 mm) — pero NO velocidad. O sea el NULL no es un
-- hueco nuestro: el fabricante no la publica, igual que en la TC-20 y la SELPHY CP1500. Se anota lo
-- que sí sirve para vender sublimación, que es el tamaño de papel que admite.
update public.impresoras_specs set
  notas = notas || '; papel de sublimación Brother carta, A4 o legal, hasta 100 hojas; ancho de impresión 210 mm; 1.200 × 2.400 dpi; el apéndice de especificaciones de su manual oficial no publica velocidad de impresión',
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/folleto-lote12-brother-sp1-en.pdf?v=1786552127',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother SP-1';
