-- P3-c (4ª parte): el cliente escribe "P.H. Parkside" y el normalizador convierte los puntos en
-- espacios → "p h parkside", que NO casa con el alias "ph parkside". Caso real: pedido 8842, que
-- seguía en sin_match aun teniendo el PH cargado. Se agrega a cada PH la variante con el prefijo
-- separado, para cubrir las dos formas de escribirlo.
update sectores_entrega
set alias_norm = alias_norm || ', ' || regexp_replace(alias_norm, '^ph ', 'p h '),
    updated_at = now()
where tipo_zona = 'PH / Edificio'
  and alias_norm like 'ph %'
  and alias_norm not like '%p h %';
