-- v58 — store_facts: TODO el costo de envío causa ITBMS (7%) (decisión de Gerencia, 20-jul).
-- Hasta ahora la data de envío estaba SIN ITBMS y el bot cotizaba "B/.6.00" / "B/.9.00" pelados. Ahora
-- muestra base + ITBMS + total (calculado; el bot no hace aritmética). El tool tarifa_entrega (frasearTarifa)
-- ya se actualizó en código para lo MISMO (fuente única de la lógica por sector); estas dos claves son el
-- genérico de info_tienda (interior y ciudad sin un sector concreto).
--   B/.6.00 + ITBMS (7%) = B/.6.42 · B/.7.00 + ITBMS = B/.7.49 · B/.9.00 + ITBMS = B/.9.63
-- Nota: store_facts es un espejo del metaobjeto Shopify (store_facts/datos-tienda) -> actualizar también
-- allá los MISMOS valores para que un re-sync no revierta esto. Aplicar en el SQL Editor.

-- Interior: ahora se ofrecen las DOS formas (retiro en sucursal / puerta a puerta), ambas + ITBMS.
update public.store_facts set
  value = 'Retiro en sucursal o agente Servientrega: B/.6.00 + ITBMS (7%) = B/.6.42. Entrega a domicilio puerta a puerta (vía Servientrega): B/.9.00 + ITBMS (7%) = B/.9.63. Los costos de envío causan ITBMS.',
  updated_at = now()
where key = 'tarifa_interior';

-- Ciudad de Panamá (genérico; el costo por sector exacto lo da tarifa_entrega).
update public.store_facts set
  value = 'Desde B/.6.00 + ITBMS (7%) = B/.6.42 en gran parte de la Ciudad de Panamá (San Miguelito y el este cercano B/.7.00 + ITBMS = B/.7.49). En zonas del este y norte varía según el sector: retiro en un punto Servientrega desde B/.6.00 + ITBMS = B/.6.42, o entrega a domicilio B/.9.00 + ITBMS = B/.9.63. Todos los costos de envío causan ITBMS (7%). Indíquenos su corregimiento o barrio y le confirmamos el costo exacto.',
  updated_at = now()
where key = 'tarifa_ciudad_panama';

-- Verificación: debe devolver 2 filas con "+ ITBMS" en el texto.
-- select key, value from public.store_facts where key in ('tarifa_interior','tarifa_ciudad_panama');
