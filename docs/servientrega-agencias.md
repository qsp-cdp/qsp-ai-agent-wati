# Agencias de Servientrega — fuente de datos y sincronización

Desde v106 los puntos de retiro del interior salen de la tabla **`servientrega_agencias`**
(45 puntos), extraída de la **fuente oficial**: https://servientrega.com.pa/Agencias/GetAgencias
(21-ago-2026). Antes vivían hardcodeados en `copilot-webhook` con solo nombre y teléfono; ahora cada
punto tiene **tipo, dirección, teléfono, horario, provincia y link de mapa**, y la lista vieja quedó
como respaldo si la tabla no responde.

## Los dos tipos de punto (y cómo los nombra el bot)

| Prefijo | Tipo | Qué es | Cómo lo dice el bot |
|---|---|---|---|
| CDS | `sucursal` | Centro de Soluciones: punto PROPIO de Servientrega | "la Sucursal de Servientrega de Chitré" |
| AV | `agente_verde` | Comercio aliado autorizado: ahí LLEGA el pedido y el cliente lo retira con cédula | "el Agente Verde Valle Express, en Paseo El Valle" |

La regla del prompt prohíbe soltar las siglas "CDS"/"AV" sin explicarlas, y pide nombrar el punto con
su dirección y mapa **para que el prospecto reconozca el sector al que llegaría su pedido**. Si el
cliente prefiere **puerta a puerta**, el bot ofrece esa vía con su precio (claves `tarifa_interior` /
`plazo_interior` de store_facts) — las dos opciones siempre.

## Cómo se extrajo (y cómo re-sincronizar)

El sitio no expone un JSON: `/Agencias/GetAgencias` devuelve la página con la tabla (nombre, tipo,
dirección) y el detalle de cada punto vive en `/Agencias/UbicacionCs?ID_CDS=N` (iframe de Google Maps
con las coordenadas + teléfono + horario). Los `ID_CDS` reales saltan números:
`1-5, 7-12, 14-21, 24, 26-29, 31-34, 37-45, 47-50, 55-58`.

Para re-sincronizar (cada 2-3 meses, o si Servientrega abre/cierra puntos):
1. `select net.http_get('https://servientrega.com.pa/Agencias/GetAgencias')` y comparar el conteo de
   `GeneraDetalle(` y los IDs contra la tabla (el proxy del entorno de desarrollo bloquea el dominio;
   pg_net desde Supabase sí llega).
2. Para IDs nuevos: `net.http_get('.../Agencias/UbicacionCs?ID_CDS=N')` y extraer `maps?q=lat,lng`,
   Teléfono y Horarios del HTML.
3. UPSERT en `servientrega_agencias` + derivar provincia con `limites_admin` (nivel=1, campo `nombre`):
   ver el UPDATE al final de `supabase/migrations/20260822000000_servientrega_agencias.sql`.

## Pendientes conocidos

- **CDS Las Tablas (ID 57)**: su detalle devuelve error 500 en el propio sitio de Servientrega —
  teléfono y horario quedaron NULL (el bot dice "por confirmar con un asesor").
- **8 puntos sin coordenadas** en la fuente (Logística Móvil, Almirante, Isla Colón, Chiriquí Grande,
  M&C, Perugraff, Cristóbal Este, El Valle): sin link de mapa por ahora; provincia asignada a mano.
- **Integración futura**: enviar los datos de dirección del cliente a Servientrega al despachar
  (generar la guía desde el sistema). pg_net ya demostró que Supabase alcanza su dominio; falta
  explorar si exponen API de guías o se coordina con ellos.
