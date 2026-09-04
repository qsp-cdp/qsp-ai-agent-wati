-- Tanda 4.

-- Epson EcoTank L1250 — Epson confirma ISO 10/5 ppm y el rendimiento que ya tenía la fila
-- (4.500 negro / 7.500 color por juego de repuesto). Solo faltaban los consumibles.
update public.impresoras_specs set
  consumibles  = 'Botellas T544: T544120-AL negro, T544220-AL cian, T544320-AL magenta, T544420-AL amarillo',
  notas        = 'ISO 10/5 ppm; impresora de función única (solo imprime); Wi-Fi, sin Ethernet',
  fuente_url   = 'https://epson.com.mx/Para-el-hogar/Impresoras/Inyecci%C3%B3n-de-tinta/Impresora-Inal%C3%A1mbrica-EcoTank-L1250/p/C11CJ71301',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'Epson EcoTank L1250';

-- HP OfficeJet Pro 9730 — el dúplex estaba SIN DATO. HP publica velocidad de impresión a dos caras
-- (20 ipm A4 / 21 ipm carta), y eso solo se mide si el dúplex es automático.
--
-- Los ppm NO se tocan a propósito. HP anuncia "hasta 33 ppm en negro, modo normal", pero el modo normal
-- no es el estándar ISO con el que está cargada toda esta tabla; los 22/18 que ya tenía la fila son la
-- cifra ISO y son coherentes con el resto. Cambiarlos por el 33 repetiría exactamente el error de la
-- L5590: mezclar dos varas distintas en la misma columna.
update public.impresoras_specs set
  duplex_auto  = true,
  consumibles  = 'Cartuchos HP 938 (negro, cian, magenta, amarillo)',
  notas        = 'Formato ancho, imprime hasta 11"x17"; dúplex AUTOMÁTICO (20 ipm A4 / 21 ipm carta); ISO 22/18 ppm — HP también anuncia 33 ppm en "modo normal", que NO es la medida ISO; USB 2.0, Ethernet 10/100 y Wi-Fi doble banda',
  fuente_url   = 'https://www.hp.com/py-es/products/printers/product-details/2101505631',
  fuente_fecha = date '2026-08-22', updated_at = now()
where modelo = 'HP OfficeJet Pro 9730';
