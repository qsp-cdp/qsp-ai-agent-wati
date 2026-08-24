-- Dos notas que quedaron al descubierto al revisar las velocidades. Las notas no son decoración: el
-- asesor las repite al cliente tal como están, así que una nota falsa se dice en voz alta.

-- La GX7110 tenía "La más rápida de la línea MegaTank". Esa frase se apoyaba en el 45 ppm que acabo
-- de borrar por ser velocidad borrador. Sin la cifra, la frase es una afirmación sin respaldo — y si
-- el ESAT real está cerca del de la GX7010 (24 ipm), la GX4010 con 18 no queda tan lejos como
-- "la más rápida" hace pensar. Se quita la frase, se quedan los hechos que sí están en el folleto.
update public.impresoras_specs
set notas = btrim(regexp_replace(notas, 'La más rápida de la línea MegaTank;?\s*', ''), ' ;·'),
    updated_at = now()
where modelo ilike '%GX7110%' and notas like '%más rápida de la línea MegaTank%';

-- La TR160 decía "Batería LK-62". La LK-62 es la de la TR150. Canon publica LK-72 para la TR160
-- (aprox. 330 páginas por carga). Mismo patrón que el MPN: el producto se duplicó del modelo
-- anterior y se llevó puestos los datos del accesorio.
update public.impresoras_specs
set notas = replace(notas, 'LK-62', 'LK-72'),
    updated_at = now()
where modelo ilike '%TR160%' and notas like '%LK-62%';
