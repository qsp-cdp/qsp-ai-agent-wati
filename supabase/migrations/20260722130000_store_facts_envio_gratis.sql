-- store_facts: aclarar el ENVÍO GRATIS >$300 (decisión de Gerencia, 22-jul).
-- La regla es: >$300 gratis en TODO el país, PERO en el interior el envío gratis es a la SUCURSAL Servientrega
-- para RETIRO (no puerta a puerta). El texto anterior de `envio_resumen` decía solo ">$300 gratis … en el
-- interior al día hábil siguiente" — un cliente del interior podía entender "gratis a la puerta", que es un
-- reclamo esperando pasar. Ahora el dato lo dice explícito; el copiloto además lo refuerza por prompt.
-- Nota: store_facts es un espejo del metaobjeto Shopify (store_facts/datos-tienda) -> espejar también allá
-- este valor para que un re-sync no lo revierta. Aplicar en el SQL Editor.

update public.store_facts set
  value = 'En compras en línea mayores a US$300, el envío es GRATIS en todo el país. En la Ciudad de Panamá es gratis a domicilio (mismo día en gran parte; el este y el norte al día hábil siguiente). En el interior, el envío gratis es a la sucursal Servientrega para RETIRO (no puerta a puerta), al día hábil siguiente; si desea la entrega puerta a puerta a domicilio, esa opción tiene un costo aparte.',
  updated_at = now()
where key = 'envio_resumen';

-- Verificación: debe devolver 1 fila con "sucursal Servientrega para RETIRO (no puerta a puerta)".
-- select key, value from public.store_facts where key = 'envio_resumen';
