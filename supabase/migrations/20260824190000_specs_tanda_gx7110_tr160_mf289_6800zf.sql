-- Cuatro fichas oficiales nuevas, leídas con `ficha-pdf`. Dos confirman lo que ya había, una lo
-- corrige, y una obliga a BORRAR un dato: era velocidad borrador vendida como velocidad de norma.
--
-- EL CASO DE LA GX7110, que es el que importa entender porque va a volver a pasar:
--
-- Su folleto dice "Velocidad de impresión¹ … aprox. 45 ppm negro / 25 ppm color", y la nota 1 al pie
-- dice que las velocidades son promedios de ESAT según ISO/IEC 24734. Leído así, 45/25 sería norma.
--
-- No lo es. El folleto de la MAXIFY GX7010 — el modelo anterior del mismo escalón — publica LAS DOS
-- cifras por separado: borrador 45 ppm / 25 ppm, y ESAT aprox. 24 ipm / 15.5 ipm. Los números de
-- borrador son idénticos a los que la hoja de la GX7110 presenta como si fueran ESAT. La nota al pie
-- es texto genérico del pie de página, no está pegada a esa fila.
--
-- Hay una segunda señal, y sirve como regla para la próxima: Canon publica ESAT en **ipm**, en una
-- fila rotulada "Velocidad de Impresión (ESAT)". Así están la GX4010 (18.0/13.0 ipm) y la G3170
-- (11.0/6.0 ipm). Cuando una hoja de Canon dice "ppm" a secas, no es ESAT.
--
-- No le copio a la GX7110 el 24/15.5 de la GX7010: es otro modelo, y eso sería deducir. Van a NULL.
-- Un NULL dice "no sé" y es cierto; un número deducido miente con la misma cara que uno bueno, y el
-- asesor ordena por ppm_negro — con 45 ahí, esta impresora encabeza la lista por un dato falso.
update public.impresoras_specs
set ppm_negro = null,
    ppm_color = null,
    notas = btrim(coalesce(notas, '') || case when coalesce(notas,'') = '' then '' else ' · ' end ||
      'Velocidad sin dato: el folleto solo publica 45/25 ppm, que son BORRADOR (el folleto de la ' ||
      'GX7010, mismo escalón, lista borrador 45/25 y ESAT 24/15.5 ipm por separado). Falta la hoja ' ||
      'de Canon con la fila "Velocidad de Impresión (ESAT) … ipm" de este modelo.'),
    fuente_url = 'https://www.canon.com.mx/media/documentosproducto/fichero/1/1171_Brochure_GX7110_301025F.pdf',
    fuente_fecha = current_date,
    updated_at = now()
where modelo ilike '%GX7110%';

-- TR160: la tabla tenía 8/5, que salió del título de la tienda. Canon publica ESAT 9.0 / 5.5 ipm.
update public.impresoras_specs
set ppm_negro = 9.0,
    ppm_color = 5.5,
    fuente_url = 'https://www.usa.canon.com/shop/p/pixma-tr160',
    fuente_fecha = current_date,
    updated_at = now()
where modelo ilike '%TR160%';

-- MF289dw: el folleto dice "Velocidad de impresión Hasta 35 ppm (carta)". La tabla ya tenía 35.
-- Láser monocromática, así que ppm_color en NULL es lo correcto, no un hueco.
update public.impresoras_specs
set fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/1161_Brochure_iC-MF289dw_0525F.pdf',
    fuente_fecha = current_date,
    updated_at = now()
where modelo ilike '%MF289%';

-- 6800zf: la ficha de HP dice "Print speed Black (A4, normal): Up to 52 ppm / Colour: Up to 52 ppm".
-- La tabla ya tenía 52/52.
update public.impresoras_specs
set fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/QSP-HP-6800zf-ficha-tecnica.pdf',
    fuente_fecha = current_date,
    updated_at = now()
where modelo ilike '%6800zf%';
