-- v47 (parche menor) — agrega el sector CEREMI (= "Altos del Lago", corregimiento Tocumen) que faltaba.
-- En la prueba de fuego el bot dio sin_match a "Ceremi". Según el listado granular de Tocumen es
-- "Altos del Lago o Ceremi" -> Z4a Este retiro ($6, retiro en agente verde, sin domicilio). Se agrega con
-- alias 'Ceremi' para que matchee por ese nombre. Idempotente (no duplica si ya existe). SQL Editor.
insert into public.sectores_entrega (corregimiento, barrio, distrito, sector_macro, tipo_zona, alias, zona, validacion, nota, barrio_norm, alias_norm)
select 'Tocumen', 'Altos del Lago', 'Panamá', 'Este extendido', 'Barrio/sector', 'Ceremi', 'Z4a Este retiro', 'Media',
       'Barrio de Tocumen; también llamado Ceremi (listado granular).', 'altos del lago', 'ceremi'
where not exists (select 1 from public.sectores_entrega where barrio_norm = 'altos del lago' and corregimiento = 'Tocumen');

-- Verificación:
--   select public.resolver_tarifa('ceremi');          -- ok, Z4a retiro $6
--   select public.resolver_tarifa('altos del lago');  -- ok, Z4a retiro $6
