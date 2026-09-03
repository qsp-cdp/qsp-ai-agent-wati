-- v47 (parche) — store_facts: respuesta genérica de envío alineada con el modelo de zonas.
-- Corrige 2 datos que el bot da mal HOY en la respuesta genérica de info_tienda:
--   1) decía "Tocumen B/.10.00" — con el refactor de zonas, Tocumen es RETIRO $6 (se maneja por sector);
--      el genérico ya no debe fijar un precio de Tocumen.
--   2) prometía "mismo día" para TODA la ciudad — el este y el norte van al día hábil siguiente.
-- La respuesta PRECISA por sector la dará el tool tarifa_entrega (resolver_tarifa); esto es solo el
-- genérico honesto que invita al cliente a dar su barrio.
-- Nota: store_facts es un espejo del metaobjeto Shopify (store_facts/datos-tienda) -> actualizar también
-- allá para que un re-sync no revierta estos valores. Aplicar en el SQL Editor.

update public.store_facts set
  value = 'Desde B/.6.00 en la Ciudad de Panamá (San Miguelito y el este cercano B/.7.00). En zonas del este y norte varía según el sector: retiro en un punto Servientrega desde B/.6.00, o entrega a domicilio B/.9.00. Indíquenos su corregimiento o barrio y le confirmamos el costo exacto.',
  updated_at = now()
where key = 'tarifa_ciudad_panama';

update public.store_facts set
  value = 'Mismo día en gran parte de la Ciudad de Panamá (pedidos antes de las 3:00 p.m.). En zonas del este y del norte, al día hábil siguiente. Indíquenos su sector y le confirmamos el plazo exacto.',
  updated_at = now()
where key = 'plazo_ciudad_panama';

update public.store_facts set
  value = 'En compras en línea mayores a US$300, el envío es gratis. En la Ciudad de Panamá despachamos el mismo día en gran parte (el este y el norte al día hábil siguiente); en el interior, al día hábil siguiente.',
  updated_at = now()
where key = 'envio_resumen';

-- Verificación: debe devolver 3 filas con el texto nuevo.
-- select key, value from public.store_facts where key in ('tarifa_ciudad_panama','plazo_ciudad_panama','envio_resumen');
