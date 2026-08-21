-- Agencias de Servientrega Panamá — fuente oficial: servientrega.com.pa/Agencias/GetAgencias
-- (extraído el 21-ago-2026 vía pg_net: la página lista las 45 agencias y el detalle de cada una
-- vive en /Agencias/UbicacionCs?ID_CDS=N con coordenadas exactas, teléfono y horario).
--
-- Reemplaza la lista HARDCODEADA de sucursales_interior en copilot-webhook (45 puntos con solo
-- nombre+teléfono): ahora hay dirección, teléfono, horario, coordenadas y link de mapa, y el TIPO
-- queda explícito — 'sucursal' (CDS, Centro de Soluciones propio de Servientrega) o 'agente_verde'
-- (comercio aliado autorizado donde LLEGA el pedido y el cliente lo retira). El bot los nombra así
-- para que el prospecto se familiarice con el punto de su sector.
--
-- provincia: derivada por punto-en-polígono contra limites_admin para las filas con coordenadas;
-- manual (según la dirección oficial) para las 8 sin pin. id_cds es el ID REAL de la fuente (la
-- numeración salta: 1-5,7-12,14-21,24,26-29,31-34,37-45,47-50,55-58) — sirve para re-sincronizar.
-- Nota fuente: el detalle del ID 57 (CDS Las Tablas) devuelve error 500 en el sitio de Servientrega;
-- su teléfono/horario quedan NULL hasta confirmar.

create table if not exists public.servientrega_agencias (
  id_cds int primary key,
  nombre text not null,
  tipo text not null check (tipo in ('sucursal','agente_verde')),
  direccion text,
  telefono text,
  horario text,
  provincia text,
  lat double precision,
  lng double precision,
  maps_url text generated always as (
    case when lat is not null and lng is not null
      then 'https://maps.google.com/?q=' || lat::text || ',' || lng::text end
  ) stored,
  fuente text not null default 'servientrega.com.pa/Agencias/GetAgencias',
  actualizado date not null default current_date
);

alter table public.servientrega_agencias enable row level security;
revoke all on public.servientrega_agencias from anon, authenticated;

comment on table public.servientrega_agencias is
  'Puntos de retiro de Servientrega PA (fuente oficial, 21-ago-2026). sucursal=CDS Centro de Soluciones; agente_verde=comercio aliado donde llega el pedido. Los lee sucursales_interior (copilot-webhook, service role).';

