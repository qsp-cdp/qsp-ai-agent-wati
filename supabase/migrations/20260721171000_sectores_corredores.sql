-- Los 8 sectores nuevos (ids 420-427 en prod) que cierran 4 bugs vivos, agregados a mano el 21-jul y
-- back-porteados al repo para reproducir producción. Ver docs/handoff / el resumen del otro workstream:
--   Tumba Muerto → Z1 $6 (antes sin_match, 31 contactos) · Paseo del Norte → Z3 $7 (antes Z1 Casco Viejo) ·
--   San Miguelito (genérico) → Z3/Z6 $7 ambiguo (antes Z1 Santa Ana $6) · Vía Tocumen → ambiguo 3 tramos
--   (antes Z4a "sin domicilio" con confianza Alta) · Vía España → Z1 $6 (antes sin_match, 81 direcciones).
-- Convención CORREDORES: una avenida cruza varias zonas → varias filas con el mismo `barrio_norm`; el
-- resolver devuelve `ambiguo` y el bot pregunta el tramo (Vía Tocumen: 3 filas; ver 20260706180000).
--
-- Idempotente (DELETE por (corregimiento,barrio) + INSERT). En prod ya está aplicado → re-correrlo NO es
-- necesario (solo fidelidad del repo); es seguro re-correrlo (los `id` de identity se reasignan, el resolver
-- no depende del id). NO se especifica `id` (columna `generated always as identity`). Aplicar en el SQL Editor
-- solo si se levanta un entorno nuevo. Depende de que existan las zonas Z1..Z6 + Z4a (migraciones
-- 20260706170000 y 20260706180000).

-- La tabla ya tiene RLS on + grants a service_role (migración 20260706170000). Se reafirma aquí para que
-- este archivo sea autocontenido y seguro (idempotente; no expone la tabla a anon/authenticated).
alter table public.sectores_entrega enable row level security;
grant select, insert, update, delete on public.sectores_entrega to service_role;

delete from public.sectores_entrega where (corregimiento, barrio) in (
  ('Betania','Tumba Muerto (Vía Ricardo J. Alfaro)'),
  ('Rufina Alfaro','Paseo del Norte'),
  ('Bella Vista','Vía España (corredor)'),
  ('José Domingo Espinar','San Miguelito (sector norte/centro)'),
  ('Omar Torrijos','San Miguelito (sector interno)'),
  ('Don Bosco','Vía Tocumen sector Don Bosco'),
  ('Mateo Iturralde','Vía Tocumen sector San Miguelito'),
  ('Tocumen','Vía Tocumen sector Tocumen')
);

insert into public.sectores_entrega (corregimiento,barrio,distrito,sector_macro,tipo_zona,alias,zona,validacion,nota,barrio_norm,alias_norm) values
  ('Betania','Tumba Muerto (Vía Ricardo J. Alfaro)','Panamá',NULL,NULL,'Tumbamuerto','Z1 Centro','Alta','Nombre coloquial del corredor. 31 contactos; co-ocurre con La Locería, La Alameda, El Dorado, Linda Vista, Villa de las Fuentes — todos Betania Z1.','tumba muerto','tumbamuerto'),
  ('Rufina Alfaro','Paseo del Norte','San Miguelito',NULL,NULL,NULL,'Z3 San Miguelito','Media','6 contactos; co-ocurre con Brisas del Golf (Rufina Alfaro). Antes caía por error en Paseo Esteban Huertas, Casco Viejo Z1.','paseo del norte',NULL),
  ('Bella Vista','Vía España (corredor)','Panamá',NULL,NULL,'Avenida España','Z1 Centro','Alta','Corredor, no barrio: cruza varios corregimientos pero todos de Z1, misma tarifa. 81 direcciones sin match previo; co-ocurrencia 19 Z1 vs 1 Z4a.','via espana','avenida espana'),
  ('José Domingo Espinar','San Miguelito (sector norte/centro)','San Miguelito',NULL,NULL,NULL,'Z3 San Miguelito','Media','Generica: San Miguelito a secas es ambiguo entre Z3 y Z6, ambas 7 USD propia. El match exacto desplaza el falso positivo con San Miguel de Santa Ana Z1 6 USD.','san miguelito',NULL),
  ('Omar Torrijos','San Miguelito (sector interno)','San Miguelito',NULL,NULL,NULL,'Z6 San Miguelito interno','Media','Par de la fila Z3: juntas producen ambiguo con dos opciones de 7 USD.','san miguelito',NULL),
  ('Don Bosco','Vía Tocumen sector Don Bosco','Panamá',NULL,NULL,NULL,'Z2 Este cercano','Media','Corredor Domingo Diaz / Via Tocumen. Antes via tocumen resolvia a Z4a con confianza Alta y negaba domicilio.','via tocumen',NULL),
  ('Mateo Iturralde','Vía Tocumen sector San Miguelito','San Miguelito',NULL,NULL,NULL,'Z6 San Miguelito interno','Media','Tramo de San Miguelito del corredor. Coincide con la fila existente Avenida Domingo Diaz sector Paraiso.','via tocumen',NULL),
  ('Tocumen','Vía Tocumen sector Tocumen','Panamá',NULL,NULL,NULL,'Z4a Este retiro','Media','Tramo final: aqui si aplica retiro en agente, no domicilio.','via tocumen',NULL);

-- Verificación: select public.resolver_tarifa('transistmica'); -- ambiguo (corredor)
--               select public.resolver_tarifa('via tocumen');  -- ambiguo (3 tramos)
--               select public.resolver_tarifa('tumba muerto');  -- ok Z1 $6
