-- Corrección (23-jul): el envío GRATIS >$300 es EXCLUSIVO del checkout WEB. En pedidos coordinados por
-- WhatsApp NO aplica (se cobra la tarifa de envío normal). El texto anterior de `envio_resumen` (v59.2)
-- daba a entender que aplicaba siempre → el bot prometía "califica para envío gratis" en cotizaciones por
-- WhatsApp de >$300 (caso real 23-jul). El dispatch de shopify-webhook NO cambia: ese rescate es para
-- pedidos WEB reales, que sí llevan envío gratis. Solo se corrige el DATO que el bot relaya.
-- Sin punto y coma en el value (el linter del SQL Editor parte por ; sin respetar comillas). Nota: espejar
-- también en el metaobjeto Shopify store_facts/datos-tienda. Aplicar en el SQL Editor.

update public.store_facts set
  value = 'El envío GRATIS aplica SOLO al comprar en línea por la WEB con más de US$300 (al completar el checkout en el sitio). En pedidos coordinados por WhatsApp NO hay envío gratis: se cobra la tarifa de envío normal según la zona. Cuando aplica (compra web mayor a US$300): en la Ciudad de Panamá es gratis a domicilio, y en el interior es a la sucursal Servientrega para retiro (no puerta a puerta). Las entregas a domicilio y los envíos menores a US$300 tienen su costo según la zona.',
  updated_at = now()
where key = 'envio_resumen';

-- Verificación: debe devolver 1 fila con "SOLO al comprar en línea por la WEB".
-- select value from public.store_facts where key = 'envio_resumen';
