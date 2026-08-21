-- Base de conocimiento de impresoras (plan de la revisión integral, 21-ago-2026).
-- Fuente: las FICHAS de los 87 productos activos de la tienda Shopify (product_type de impresoras
-- y plotters), extraídas a mano el 21-ago-2026. NADA sale de memoria del modelo: si un campo no
-- estaba en la ficha, queda NULL. `verificado=false` hasta que el negocio revise cada fila
-- (docs/impresoras-specs-revision.md). El bot la consulta con la tool `asesorar_impresora` y
-- SIEMPRE debe confirmar precio/stock con buscar_producto (aquí no hay precios a propósito:
-- cambian, y el invariante del proyecto es que todo precio sale de buscar_producto).

create table if not exists public.impresoras_specs (
  id bigint generated always as identity primary key,
  handle text unique not null,          -- ancla al producto de Shopify (slug)
  modelo text not null,
  marca text,
  categoria text not null,              -- tinta_continua | tinta_cartucho | laser | termica_pos | etiquetas | matriz | fotografica | sublimacion | plotter
  color boolean,                        -- imprime a color (false = monocromática)
  funciones text[] not null default '{imprimir}',  -- imprimir, copiar, escanear, fax
  duplex_auto boolean,                  -- impresión a doble cara automática (null = la ficha no lo dice)
  adf boolean,                          -- alimentador automático de documentos
  wifi boolean,
  ethernet boolean,
  tamano_maximo text,                   -- carta | legal | 11x17 | 13x19 | 24" | 36" | 44" | recibo 3" | etiqueta 4"
  ppm_negro numeric,
  ppm_color numeric,
  rendimiento text,                     -- texto libre de la ficha: "12,000 neg / 6,000 col"
  consumibles text,                     -- SOLO si la ficha lo nombra: "Botellas Canon GI-11"
  perfil text,                          -- hogar | hogar_oficina | oficina | alto_volumen | portatil | punto_de_venta | especializada | formato_ancho
  notas text,
  verificado boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.impresoras_specs enable row level security;
revoke all on public.impresoras_specs from anon, authenticated;

comment on table public.impresoras_specs is
  'Specs estructurados de las impresoras del catálogo, extraídos de las fichas de Shopify. Los lee asesorar_impresora (copilot-webhook, service role). verificado=false hasta revisión del negocio.';

insert into public.impresoras_specs
  (handle, modelo, marca, categoria, color, funciones, duplex_auto, adf, wifi, ethernet, tamano_maximo, ppm_negro, ppm_color, rendimiento, consumibles, perfil, notas) values
-- ═══ TINTA (29) ═══
('hp-officejet-200-mobile-impresora-de-inyeccion-portatil','HP OfficeJet 200','HP','tinta_cartucho',true,'{imprimir}',false,false,true,false,'carta',10,7,null,null,'portatil','Portátil con batería; solo impresión'),
('hp-smarttank-530-impresora-multifunciona-l','HP Smart Tank 530','HP','tinta_continua',true,'{imprimir,copiar,escanear}',false,true,true,false,'carta',11,5,'12,000 neg / 8,000 col',null,'hogar_oficina','Escáner automático (título de la ficha)'),
('epson-l3250','Epson EcoTank L3250','Epson','tinta_continua',true,'{imprimir,copiar,escanear}',false,false,true,false,'carta',10,5,'4,500 neg / 7,500 col',null,'hogar',null),
('hp-smart-tank-750-impresora-multifuncional','HP Smart Tank 750','HP','tinta_continua',true,'{imprimir,copiar,escanear}',true,true,true,true,'carta',15,9,null,null,'oficina','ADF 35 hojas; bandeja 250'),
('epson-ecotank-l14150-impresora-multifuncional','Epson EcoTank L14150','Epson','tinta_continua',true,'{imprimir,copiar,escanear,fax}',true,null,true,true,'13x19',17,9,'7,500 neg / 6,000 col',null,'formato_ancho','Imprime hasta A3+ (13"x19")'),
('impresora-epson-ecotank-l1250','Epson EcoTank L1250','Epson','tinta_continua',true,'{imprimir}',false,false,true,false,'carta',10,5,'4,500 neg / 7,500 col',null,'hogar','Solo impresión'),
('impresora-epson-ecotank-l5590-inalambrica','Epson EcoTank L5590','Epson','tinta_continua',true,'{imprimir,copiar,escanear,fax}',null,null,true,true,'carta',33,15,null,null,'oficina','Ficha con conflicto de velocidad color: título 15 ppm, cuerpo 20 ppm'),
('impresora-epson-workforce-pro-wf-c5810','Epson WorkForce Pro WF-C5810','Epson','tinta_continua',true,'{imprimir,copiar,escanear}',true,null,null,null,'legal',25,25,'10,000 neg / 5,000 col (bolsas RIPS)','Bolsas de tinta reemplazables (RIPS)','alto_volumen','Hasta 8,000 págs/mes; capacidad 1,830 hojas con bandejas opcionales'),
('impresora-hp-smart-tank-580','HP Smart Tank 580','HP','tinta_continua',true,'{imprimir,copiar,escanear}',false,false,true,false,'carta',12,5,'12,000 neg / 6,000 col',null,'hogar_oficina',null),
('impresora-canon-pixma-g3170-color-tinta-continua-wifi-multifuncional-botellas-de-tinta-de-alto-rendimiento-pantalla-lcd-3-4-cm','Canon PIXMA G3170','Canon','tinta_continua',true,'{imprimir,copiar,escanear}',null,false,true,false,'legal',8.8,5,'7,600 neg / 8,100 col','Botellas Canon GI-11','hogar_oficina','El MegaTank más vendido de la línea en Panamá según la ficha'),
('impresora-canon-maxify-gx4010-calidad-profesional-para-tu-oficina','Canon MAXIFY GX4010','Canon','tinta_continua',true,'{imprimir,copiar,escanear,fax}',true,true,true,true,'legal',30,18,null,'Botellas Canon GI-16 (pigmentada)','oficina','ADF 35; 350 hojas; ciclo 33,000 págs/mes; tinta resistente al agua'),
('impresora-laser-multifuncional-brother-mfc-t4500dw-e','Brother MFC-T4500DW','Brother','tinta_continua',true,'{imprimir,copiar,escanear,fax}',true,true,true,true,'11x17',22,20,'6,000 neg / 5,000 col',null,'formato_ancho','A3 11"x17" impresión y escaneo; ADF 50'),
('impresora-canon-ts3610-diseno-compacto','Canon TS3610','Canon','tinta_cartucho',true,'{imprimir,copiar,escanear}',null,false,true,false,'carta',7.7,4,null,'Cartuchos Canon PG-145 / CL-146 (y XL)','hogar','Compacta económica; reemplaza TS3110'),
('impresora-hp-officejet-pro-9730-ideal-para-formatos-grandes-11-x-17-incluye-dos-bandejas','HP OfficeJet Pro 9730','HP','tinta_cartucho',true,'{imprimir,copiar,escanear}',null,true,true,true,'11x17',22,18,null,null,'formato_ancho','Dos bandejas 11"x17"; escanea hasta 11"x17"; reemplaza OfficeJet 7740'),
('impresora-hp-officejet-pro-9130-multifuncional-profesionalismo-y-eficiencia-accesos-directos-y-conexiones-seguras','HP OfficeJet Pro 9130','HP','tinta_cartucho',true,'{imprimir,copiar,escanear,fax}',true,true,true,true,'carta',25,20,null,null,'oficina','ADF 35; dos bandejas (500 hojas)'),
('impresora-epson-workforce-pro-wf-c5890','Epson WorkForce Pro WF-C5890','Epson','tinta_continua',true,'{imprimir,copiar,escanear}',null,null,true,true,'legal',25,25,'10,000 neg / 5,000 col (bolsas)','Bolsas de tinta reemplazables','alto_volumen','Hasta 8,000 págs/mes'),
('impresora-epson-workforce-pro-wf-c5891-multifuncional-a-color','Epson WorkForce Pro WF-C5891','Epson','tinta_continua',true,'{imprimir,copiar,escanear,fax}',true,true,true,true,'legal',25,25,'10,000 neg / 5,000 col (bolsas)','Bolsas de tinta reemplazables','alto_volumen','ADF dúplex 50; cama plana oficio; 8,300 págs/mes'),
('impresora-multifuncional-brother-mfc-t930dw-impresion-doble-cara-automatica-30-ppm-negro-26-ppm-color','Brother MFC-T930DW','Brother','tinta_continua',true,'{imprimir,copiar,escanear,fax}',true,true,true,false,'carta',30,26,'15,000 neg / 5,000 col',null,'oficina','ADF 20; bandeja 150 + multipropósito 80; velocidades en modo Eco'),
('impresora-multifuncional-brother-dcp-t730dw-color-dcpt-730dw-tinta-continua-conectividad-inalambrica-impresion-duplex-27-ppm-negro-23-ppm-color','Brother DCP-T730DW','Brother','tinta_continua',true,'{imprimir,copiar,escanear}',true,true,true,false,'carta',27,23,null,null,'hogar_oficina','ADF 20'),
('impresora-multifuncional-brother-dcp-t530dw-color-dcpt-530dw-tinta-continua-conectividad-inalambrica-impresion-duplex-27-ppm-negro-11-ppm-color','Brother DCP-T530DW','Brother','tinta_continua',true,'{imprimir,copiar,escanear}',true,false,true,false,'carta',28,11,'7,500 neg / 5,000 col',null,'hogar_oficina','Bandeja 150'),
('impresora-epson-ecotank-l4360-impresion-a-doble-cara-multifuncional-compacta-y-eficiente-10-5-ppm-negro-5-ppm-color','Epson EcoTank L4360','Epson','tinta_continua',true,'{imprimir,copiar,escanear}',true,false,true,false,'carta',15,8,'6,600 neg / 5,500 col','Botellas Epson T504','hogar_oficina','Wi-Fi doble banda'),
('canon-pixma-tr160-impresora-portatil-canon-inalambrica-para-imprimir-en-cualquier-lugar-8-ppm-negro-5-ppm-color','Canon PIXMA TR160','Canon','tinta_cartucho',true,'{imprimir}',false,false,true,false,'carta',8,5,null,'Cartuchos Canon PGI-35 / CLI-36','portatil','Batería LK-62 se vende aparte; solo impresión'),
('impresora-hp-smart-tank-583-wifi-con-tanque-de-tinta-de-alta-capacidad-reemplaza-hp-smart-tank-415-12-ppm-negro-5-ppm-color','HP Smart Tank 583','HP','tinta_continua',true,'{imprimir,copiar,escanear}',false,false,true,false,'carta',12,5,'12,000 neg / 6,000 col',null,'hogar_oficina','Reemplaza Smart Tank 415'),
('impresora-hp-deskjet-ink-advantage-2975-aj4y5a','HP DeskJet Ink Advantage 2975','HP','tinta_cartucho',true,'{imprimir,copiar,escanear}',null,false,true,false,'carta',null,null,null,null,'hogar','Básica económica; ficha sin velocidades'),
('impresora-multifuncional-brother-dcp-t230-color-dcpt-230-tinta-continua-conectividad-usb-27-ppm-negro-11-ppm-color','Brother DCP-T230','Brother','tinta_continua',true,'{imprimir,copiar,escanear}',false,false,false,false,'carta',28,11,'7,500 neg / 5,000 col',null,'hogar','SOLO USB, sin Wi-Fi; compacta'),
('impresora-canon-pixma-g4170-escaner-automatico-wi-fi','Canon PIXMA G4170','Canon','tinta_continua',true,'{imprimir,copiar,escanear,fax}',null,true,true,false,'legal',8.8,5,'6,000 neg / 7,700 col','Botellas Canon GI-11','hogar_oficina','ADF; evolución de la G4110'),
('impresora-multifuncional-epson-ecotank-l6370-impresion-duplex-18-ppm-negro-9-ppm-color','Epson EcoTank L6370','Epson','tinta_continua',true,'{imprimir,copiar,escanear}',true,null,true,true,'carta',18,9,'hasta 8,500 págs',null,'oficina','Wi-Fi dual band + Ethernet; vida útil 100,000 págs; reemplaza L6270'),
('impresora-canon-maxify-gx7110-impresion-profesional-inalambrica-conectividad-canon-print-app-alta-velocidad-2-7-lcd-tactil-45-ppm-negro-25-ppm-color','Canon MAXIFY GX7110','Canon','tinta_continua',true,'{imprimir,copiar,escanear}',true,true,true,true,'legal',45,25,null,'Botellas Canon GI-16','alto_volumen','La más rápida de la línea MegaTank; ADF 50 dúplex; 600 hojas'),
('impresora-epson-workforce-pro-wf-m5899-multifuncional-monocromatica-25-ppm-negro','Epson WorkForce Pro WF-M5899','Epson','tinta_continua',false,'{imprimir,copiar,escanear,fax}',null,null,true,true,'carta',25,null,'10,000 neg (bolsas RIPS)','Bolsas de tinta reemplazables','alto_volumen','MONOCROMÁTICA de tinta; 8,000 págs/mes; Ethernet Gigabit'),
-- ═══ LÁSER (28) ═══
('lexmark-mx331adn-blanco-y-negro-impresora-multifuncional','Lexmark MX331ADN','Lexmark','laser',false,'{imprimir,copiar,escanear,fax}',true,true,false,true,'legal',40,null,null,null,'oficina','ADF 50; USB + Ethernet, SIN Wi-Fi'),
('impresora-hp-laserjet-pro-mfp-3103fdw','HP LaserJet Pro MFP 3103fdw','HP','laser',false,'{imprimir,copiar,escanear,fax}',true,true,true,true,'carta',33,null,null,null,'oficina','ADF 50; bandeja 250'),
('impresora-hp-laserjet-pro-3003dw','HP LaserJet Pro 3003dw','HP','laser',false,'{imprimir}',true,false,true,true,'carta',35,null,null,null,'oficina','Solo impresión; Wi-Fi doble banda'),
('impresora-hp-laserjet-pro-4003dw','HP LaserJet Pro 4003DW','HP','laser',false,'{imprimir}',true,false,true,true,'carta',42,null,null,null,'oficina','Solo impresión; bandeja 250 + multiuso 100'),
('impresora-laser-hp-color-laserjet-pro-4203dw','HP Color LaserJet Pro 4203dw','HP','laser',true,'{imprimir}',true,false,true,true,'carta',33,33,null,null,'oficina','Solo impresión a COLOR; hasta 850 hojas; 50,000 págs/mes de ciclo'),
('impresora-hp-laserjet-pro-mfp-4103fdw','HP LaserJet Pro MFP 4103fdw','HP','laser',false,'{imprimir,copiar,escanear,fax}',true,true,true,true,'legal',42,null,null,null,'oficina','ADF 50; escaneo hasta legal; bandeja 250 + 100'),
('hp-laserjet-4303fdw-colores-vibrantes-con-wifi-integrado','HP Color LaserJet Pro 4303fdw','HP','laser',true,'{imprimir,copiar,escanear,fax}',true,true,true,true,'carta',33,33,'tóner 230A: ~2,000 neg / ~1,800 col','Tóner HP 230A (W2300A/01A/02A/03A)','oficina','Escaneo a doble cara automático; pantalla táctil 4.3"'),
('impresora-hp-laserjet-m11w-7md68a','HP LaserJet M111w','HP','laser',false,'{imprimir}',false,false,true,false,'carta',20,null,null,'Tóner HP 150A','hogar','El láser más pequeño de HP; hasta 3 usuarios'),
('impresora-laser-hp-color-laserjet-enterprise-mfp-5800dn-45-ppm-negro-y-color-1-200-x-1-200-dpi','HP Color LaserJet Enterprise MFP 5800dn','HP','laser',true,'{imprimir,copiar,escanear}',true,true,true,true,'carta',45,45,null,null,'alto_volumen','Enterprise; ADF 100; 80,000 págs/mes; fax opcional'),
('hp-color-laserjet-enterprise-mfp-m480f-3qa55a','HP Color LaserJet Enterprise MFP M480f','HP','laser',true,'{imprimir,copiar,escanear,fax}',true,true,true,true,'legal',28,28,null,null,'oficina','Enterprise de entrada; ADF 50'),
('hp-color-laserjet-enterprise-5700dn-imprime-escanea-y-copia-con-calidad-laser-en-color','HP Color LaserJet Enterprise 5700dn','HP','laser',true,'{imprimir}',true,false,false,true,'legal',45,45,null,null,'alto_volumen','Solo impresión; USB 3.0 + Ethernet, SIN Wi-Fi'),
('hp-color-laserjet-pro-3303fdw-imprime-escanea-y-copia-con-calidad-laser-en-color','HP Color LaserJet Pro 3303fdw','HP','laser',true,'{imprimir,copiar,escanear,fax}',true,true,true,true,'carta',26,26,null,null,'oficina','ADF 50; Wi-Fi 802.11ac doble banda'),
('hp-color-laserjet-enterprise-flow-6800zf','HP Color LaserJet Enterprise Flow 6800zf','HP','laser',true,'{imprimir,copiar,escanear}',true,true,null,null,'legal',52,52,null,null,'alto_volumen','Enterprise Flow; la más rápida del catálogo'),
('hp-laserjet-m141w-7md74a','HP LaserJet M141w','HP','laser',false,'{imprimir,copiar,escanear}',false,false,true,false,'carta',21,null,null,null,'hogar','Multifuncional láser más pequeña de HP; sin ADF; 100-1,000 págs/mes'),
('impresora-laser-monocromatica-canon-imageclass-lbp6030w','Canon imageCLASS LBP6030w','Canon','laser',false,'{imprimir}',false,false,true,false,'legal',19,null,null,null,'hogar','Compacta; casete 150 hojas; cartucho todo-en-uno'),
('impresora-laser-multifuncional-canon-imagerunner-1643i-vidrio-del-escaner-tamano-legal','Canon imageRUNNER 1643i','Canon','laser',false,'{imprimir,copiar,escanear}',true,true,true,true,'legal',45,null,null,null,'alto_volumen','Vidrio del escáner tamaño legal; 650→2,300 hojas'),
('impresora-multifuncion-hp-laser-137fnw','HP Laser 137fnw','HP','laser',false,'{imprimir,copiar,escanear,fax}',null,null,true,true,'carta',20,null,null,null,'oficina','Compacta 4 en 1'),
('impresora-laser-brother-dcp-l2640dw-inalambrica-monocromatica-con-copia-y-escaneo-duplex-movil-blanco-y-negro','Brother DCP-L2640DW','Brother','laser',false,'{imprimir,copiar,escanear}',true,true,true,true,'carta',36,null,null,null,'oficina','ADF 50; Wi-Fi doble banda'),
('impresora-laser-multifuncional-brother-mfc-l5705dw-escaner-legal-velocidad-52-ppm-conectividad-inalambrica-pantalla-tactil-4-85-duplex-copia','Brother MFC-L5705DW','Brother','laser',false,'{imprimir,copiar,escanear,fax}',true,true,true,true,'legal',42,null,'tóner TN850: 8,000 págs','Tóner Brother TN850','alto_volumen','ADF dúplex 50; bandeja 250 + 50'),
('impresora-laser-multifuncional-monocromatica-brother-mfc-l3720cdw-impresion-duplex-escaneo-y-copia-y-conexion-inalambrica-a-red-copia','Brother MFC-L3720CDW','Brother','laser',true,'{imprimir,copiar,escanear,fax}',true,true,true,true,'carta',19,19,null,null,'oficina','Láser COLOR; escaneo dúplex automático; bandeja 250'),
('hp-laserjet-enterprise-m528dn','HP LaserJet Enterprise M528dn','HP','laser',false,'{imprimir,copiar,escanear,fax}',true,true,false,true,'legal',45,null,null,null,'alto_volumen','ADF 100 dúplex; 150,000 págs/mes; Ethernet Gigabit, SIN Wi-Fi'),
('impresora-laser-multifuncional-monocromatica-brother-hl-l2460dw-impresion-duplex-escaneo-y-copia-y-conexion-inalambrica-a-red-copia','Brother HL-L2460DW','Brother','laser',false,'{imprimir}',true,false,true,true,'carta',36,null,'TN830 estándar / TN830XL alto rendimiento','Tóner Brother TN830 / TN830XL','hogar_oficina','Solo impresión; bandeja 250'),
('impresora-laser-a-color-multifuncional-canon-imageclass-x-mf1538c-copia-escaneo-y-fax-impresion-duplex-y-movil','Canon imageCLASS X MF1538C','Canon','laser',true,'{imprimir,copiar,escanear,fax}',true,true,true,true,'legal',40,40,null,null,'alto_volumen','Pantalla táctil 7"; escaneo dúplex una pasada; uniFLOW'),
('impresora-laser-monocromatica-multifuncional-canon-imageclass-mf289dw-copia-escaneo-y-fax-impresion-duplex-y-movil-35-ppm','Canon imageCLASS MF289dw','Canon','laser',false,'{imprimir,copiar,escanear,fax}',true,true,true,true,'legal',35,null,null,null,'oficina','Escaneo dúplex una pasada; bandeja 250; 1a página 4.9 s'),
('impresora-multifuncional-lexmark-lexmark-cx532adwe-35-33-ppm-2gb-quad-core-1-2-ghz-4-3-dc-100k','Lexmark CX532adwe','Lexmark','laser',true,'{imprimir,copiar,escanear,fax}',null,null,true,null,'carta',35,33,null,null,'alto_volumen','100,000 págs/mes; pantalla táctil 4.3"'),
('impresora-multifucional-canon-imageclass-mf665cdw','Canon imageCLASS MF665Cdw','Canon','laser',true,'{imprimir,copiar,escanear,fax}',null,true,true,true,'carta',26,26,null,null,'oficina','ADF 50 con escaneo dúplex una pasada; pantalla táctil 5"'),
('impresora-hp-laserjet-pro-m501dn-43-ppm','HP LaserJet Pro M501dn','HP','laser',false,'{imprimir}',true,false,false,true,'legal',43,null,null,null,'oficina','Solo impresión; USB + Ethernet Gigabit, SIN Wi-Fi'),
('canon-imageclass-mf465dw-ii-impresora-multifuncional-laser-monocromatica-wi-fi','Canon imageCLASS MF465dw II','Canon','laser',false,'{imprimir,copiar,escanear,fax}',true,true,true,true,'legal',42,null,'tóner 070: ~3,000 / 070H: ~10,200','Tóner Canon 070 / 070H','oficina','ADF dúplex 50 una pasada; 250+100 hojas (ampliable a 900); 750-4,000 págs/mes'),
-- ═══ TÉRMICAS DE RECIBO / POS (3) ═══
('impresora-termica-epson-tm-t88vii','Epson TM-T88VII','Epson','termica_pos',false,'{imprimir}',null,false,null,null,'recibo 3"',null,null,'hasta 500 mm/s',null,'punto_de_venta','Recibos POS de alto volumen (retail/hotelería); garantía 4 años'),
('impresora-termica-epson-tm-m30iii','Epson TM-m30III','Epson','termica_pos',false,'{imprimir}',null,false,null,true,'recibo 3"',null,null,null,null,'punto_de_venta','Compacta; 4 puertos USB para periféricos; carcasa IPX2'),
('impresora-termica-epson-tm-t20iii-usb-red','Epson TM-T20III','Epson','termica_pos',false,'{imprimir}',null,false,false,true,'recibo 3"',null,null,'hasta 250 mm/s',null,'punto_de_venta','USB + Red; la económica para PyME; cortador automático'),
-- ═══ ETIQUETAS (4) ═══
('impresora-de-etiquetas-brother-ql-800-imprime-negro-y-rojo-brother','Brother QL-800','Brother','etiquetas',false,'{imprimir}',null,false,false,false,'etiqueta 2.4"',null,null,'93 etiquetas/min','Cintas Brother DK (incluye DK-2251 y DK-1201)','especializada','Imprime negro y ROJO; USB; Plug & Label sin software'),
('impresora-de-etiquetas-ql-1100-hasta-4-pulgadas-de-ancho-blanco-y-negro-brother-ql-1100','Brother QL-1100','Brother','etiquetas',false,'{imprimir}',null,false,false,false,'etiqueta 4"',null,null,'69 etiquetas/min','Cintas Brother DK','especializada','Etiquetas de caja hasta 4" de ancho; códigos de barras; corte automático'),
('impresora-de-etiquetas-brother-ql-820-nwb','Brother QL-820NWB','Brother','etiquetas',false,'{imprimir}',null,false,true,true,'etiqueta 2.4"',null,null,'110 etiquetas/min','Cintas Brother DK (DK-2251)','especializada','Negro y ROJO; Bluetooth + Ethernet + Wi-Fi + USB host'),
('impresora-de-etiquetas-brother-ql-810w-imprime-negro-y-rojo','Brother QL-810W','Brother','etiquetas',false,'{imprimir}',null,false,true,false,'etiqueta 2.4"',null,null,'110 etiquetas/min','Cintas Brother DK (DK-2251)','especializada','Negro y ROJO; etiquetas continuas hasta 1 m; AirPrint'),
-- ═══ MATRIZ DE PUNTOS (5) ═══
('impresora-de-matriz-de-puntos-epson-lx-350-epson-c11cc24001','Epson LX-350','Epson','matriz',false,'{imprimir}',null,false,false,false,'carta',null,null,'390 cps',null,'especializada','9 agujas; USB + Paralelo + Serial; formularios multicopia'),
('impresora-de-matriz-epson-lq-590ii-c11cf39201-epson-c11cf39201','Epson LQ-590II','Epson','matriz',false,'{imprimir}',null,false,null,null,null,null,null,null,null,'especializada','⚠️ La ficha de la tienda está vacía (solo el título)'),
('impresora-de-matriz-epson-fx-890ii-c11cf37201-epson-c11cf37201','Epson FX-890 II','Epson','matriz',false,'{imprimir}',null,false,false,false,'carta',null,null,'680 cps',null,'especializada','9 agujas; USB + Paralelo; alto volumen continuo'),
('impresora-de-matriz-epson-fx-2190ii-c11cf38201-epson-epson-c11cf38201','Epson FX-2190II','Epson','matriz',false,'{imprimir}',null,false,null,null,'formato ancho',null,null,'738 cps; cinta de 12 millones de caracteres',null,'especializada','9 agujas formato ancho; formularios de hasta 7 partes; garantía 3 años'),
('impresora-de-matriz-dfx-9000-c11c605001-epson-epson-dfx-9000','Epson DFX-9000','Epson','matriz',false,'{imprimir}',null,false,null,null,'formato ancho',null,null,'1,550 cps (borrador ultra)',null,'especializada','9 agujas industrial; formularios continuos de altísimo volumen'),
-- ═══ FOTOGRÁFICAS (4) ═══
('impresora-epson-ecotank-l8180-formato-a3-fotografica','Epson EcoTank L8180','Epson','fotografica',true,'{imprimir,copiar,escanear}',true,false,true,true,'13x19',null,null,'hasta 2,300 fotos 4x6" por juego','Tinta Claria ET (6 colores)','especializada','Foto hasta A3+; bandeja para CD/DVD; copia/escanea hasta oficio'),
('impresora-canon-g510-fotografica','Canon PIXMA G510','Canon','fotografica',true,'{imprimir}',null,false,true,false,'carta',null,null,null,null,'especializada','Tinta continua fotográfica; solo impresión; LCD 2 líneas'),
('impresora-fotografica-canon-selphy-cp1500','Canon SELPHY CP1500','Canon','fotografica',true,'{imprimir}',null,false,true,false,'foto 4x6',null,null,null,'Kit papel/tinta SELPHY (KP-108IN)','portatil','Sublimación térmica; fotos al instante resistentes al agua; reemplaza CP1300'),
('impresora-fotografica-inalambrica-ecotank-l8050-fotos-impactantes','Epson EcoTank L8050','Epson','fotografica',true,'{imprimir}',null,false,true,false,'carta',null,null,'foto 10x15 cm en ~25 s','Tinta EcoTank de 6 colores','especializada','Foto profesional de tanque; solo impresión'),
-- ═══ SUBLIMACIÓN (3) ═══
('impresora-de-sublimacion-epson-surecolor-f170-1','Epson SureColor F170','Epson','sublimacion',true,'{imprimir}',null,false,null,null,'carta',null,null,null,'Tinta de sublimación Epson original','especializada','Bandeja automática 150 hojas; para personalización (tazas, camisetas)'),
('plotter-epson-surecolor-f570-24','Epson SureColor F570','Epson','sublimacion',true,'{imprimir}',null,false,null,null,'24"',null,null,null,'Tinta de sublimación Epson','especializada','Plotter de sublimación 24"; solución completa con papel transfer'),
('impresora-de-sublimacion-brother-sp-1','Brother SP-1','Brother','sublimacion',true,'{imprimir}',null,false,null,null,null,null,null,null,null,'especializada','⚠️ La ficha de la tienda tiene pegada la descripción de la Epson F170 (corregir en Shopify)'),
-- ═══ PLOTTERS (11) ═══
('ploter-hp-designjet-t250-24-pulgadas-5hb06a-b1k-hp-5hb06a-b1k','HP DesignJet T250','HP','plotter',true,'{imprimir}',null,false,true,true,'24"',null,null,'A1 en ~30 s',null,'formato_ancho','El más económico; sin bandeja de hojas sueltas'),
('ploter-hp-designjet-t650-36-pulgadas-5hb10a-b1k','HP DesignJet T650','HP','plotter',true,'{imprimir}',null,false,true,true,'36"',null,null,null,null,'formato_ancho','Incluye pedestal; Gigabit Ethernet + Wi-Fi'),
('plotter-hp-designjet-t850-multifunction-printer-36-in-2y9h2a','HP DesignJet T850 MFP','HP','plotter',true,'{imprimir,copiar,escanear}',null,false,null,null,'36"',null,null,null,null,'formato_ancho','Multifuncional (imprime/copia/escanea); reemplaza T830'),
('plotter-hp-desingjet-t1700dr-ps-44-in-printer-1vd88a','HP DesignJet T1700dr PS','HP','plotter',true,'{imprimir}',null,false,null,null,'44"',null,null,null,null,'formato_ancho','PostScript; doble rollo; CAD/GIS profesional'),
('plotter-canon-imageprograf-tc-20-24-pulgadas-5815c002','Canon imagePROGRAF TC-20','Canon','plotter',true,'{imprimir}',null,false,null,null,'24"',null,null,null,'Botellas de tinta pigmentada 70 ml/color','formato_ancho','Compacto; rollo y hojas sueltas'),
('plotter-epson-surecolor-t3170-24','Epson SureColor T3170','Epson','plotter',true,'{imprimir}',null,false,true,false,'24"',null,null,'A1/D en ~34 s',null,'formato_ancho','De escritorio; planos y pósteres'),
('plotter-epson-surecolor-t5470m-de-36','Epson SureColor T5470M','Epson','plotter',true,'{imprimir,copiar,escanear}',null,false,null,null,'36"',null,null,'A1/D en ~22 s',null,'formato_ancho','Con escáner integrado; pantalla táctil 4.3"'),
('plotter-hp-designjet-t2600dr-de-36','HP DesignJet T2600dr PS MFP','HP','plotter',true,'{imprimir,copiar,escanear}',null,false,null,null,'36"',null,null,null,null,'formato_ancho','Multifuncional PostScript; doble rollo; motor Adobe PDF'),
('plotter-canon-imageprograf-tm-340-tm340-36-pulgadas-6248c002','Canon imagePROGRAF TM-340','Canon','plotter',true,'{imprimir}',null,false,null,null,'36"',null,null,null,'Tinta pigmentada LUCIA TD (5 colores)','formato_ancho','Silencioso; impresión sin bordes; pantalla táctil 4.3"'),
('plotter-canon-imageprograf-tm-340-mfp-tm340mfp-36-pulgadas-6248c023aa','Canon imagePROGRAF TM-340 MFP','Canon','plotter',true,'{imprimir,copiar,escanear}',null,false,null,null,'36"',null,null,null,'Tinta pigmentada LUCIA TD (5 colores)','formato_ancho','Con escáner Lm36 integrado (600 dpi, hasta 36")'),
('ploter-epson-surecolor-t5170','Epson SureColor T5170','Epson','plotter',true,'{imprimir}',null,false,true,null,'36"',null,null,null,'Tintas UltraChrome XD2 (pigmento)','formato_ancho','Rollos hasta 36" + alimentador de hojas 11x17; verificación de boquillas')
on conflict (handle) do nothing;
