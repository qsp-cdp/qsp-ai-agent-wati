-- REVERSA de 20260824160000_alias_plaza_invertida. El alias invertido estaba MAL y hay que quitarlo.
--
-- La hipótesis era que en Panamá "Plaza X" y "X Plaza" son el mismo edificio. Es falso, y la propia
-- tabla lo demuestra: son edificios DISTINTOS, a veces en corregimientos distintos — o sea, otra zona y
-- otra tarifa.
--
--   "Edificio Mar Plaza" (Bella Vista)   vs  "Plaza Mar" (San Francisco)
--   "P.H. Real Plaza" (Betania)          vs  "Edificio Plaza Real" (San Francisco)
--   "Marina Plaza" (San Francisco)       vs  "Edificio Plaza Marina II" (San Francisco)
--
-- Con el alias puesto, una dirección que dijera "Plaza Mar" resolvía a Bella Vista cuando el edificio
-- está en San Francisco. Cobrar la zona equivocada y mandar al repartidor al corregimiento equivocado.
--
-- Cómo se detectó: Isaac notó que Google Maps dentro de Shopify SÍ había resuelto la dirección del
-- pedido #8871. Su pin cae en **Ancón**, mientras el alias que yo había agregado lo mandaba a Betania
-- vía "P.H. Mi Condado Plaza". Dos corregimientos distintos: la coincidencia por texto era falsa.
--
-- La lección es la que ya está escrita en el prompt del bot y en el contrato de datos, y que aquí no
-- apliqué: no afirmar por deducción. "Se parece al revés" no es evidencia de que sea el mismo lugar.
-- El reemplazo correcto no es un alias, es usar el PIN que Shopify ya manda con la dirección.
update public.sectores_entrega
set alias_norm = nullif(
      btrim(
        regexp_replace(
          ', ' || alias_norm || ', ',
          ', ' || 'plaza ' || regexp_replace(barrio_norm, '\s*plaza$', '') || ', ',
          ', '
        ),
        ', '
      ), '')
where barrio_norm ~ '\splaza$'
  and coalesce(alias_norm, '') ~ ('(^|, )plaza ' || regexp_replace(barrio_norm, '\s*plaza$', '') || '($|,)');
