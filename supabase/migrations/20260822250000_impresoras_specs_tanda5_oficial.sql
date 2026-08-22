-- Tanda 5.

-- Epson WorkForce Pro WF-C5891 — la fila ya coincidía con Epson en todo (ISO 25/25, ADF, dúplex,
-- oficio, rendimiento 10.000/5.000). Solo faltaba la fuente y precisar el ADF: es DÚPLEX, de 50
-- páginas y con escaneo a una sola pasada, que es el argumento de venta del equipo.
update public.impresoras_specs set
  notas        = 'ISO 25/25 ppm; ADF DÚPLEX de 50 páginas con escaneo a una sola pasada; cama plana tamaño Oficio; copia, impresión, escaneo y fax a dos caras; pantalla táctil 4,3"; volumen mensual recomendado hasta 8.300 páginas',
  fuente_url   = 'https://epson.com.mx/Para-el-trabajo/Impresoras/Inyecci%C3%B3n-de-Tinta/Impresora-WorkForce-Pro-WF-C5891/p/C11CK27301',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Epson WorkForce Pro WF-C5891';

-- Epson EcoTank L8050 — fotográfica. Epson precisa lo que a un cliente de fotos le importa: 6 colores
-- CON cian claro y magenta claro (no seis cualquiera), sin bordes hasta A4/carta, 25 segundos por foto
-- 10x15 y 2.100 fotos por juego de botellas. Los ppm siguen en nulo: Epson no publica velocidad ISO de
-- documentos para este modelo, y no se inventa.
update public.impresoras_specs set
  consumibles  = 'Tinta EcoTank de 6 colores, incluidos cian claro y magenta claro (juego de repuesto: hasta 2.100 fotos de 10x15 cm)',
  notas        = 'Fotográfica de tanque, 6 colores con cian claro y magenta claro; imprime sin bordes hasta A4/carta; una foto de 10x15 cm en 25 segundos; solo impresión',
  fuente_url   = 'https://epson.com.mx/Para-el-trabajo/Impresoras/Fotos/Impresora-Fotogr%C3%A1fica-Inal%C3%A1mbrica-EcoTank-L8050/p/C11CK37301',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Epson EcoTank L8050';
