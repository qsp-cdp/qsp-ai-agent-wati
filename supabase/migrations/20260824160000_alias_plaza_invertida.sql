-- El pedido Shopify #8871 no se despachó a Shipday, y la causa fue el ORDEN DE LAS PALABRAS.
--
-- El cliente escribió "Principal hacia Altos de Panama **Plaza Mi Condado** 3er Piso". El diccionario
-- tiene ese edificio como "P.H. **Mi Condado Plaza**". El emparejador de `resolver_tarifa_core` busca el
-- nombre del diccionario como subcadena de la dirección (`qp like '% '||nombre||' %'`), así que
-- "mi condado plaza" NO aparece dentro de "plaza mi condado 3er piso": sin_match, y sin zona el pedido
-- no se despacha. Consultar "Mi Condado" a secas sí resolvía — por eso el fallo era invisible.
--
-- En Panamá "Plaza X" y "X Plaza" son el mismo edificio, y quien escribe la dirección usa cualquiera de
-- las dos. Este alias invertido cubre la familia entera de una vez, no solo el caso que se cayó hoy.
--
-- Solo se toca lo que TERMINA en "plaza" y se agrega la forma con "plaza" al frente. No se inventa
-- ningún lugar nuevo: es el mismo registro con otro orden de palabras.
update public.sectores_entrega
set alias_norm = btrim(
      coalesce(nullif(btrim(alias_norm), ''), '') ||
      case when coalesce(nullif(btrim(alias_norm), ''), '') = '' then '' else ', ' end ||
      'plaza ' || regexp_replace(barrio_norm, '\s*plaza$', ''), ', ')
where barrio_norm ~ '\splaza$'
  and ('plaza ' || regexp_replace(barrio_norm, '\s*plaza$', '')) <> barrio_norm
  and coalesce(alias_norm, '') !~ ('(^|, )plaza ' || regexp_replace(barrio_norm, '\s*plaza$', '') || '($|,)');
