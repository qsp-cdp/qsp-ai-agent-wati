-- `fichas_pdf.modelo` venía en NULL para todo lo que se extrajo sin saber qué era. Esa columna es lo
-- único que hace consultable la tabla: sin ella, encontrar la ficha de un equipo obliga a leer los
-- 99 textos. Se etiquetan por su primera línea, que es donde el fabricante pone el nombre.
--
-- El hallazgo de fondo: catorce fichas de la propia tienda tenían nombres que no dicen nada
-- (mmo_110498370…, 647a4ff83d0dd0…, high.pdf, original.pdf, P012-518.pdf, 015542-1.pdf) y por eso
-- llevaban meses sin usarse. Entre ellas estaban las de la 5700dn, la 5800dn, la 4303fdw, la
-- M501dn, la M528dn, la MFC-L5705DW y los tres SureColor. Buscarlas afuera fue innecesario.
update public.fichas_pdf set modelo = v.m from (values
 ('%mmo_110498370%','HP Color LaserJet Enterprise 5700dn'),
 ('%mmo_110498372%','HP Color LaserJet Enterprise MFP 5800dn'),
 ('%mmo_110498373%','HP Color LaserJet Enterprise Flow 6800zf (ficha alterna)'),
 ('%647a4ff83d0dd0%','HP Color LaserJet Pro 4303fdw'),
 ('%648b8f034c0095%','HP Color LaserJet Pro 4303dw'),
 ('%4AA6-4361SPL%','HP LaserJet Pro M501dn'),
 ('%4AA7-5278SPL%','HP LaserJet Enterprise M528dn'),
 ('%P012-518%','Brother MFC-L5705DW'),
 ('%original.pdf%','Epson SureColor T3170'),
 ('%original_1.pdf%','Epson SureColor T5470M'),
 ('%28381_FT_2%','Brother DCP-T530DW (ficha alterna)'),
 ('%1127177_FT%','HP DeskJet Ink Advantage 2875'),
 ('%015542-1%','HP LaserJet Pro MFP 4103fdw (ficha alterna)'),
 ('%4AA7-5750SPL_1%','HP Smart Tank 530 (ficha alterna)'),
 ('%high.pdf%','Lexmark CX522ade'),
 ('%high_1.pdf%','Lexmark MX522adhe'),
 ('%4aa7-4660ese%','HP LaserJet Managed E50145dn'),
 ('%HP-3890837033%','HP LaserJet Pro MFP M227'),
 ('%HP-4094522463%','HP Laser MFP 137fnw (ficha alterna)'),
 ('%c06719763%','HP ScanJet Pro 3000 s4'),
 ('%c06719773%','HP ScanJet Enterprise Flow 5000 s5'),
 ('%c08228392%','HP ScanJet Pro 2600 f1'),
 ('%c08757441%','HP DesignJet T950'),
 ('%c08757461%','HP DesignJet T950 MFP'),
 ('%c08758885%','HP DesignJet T850 (ficha alterna)'),
 ('%5fd107d0e540c%','Escáner de cama plana (sin marca en la ficha)'),
 ('%910-005281%','Logitech G305'),
 ('%original_01c64932%','Proyector portátil Epson')
) as v(patron, m)
where public.fichas_pdf.modelo is null and public.fichas_pdf.url like v.patron;

-- Dos filas eran pruebas de egreso hacia Canon, no fichas de catálogo. Se borran: una tabla de
-- fuentes no debe tener adentro cosas que no son fuentes de nada.
delete from public.fichas_pdf where modelo in ('prueba egress Canon', 'prueba patron G-Series');

-- Etiquetas de trabajo que quedaron con paréntesis mientras se identificaban.
update public.fichas_pdf set modelo = 'Epson DFX-9000' where modelo = 'Epson DFX-9000 (guía del usuario)';
update public.fichas_pdf set modelo = 'HP DeskJet Ink Advantage 2975' where modelo = 'HP DeskJet Ink Advantage 2975 (pt)';
