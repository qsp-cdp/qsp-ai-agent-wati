-- Fase 0 — REFERENCIAS DE UBICACIÓN en la base de conocimiento del bot (store_facts).
--
-- `direccion` ya traía "Plaza Aventura, Piso 4, Oficina 454, Vía Ricardo J. Alfaro" — correcto pero
-- seco: al cliente que pregunta "¿cómo llego?" le sirven los puntos de referencia de la calle, no la
-- dirección postal. Estas dos filas son SOLO DATOS: info_tienda devuelve todos los pares públicos de
-- la tabla, así que el bot las usa sin tocar código (la regla del prompt ya lo obliga a responder
-- ubicación exclusivamente con lo que devuelva la tool, nunca de memoria).
--
-- Idempotente (upsert por la PK `key`): re-correrla actualiza el texto sin duplicar filas.
insert into public.store_facts (key, value, updated_at) values
  ('como_llegar',
   'Estamos en Plaza Aventura, sobre la Vía Ricardo J. Alfaro (Tumba Muerto), Ciudad de Panamá. '
   'Referencias para ubicar la plaza: queda diagonal a Panadería Momi y frente a Plaza La Galería. '
   'Nuestra oficina de atención es la 454, en el Piso 4 de la plaza.',
   now()),
  ('estacionamiento',
   'Plaza Aventura cuenta con estacionamientos techados en el Piso 1. Puede estacionar ahí y subir '
   'al Piso 4, Oficina 454.',
   now())
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
