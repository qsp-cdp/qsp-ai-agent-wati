# Funciones desplegadas que NO están en este repositorio

Hallazgo de la revisión integral (21-ago-2026): el proyecto de Supabase tiene **22 Edge Functions
activas** y solo **8 viven en `supabase/functions/`**. Las demás se subieron a mano en su momento, así
que **no están versionadas**: si alguien las borra o se pierden, no hay copia. Este directorio existe
para respaldar las que se retiren y para dejar constancia del resto.

Ninguno de estos archivos se despliega: viven fuera de `supabase/functions/` a propósito, porque el
workflow de CI publica todo directorio que encuentre ahí.

## En el repo (se despliegan solas por CI)

`copilot-webhook` · `geo-fallback` · `ph-loader` · `shipday-status` · `shopify-webhook` · `watchdog` ·
`wati-order` · `_shared`

## Fuera del repo, ACTIVAS y en uso

| Función | Qué hace | Notas |
|---|---|---|
| `cotizador` | cotizador web | consume `store_facts.cotizador_key` — por eso esa llave sigue en la tabla (v88 solo la esconde del modelo) |
| `contacts-lookup` | consulta de contactos | |
| `reengage-expired` | re-enganche de fin de semana | la dispara el cron `reengage-lunes-9am-pa` |
| `wati-mirror` | espejo EN LOTE de la libreta a los atributos de WATI | manual; de aquí salió el formato de `envio_resumen`/`envio_estado` que el copiloto adoptó en v89 |
| `wati-classify` | clasificador de direcciones (LLM + RPC) | **solo lectura**, no escribe nada |
| `wati-verify`, `wati-attr-audit` | verificación y auditoría de atributos | |

## Fuera del repo, herramientas de diagnóstico o migración ya cumplidas

`tookan-probe` · `tookan-backfill` · `geo-loader` · `shipday-probe`

Se usaron para migrar desde Tookan y para cargar los polígonos. Candidatas a retirar; antes de tocarlas
conviene respaldarlas aquí, igual que se hizo con `wati-address`.

## Retiradas (respaldadas aquí)

| Función | Archivo | Fecha | Motivo |
|---|---|---|---|
| `wati-address` | `wati-address.index.ts` | 21-ago-2026 | duplicaba la captura del copiloto con otros nombres de atributo (dos direcciones y dos pines en la misma ficha) y con `es_correccion` borraba el pin y la referencia recién capturados. 0 llamadas en 24 h y el negocio confirmó que su chatbot ya no se usa |

Las retiradas quedan desplegadas como un stub que responde **410 Gone** —no 404— para que, si algún
flujo viejo las sigue llamando, en sus logs quede claro que existían y se retiraron a propósito, con
el nombre del reemplazo.

## Para restaurar una función retirada

Copiar el archivo de respaldo a `supabase/functions/<nombre>/index.ts` y empujar: el CI la despliega.
Los secretos que usaban siguen configurados en el proyecto.

## Cómo rescatar el código de una función que no está en el repo

Con el MCP de Supabase: `get_edge_function` con el `function_slug`. Devuelve el `index.ts` y la copia
de `_shared/` con la que se desplegó — útil para ver con qué versión de los helpers estaba corriendo.