insert into public.servientrega_agencias (id_cds, nombre, tipo, direccion, telefono, horario, provincia, lat, lng) values
(1,'CDS Dirección Parque Lefevre','sucursal','Parque Lefevre, Vía José Agustín Arango, entre Super 99 del Balboa y Restaurante Bronco Steak','2133000','Lun–Vie 8:00 AM–7:00 PM · Sáb 8:00 AM–3:00 PM',null,9.024495249256125,-79.48551385025335),
(2,'CDS Plaza Aventura – El Dorado','sucursal','Centro Comercial Plaza Aventura, El Dorado, frente al Auto BAC','62069207','Lun–Vie 8:00 AM–5:30 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM',null,9.011857308636575,-79.53362763880376),
(3,'CDS Plaza Concordia – Vía España','sucursal','Vía España, Centro Comercial Plaza Concordia, local 126, frente al Rey','62527762','Lun–Vie 8:00 AM–5:00 PM (almuerzo 1–2) · Sáb 8:00 AM–1:00 PM',null,8.984825046675107,-79.5257937086814),
(4,'CDS Paitilla – Vía Italia','sucursal','Vía Italia, Edif. Posada del Rey, junto al Consulado de Colombia, frente al Hotel Plaza Paitilla Inn','63003052','Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM',null,8.974381251052055,-79.51581588668047),
(5,'CDS Logística Móvil','sucursal','Oficinas de Parque Lefevre; retiro y entrega a domicilio en todo Panamá','62069238','Lun–Vie 8:00 AM–5:30 PM · Sáb 8:00 AM–1:30 PM','Panamá',null,null),
(7,'CDS C.C. Los Andes Mall – San Miguelito','sucursal','Local No. 114, sótano 1, puerta 8 del estacionamiento','62821785','Lun–Vie 8:00 AM–5:00 PM (almuerzo 1–2) · Sáb 8:00 AM–1:00 PM',null,9.052235790521337,-79.50712073880965),
(8,'CDS Chitré','sucursal','Avenida Julio Arjona, frente a la estación de combustible Puma, a 35 metros de la antigua sucursal de Servientrega','62822831','Lun–Vie 8:00 AM–5:00 PM (almuerzo 12:30–1:30) · Sáb 8:00 AM–1:00 PM',null,7.960591879891633,-80.42769835178282),
(9,'CDS Santiago','sucursal','Plaza Tío Fabio, local 4, calle 15A, Av. Central Héctor Santa Coloma','62382594','Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM',null,8.097364132831949,-80.97270699997314),
(10,'CDS Aguadulce','sucursal','Av. Abelardo Herrera, detrás de Global Bank, diagonal a Inés Collection','62822609','Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM',null,8.244497493966215,-80.53860721647561),
(11,'CDS Penonomé','sucursal','Vía Interamericana, al lado del Super 99, Centro Comercial Iguana Mall, local E-15','62069222','Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM',null,8.507959433814376,-80.36185421005067),
(12,'CDS Chorrera','sucursal','Av. Las Américas, Ed. 5E, local 2, frente al MOP (Ministerio de Obras Públicas)','63003046','Lun–Vie 8:00 AM–5:00 PM (almuerzo 1–2) · Sáb 8:00 AM–1:00 PM',null,8.885915813321086,-79.77419111820711),
(14,'CDS Colón','sucursal','Calle 11, Servi Plaza Colón, frente al Mariano Bula','62069261','Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM',null,9.35747999071754,-79.89560561551035),
(15,'CDS Changuinola','sucursal','Finca 8, al lado de la universidad UDI, antiguas oficinas del PRD','62311466','Lun–Vie 8:00 AM–5:00 PM (almuerzo 1–2) · Sáb 8:00 AM–1:00 PM',null,9.435032244503777,-82.51911873329006),
(16,'CDS David Centro Calle 4ta','sucursal','Urbanización David Centro, calle 4, al frente de la bomba de 3 de Noviembre','62821798','Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM',null,8.424997848303168,-82.42696688668768),
(17,'CDS David El Rocío','sucursal','El Rocío, Vía Interamericana, frente a Cemex','62069219','Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM',null,8.442786842997528,-82.41624881921621),
(18,'AV Almirante (Soluciones y Más)','agente_verde','Bocas del Toro, Almirante, calle principal, Avenida Olmedo Sole, al lado de Rukel S.A.','+507 6500-3365 / 6471-8191','Lun–Vie 9:00 AM–6:00 PM · Sáb 9:00 AM–5:00 PM','Bocas del Toro',null,null),
(19,'AV Bocas Island Express (Isla Colón)','agente_verde','Bocas del Toro, Isla Colón, calle 1ra, Edif. Delfín, diagonal a la Policía','+507 760-8459','Lun–Vie 8:30 AM–4:30 PM · Sáb 8:30 AM–2:00 PM','Bocas del Toro',null,null),
(20,'AV Chiriquí Grande (Multiservicios Zamarci)','agente_verde','Chiriquí Grande, calle principal frente al MIDA, diagonal al gimnasio','+507 6285-0553 / 6236-3712','Lun–Sáb 8:00 AM–4:00 PM','Bocas del Toro',null,null),
(21,'AV Concepción Bugaba (Shop Express)','agente_verde','La Concepción, Bugaba, detrás de Supermercado Romero Plaza, diagonal a la agencia del Seguro Social','+507 788-3060 / 6733-7049 / 6629-3267','Lun–Vie 9:00 AM–5:30 PM · Sáb 9:00 AM–2:00 PM (Dom cerrado)',null,8.513914018790766,-82.61856367134556),
(24,'AV Río Sereno (Farmacia Don Andrés)','agente_verde','Renacimiento, Río Sereno, calle principal, frente a la escuela de Río Sereno, edificio Farmacia Don Andrés, planta baja','+507 6551-2690','Lun–Sáb 8 AM–2 PM y 4–6 PM',null,8.828736083436178,-82.86434895003991),
(26,'AV Volcán (Alfa Cell Tecnologic)','agente_verde','Bugaba, Volcán, calle principal al lado del Super Romero','+507 6557-9415 / 6115-3333','Lun–Sáb 9 AM–5 PM',null,8.775890939756986,-82.63901724620035),
(27,'AV Servicios y Utilería M&C','agente_verde','La Esperanza, vía Puerto Armuelles, a un costado del Mini Súper Alliza','+507 64540865','Lun–Sáb 8:30 AM–7:00 PM','Chiriquí',null,null),
(28,'AV Monchis Compras (Tolé)','agente_verde','El Alto Tolé, frente a la cancha del municipio, diagonal al juzgado','+507 62125251','Lun–Vie 8 AM–4 PM · Sáb 9 AM–1 PM',null,8.242975487971593,-81.67296781349427),
(29,'AV Guararé (Malala)','agente_verde','Guararé, frente a la Carretera Nacional, al lado de Cooperativa Nuevo Amanecer','+507 68763077 / 9945246','Lun–Vie 8 AM–5 PM · Sáb 9 AM–2 PM',null,7.81908424124571,-80.27883012348447),
(31,'AV Tonosí (Hostal Victoria Malala)','agente_verde','Los Santos, Tonosí, calle Justino Acevedo, casa al lado del hostal','+507 66432936','Lun–Vie 8 AM–3:30 PM · Sáb 8 AM–12 MD',null,7.406413319494987,-80.44087986311521),
(32,'AV Metetí Darién (Valeria''s Boutique)','agente_verde','Darién, Metetí, Piedra Candela, Plaza Mi Tierrita','+507 6168-5748','Lun–Sáb 9 AM–5 PM',null,8.49838220215483,-77.97092566561287),
(33,'AV Perugraff (Tortí)','agente_verde','Tortí de Chepo, Plaza de la Carne, local #7','69797445','Lun–Sáb 9 AM–6 PM','Panamá',null,null),
(34,'AV Rapid Service Barú','agente_verde','Puerto Armuelles, en la entrada del hospital, frente al antiguo instituto de idiomas','+507 6585-2214','Lun–Vie 8 AM–4 PM · Sáb 9 AM–1 PM',null,8.275528,-82.861389),
(37,'AV TSB Cargo San Francisco','agente_verde','Calle Andrés Mojica, casa 20, diagonal a Cachapas Don Luis, Vía Porras, San Francisco','3736590 / +507 6720-9891','Lun–Vie 8 AM–5 PM · Sáb 9 AM–2 PM · Dom 10 AM–2 PM',null,8.995090804102414,-79.49988760997516),
(38,'AV Jece Soluciones','agente_verde','PH Oceanía Business Plaza, Torre 1000, piso 49, oficina I-1','+507 308-6977 / 62132930 / 6201-7543','Lun–Vie 8 AM–5 PM · Sáb 8 AM–12 PM',null,8.980844058780422,-79.50925322290253),
(39,'AV Cargo Box Express (Hato Pintado)','agente_verde','PH Centro Comercial y Profesional San Fernando, subiendo la rampa, estacionamiento nivel 1, frente a Cochez, local 16','+507 67768244 / 2754225','Lun–Vie 9 AM–6 PM · Sáb 9 AM–2 PM',null,9.004223,-79.515375),
(40,'AV Mr. Mail – El Dorado','agente_verde','El Dorado, Las Mercedes, diagonal al parque de Las Mercedes, casa 47, detrás del restaurante Fridays del Dorado','+507 6607-2164','Lun–Vie 10 AM–5:30 PM · Sáb 10 AM–1:30 PM',null,9.00538767399557,-79.53821048848863),
(41,'AV Colón Cristóbal Este (Service Freight Jare)','agente_verde','Altos de los Lagos, antes del hospital nuevo, a mano derecha','+507 62996136 / 69250730','Lun–Sáb 8 AM–5 PM','Colón',null,null),
(42,'AV Colón San Juan, El 20 (Curiosidades Thamara)','agente_verde','Entrada principal de El 20, San Juan, Colón, diagonal a Superpisos','+507 63907939','Lun–Vie 9 AM–6 PM · Sáb 9 AM–5 PM',null,9.232981297419105,-79.62942267453738),
(43,'AV PtyBuy Express Arraiján','agente_verde','Plaza Vista Alegre, local 6, a un costado de Cochez','6780-9187','Lun–Vie 10 AM–6 PM · Sáb 10 AM–3 PM',null,8.928095570371775,-79.70481723511784),
(44,'AV Kabak Store Coronado','agente_verde','Plaza The Village Coronado, frente al Macetazo de Coronado','+507 66367979 / 349-6301','Lun–Vie 9:30 AM–6 PM · Sáb 9 AM–3 PM',null,8.544162498914222,-79.91334188668618),
(45,'AV Mr Mail – Vía Argentina','agente_verde','Vía Argentina, del lado de la Universidad de Panamá, planta baja del Edificio Tang, frente a la estación de combustible Puma','+507 6672-6745','Lun–Vie 10 AM–5:30 PM · Sáb 9 AM–1 PM',null,8.986776226550045,-79.53150947496216),
(47,'AV Compucel Chepo','agente_verde','Chepo cabecera, calle Vía Crematorio, casa 82, Urb. Santa Isabel, frente al Hospital de Chepo','+507 62223298','Lun–Vie 10 AM–6 PM · Sáb 9 AM–2 PM',null,9.161341209228809,-79.09700744432625),
(48,'AV E-Box Express (Paso Canoas)','agente_verde','Paso Canoas frontera, por la entrada de los bomberos, Edificio Doña Fela, local 2, planta baja','+507 6924-9023','Lun–Vie 10 AM–6 PM · Sáb 9 AM–2 PM',null,8.533905132302957,-82.83745621975883),
(49,'AV Shop Box Don Bosco','agente_verde','Plaza detrás de Plaza Tocumen, planta baja, en Plaza de Soluciones Industriales','+507 65007378 / 66150948','Lun–Vie 10 AM–6 PM · Sáb 9 AM–2 PM',null,9.059929367743411,-79.42237385451824),
(50,'AV Western Union Chorrera Guadalupe','agente_verde','Panamá Oeste, La Chorrera, en frente del McDonalds de Plaza La Mitra','+507 6133-4883','Lun–Vie 8 AM–5 PM · Sáb 8 AM–1 PM',null,8.862033968267617,-79.79304460642798),
(55,'AV Nuevo Tocumen Shopline','agente_verde','Ciudad de Panamá, Vía Interamericana, Plaza Nuevo Tocumen','+507 64373481','Lun–Vie 10 AM–6 PM · Sáb 9 AM–2 PM',null,9.101414159966303,-79.35568810461507),
(56,'CDS Mañanitas','sucursal','Mañanitas, Plaza Los Pinos, local 5, al lado de la Lotería Nacional','62034204','Lun–Vie 8:00 AM–5:00 PM · Sáb 8:00 AM–1:00 PM',null,9.083279404393581,-79.39757514474607),
(57,'CDS Las Tablas','sucursal','Calle Joaquín Pablo Franco, frente a La Paulina Café',null,null,'Los Santos',null,null),
(58,'AV El Valle de Antón (Valle Express)','agente_verde','Paseo El Valle, local Valle Express, frente a la vía principal','6983-8292','Lun–Vie 8 AM–5 PM · Sáb 8 AM–1 PM','Coclé',null,null)
on conflict (id_cds) do nothing;

-- Provincia por punto-en-polígono para las filas con coordenadas (los polígonos de limites_admin ya
-- traen la provincia; las 8 filas sin pin quedaron con provincia manual arriba).
-- nivel=1 son los polígonos de PROVINCIA y su nombre va en `nombre` (la columna `provincia` de
-- limites_admin solo está poblada en algunos corregimientos de nivel 3).
update public.servientrega_agencias a
set provincia = la.nombre
from public.limites_admin la
where la.nivel = 1 and a.lat is not null and a.provincia is null
  and ST_Contains(la.geom, ST_SetSRID(ST_MakePoint(a.lng, a.lat), 4326));
