-- La sospecha de la tanda anterior queda CONFIRMADA con fuente. Isaac señaló latinamerica.brother.com,
-- y de ahí salieron los folletos de Brother México (imprimetuactitud.brother.com.mx, que el allowlist
-- de ficha-pdf ya aceptaba por terminar en .brother.com.mx).
--
-- Las tres venían con la cifra de Modo Eco:
--
--   DCP-T230     tenía 28/11   Modo Eco 27/11   ISO/IEC 24734: 16/9
--   DCP-T530DW   tenía 28/11   Modo Eco 27/11   ISO/IEC 24734: 16/9
--   MFC-T930DW   tenía 30/26   Modo Eco 30/26   ISO/IEC 24734: 17/16
--
-- La T930DW tenía EXACTAMENTE sus dos cifras de Modo Eco. La T230 y la T530DW traían el 11 de color
-- del Modo Eco y un 28 en negro que no coincide ni con el Eco (27) ni con el ISO (16).
--
-- NOTA DE MÉTODO: en la tanda anterior estas filas se marcaron "sin verificar" en vez de corregirse
-- por parecido con sus hermanas. Se corrigen ahora porque una ficha lo dice, no porque el número se
-- pareciera. La diferencia importa: el 9 de color de la T230/T530DW no se habría adivinado nunca
-- (su hermana T730DW es 15 en color, no 9).
update public.impresoras_specs set
  ppm_negro = 16, ppm_color = 9,
  notas = regexp_replace(notas, '; OJO velocidad sin verificar:.*$', '') || '; ISO 16/9 ipm; en Modo Eco sube a 27/11',
  fuente_url = 'https://imprimetuactitud.brother.com.mx/wp-content/uploads/2024/12/bluchure-DCP-T530DW.pdf',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother DCP-T530DW';

update public.impresoras_specs set
  ppm_negro = 17, ppm_color = 16,
  notas = regexp_replace(notas, '; OJO velocidad sin verificar:.*$', '') || '; ISO 17/16 ipm; en Modo Eco sube a 30/26',
  fuente_url = 'https://imprimetuactitud.brother.com.mx/wp-content/uploads/2025/04/brochure-MFC-T930DW.pdf',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother MFC-T930DW';

update public.impresoras_specs set
  ppm_negro = 16, ppm_color = 9,
  notas = regexp_replace(notas, '; OJO velocidad sin verificar:.*$', '') || '; ISO 16/9 ipm; en Modo Eco sube a 27/11',
  fuente_url = 'https://imprimetuactitud.brother.com.mx/wp-content/uploads/2025/04/brochure-DCP-T230.pdf',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Brother DCP-T230';

-- La fila de la MFC-T930DW traía escrito, de antes, "velocidades en modo Eco" — y era CIERTO: sus
-- ppm eran 30/26, que es el Modo Eco. Alguien lo supo y lo anotó, pero puso la cifra igual.
-- Ahora que las columnas llevan la cifra ISO, esa nota dice lo contrario de lo que hay. Una nota que
-- contradice su propia fila es peor que no tener nota: el asesor la lee en voz alta.
update public.impresoras_specs set
  notas = btrim(replace(notas, 'velocidades en modo Eco; ', ''), ' ;'),
  updated_at = now()
where modelo = 'Brother MFC-T930DW';
