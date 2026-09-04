-- La referencia se había escrito DENTRO de la dirección por el viaje de ida y vuelta a Shipday: la
-- orden salía con "dirección — referencia" pegadas, Shipday guardaba esa concatenación, y la pierna de
-- vuelta de shipday-status la leía como "la dirección cambió" y la escribía de regreso en
-- `contacts.address`. De ahí se espejaba además a la ficha de WATI.
--
-- Se le quita la cola solo cuando coincide EXACTO con la referencia que ya está guardada aparte. Si no
-- coincide se deja como está: puede ser texto que un humano escribió a mano, y no se adivina.
--
-- Alcance real al aplicarla: 1 contacto (6328-6286). Pocas porque el despacho por WATI es reciente —
-- de ahí la urgencia de cortarlo antes de que la fase de prueba genere más.
update public.contacts
set address = btrim(left(address, position(' — ' || referencia in address) - 1)),
    updated_at = now()
where referencia is not null
  and btrim(referencia) <> ''
  and position(' — ' || referencia in address) > 1;
