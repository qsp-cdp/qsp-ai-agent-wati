# Rescate de código productivo sin fuente en git — 2026-08-27

La auditoría integral del 27-ago encontró que estas funciones estaban **ACTIVAS en producción sin
fuente en ninguna rama** (se desplegaron a mano por CLI desde un directorio local que ya no existe).
Aquí queda la copia EXACTA de lo desplegado, bajada por la API de management de Supabase el 27-ago.
Si alguna vez hay que re-desplegarlas o modificarlas, se parte de ESTOS archivos — no hay otra copia.

| Función | Deploy | Última actualización | Estado | Qué es |
|---|---|---|---|---|
| `contacts-lookup` | v60 | 2026-08-14 | **PRODUCTIVA** — la llama el flujo de WATI (validación previa a la captura de dirección; el mensaje de cierre del flujo pega `envio_texto` tal cual) | v2 con SIN_PIN, zona/tarifa resuelta y `envio_texto`; la rama vieja solo tenía la v1 de 22 líneas |
| `cotizador` | v32 | 2026-08-07 | **PRODUCTIVA** — la llama la página oculta `quickservicepanama.com/pages/cotizador` (cotizador de envíos para asesores; clave en `store_facts.cotizador_key`) | Consulta `resolver_tarifa_v2` con telemetría propia |
| `wati-classify` | v35 | 2026-08-19 | Inactiva hoy (0 invocaciones en 24 h; único caller conocido: `wati-verify`) pero es el clasificador LLM de direcciones v4 — trabajo valioso que no existía en git | Extractor LLM + escalones texto-primero / corregimiento-respaldo |

Notas de fidelidad:

- `contacts-lookup/` incluye el `_shared/` **congelado** con el que fue empaquetada (difiere del
  `_shared/` actual de la rama nueva). Para re-desplegar byte-fiel hay que usar ESTAS copias, no las
  del árbol vivo.
- `cotizador` y `wati-classify` son de un solo archivo (no importan `_shared`).
- Hashes de los bundles desplegados al momento del rescate (`ezbr_sha256` de la API):
  - contacts-lookup: `ed44b00c296fedbf1a0db931995250a161a8776bb0e004dfb68444dd7dee9474`
  - cotizador: `49b6948f55ede172fc706945a66f98e19246300b5777512cb9f321c986143a9a`
  - wati-classify: `121d7fb0280c23db58c1d730b49f92f5b3947bff45644263ecacff605cdbd51f`

Lo correcto a mediano plazo es que estas fuentes vivan en la rama que despliega
(`claude/supabase-agent-review-tvvg61`, bajo `supabase/functions/`) para que el CI las cubra; este
directorio es el respaldo hasta que eso ocurra. Detalle completo en
`docs/auditoria-2026-08-27/frente-b-puente.md` (tabla de funciones huérfanas).
