-- P3-c (5ª parte): los dos edificios que quedaron sin resolver en las pruebas con pedidos reales.
-- No están en el directorio de eldeph; el negocio aportó las fuentes y de ahí salió la ubicación:
--   · P.H. ASTRE  → San Francisco (astrepanama.com, sección de ubicación). Pedido 8854.
--   · Edificio COREMUSA → Calidonia (coremusa.com/contactenos: mapa "Coremusa | Calidonia",
--     coords 8.971128,-79.537326). Pedido 8822.
-- Ambos corregimientos tienen UNA sola zona (Z1 Centro), así que no hay ambigüedad.
-- "astre" se indexa SOLO con prefijo (palabra corta); "coremusa" es distintivo y entra también suelto.
insert into sectores_entrega (corregimiento, barrio, barrio_norm, alias_norm, zona, tipo_zona, validacion, nota, updated_at)
values
  ('San Francisco', 'P.H. Astre', 'ph astre', 'ph astre, p h astre', 'Z1 Centro', 'PH / Edificio', 'Media',
   'Aportado por el negocio (astrepanama.com). Pedido 8854 daba sin_match.', now()),
  ('Calidonia', 'Edificio Coremusa', 'coremusa', 'coremusa, edificio coremusa, ph coremusa', 'Z1 Centro', 'PH / Edificio', 'Media',
   'Aportado por el negocio (coremusa.com/contactenos, mapa "Coremusa | Calidonia"). Pedido 8822 daba sin_match.', now());
