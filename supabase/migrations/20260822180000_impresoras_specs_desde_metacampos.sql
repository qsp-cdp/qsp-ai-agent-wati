-- ADF y dúplex desde los METACAMPOS estructurados de Shopify (taxonomía estándar), no desde la prosa.
--
-- Hallazgo del 22-ago: los productos de impresora traen metacampos `shopify.*` de la taxonomía
-- estándar —`printer-copier-specialized-features`, `compatible-paper-size`, `connection-type`,
-- `printer-functions`, `print-technology`— y están POBLADOS. Son datos ya estructurados, que es
-- justo lo que a esta tabla le faltaba: `adf` y `duplex_auto` eran los dos campos con más nulos y
-- los que más pesan al recomendar para oficina.
--
-- REGLA CLAVE: solo se escribe el TRUE cuando el metacampo lo AFIRMA. La ausencia de "ADF" en la
-- lista NO se toma como "no tiene": la taxonomía se llena a mano producto por producto y está
-- incompleta. Caso comprobado: la HP LaserJet Pro MFP 3103fdw —que sí tiene ADF— solo lista
-- "Almacenamiento de papel". Deducir el `false` desde el silencio haría que `asesorar_impresora`
-- descartara modelos válidos cuando el cliente pide alimentador automático. Es el mismo principio
-- que la regla del barrio ambiguo en el prompt: no afirmar por deducción.
--
-- Tampoco se pisa nada ya cargado: solo se rellenan los NULOS.
update public.impresoras_specs s set adf = true, updated_at = now()
from (values
  ('hp-smarttank-530-impresora-multifunciona-l'),
  ('hp-smart-tank-750-impresora-multifuncional'),
  ('lexmark-mx331adn-blanco-y-negro-impresora-multifuncional'),
  ('epson-ecotank-l14150-impresora-multifuncional'),
  ('impresora-epson-ecotank-l5590-inalambrica'),
  ('impresora-hp-laserjet-pro-mfp-4103fdw'),
  ('hp-laserjet-4303fdw-colores-vibrantes-con-wifi-integrado'),
  ('impresora-laser-hp-color-laserjet-enterprise-mfp-5800dn-45-ppm-negro-y-color-1-200-x-1-200-dpi'),
  ('hp-color-laserjet-enterprise-mfp-m480f-3qa55a'),
  ('hp-color-laserjet-pro-3303fdw-imprime-escanea-y-copia-con-calidad-laser-en-color'),
  ('hp-color-laserjet-enterprise-flow-6800zf'),
  ('impresora-laser-multifuncional-canon-imagerunner-1643i-vidrio-del-escaner-tamano-legal'),
  ('impresora-multifuncion-hp-laser-137fnw'),
  ('impresora-laser-multifuncional-brother-mfc-t4500dw-e'),
  ('impresora-laser-brother-dcp-l2640dw-inalambrica-monocromatica-con-copia-y-escaneo-duplex-movil-blanco-y-negro'),
  ('impresora-laser-multifuncional-brother-mfc-l5705dw-escaner-legal-velocidad-52-ppm-conectividad-inalambrica-pantalla-tactil-4-85-duplex-copia'),
  ('impresora-hp-officejet-pro-9730-ideal-para-formatos-grandes-11-x-17-incluye-dos-bandejas'),
  ('impresora-hp-officejet-pro-9130-multifuncional-profesionalismo-y-eficiencia-accesos-directos-y-conexiones-seguras'),
  ('impresora-laser-multifuncional-monocromatica-brother-mfc-l3720cdw-impresion-duplex-escaneo-y-copia-y-conexion-inalambrica-a-red-copia'),
  ('hp-laserjet-enterprise-m528dn'),
  ('impresora-epson-workforce-pro-wf-c5890'),
  ('impresora-epson-workforce-pro-wf-c5891-multifuncional-a-color'),
  ('impresora-laser-a-color-multifuncional-canon-imageclass-x-mf1538c-copia-escaneo-y-fax-impresion-duplex-y-movil'),
  ('impresora-laser-monocromatica-multifuncional-canon-imageclass-mf289dw-copia-escaneo-y-fax-impresion-duplex-y-movil-35-ppm'),
  ('impresora-multifuncional-brother-dcp-t730dw-color-dcpt-730dw-tinta-continua-conectividad-inalambrica-impresion-duplex-27-ppm-negro-23-ppm-color'),
  ('impresora-canon-pixma-g4170-escaner-automatico-wi-fi'),
  ('impresora-multifuncional-epson-ecotank-l6370-impresion-duplex-18-ppm-negro-9-ppm-color'),
  ('impresora-canon-maxify-gx7110-impresion-profesional-inalambrica-conectividad-canon-print-app-alta-velocidad-2-7-lcd-tactil-45-ppm-negro-25-ppm-color'),
  ('impresora-epson-workforce-pro-wf-m5899-multifuncional-monocromatica-25-ppm-negro')
) as t(handle)
where s.handle = t.handle and s.adf is null;

update public.impresoras_specs s set duplex_auto = true, updated_at = now()
from (values
  ('impresora-canon-ts3610-diseno-compacto'),
  ('impresora-epson-ecotank-l4360-impresion-a-doble-cara-multifuncional-compacta-y-eficiente-10-5-ppm-negro-5-ppm-color')
) as t(handle)
where s.handle = t.handle and s.duplex_auto is null;
