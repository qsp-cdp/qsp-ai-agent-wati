# Diseño: la réplica del catálogo — "un mapa abierto, no un buscador de 5 items"

> Acordado con Isaac el 27-ago-2026 (conversación completa en la sesión de la auditoría de contexto).
> La frase que define el proyecto es suya: hoy el bot mira el catálogo por una mirilla de 5 resultados;
> esto le da el mapa. Estado: DISEÑO APROBADO, pendiente de construcción sobre la rama que despliega
> (`claude/supabase-agent-review-tvvg61`).

## 1. El problema (con incidentes que lo prueban)

El bot solo ve el catálogo a través de búsquedas que devuelven un top-5. Eso produce dos clases de
fallo documentadas:

- **El top-5 esconde la respuesta.** El combo Epson T544 x4 en la posición 6 — la clienta lo encontró
  sola en la web (v61). La HP OfficeJet Pro 9730 fuera del top-5 ante "impresora color 11x17"
  (27-ago): el bot declaró que no existía justo el producto que la clienta pedía, estando activo con
  5 unidades. La auditoría del 22-jul midió ~10 % de búsquedas en cero, 94 % falsos negativos.
- **Hay preguntas que una mirilla no puede responder**: "¿qué impresoras Epson manejan?" (la regla del
  prompt dice "da 1-2 ejemplos" porque el bot no puede ver la lista), "¿todas las tintas para la
  L3250?", "¿qué hay entre $200 y $400?", "¿cuántos plotters tienen?". Son preguntas de mapa.

Además, la mitad de los parches de búsqueda del proyecto existen para pelear contra un ranking que no
controlamos: `rerankearCombos` (v61), `tipoPedido` excluyente (v61.2), el candado
`algunTituloConCodigo` (v55). Con motor propio, cada uno se vuelve una cláusula SQL.

## 2. La decisión

**Replicar el catálogo de Shopify en Supabase** (existencia, títulos, tags, tipos, precios de
referencia, metacampos) con sincronía por webhook + reconciliación nocturna, y darle al bot **dos
herramientas** sobre cuatro **motores**. Las líneas rojas del proyecto se conservan intactas.

### Herramientas (lo que el modelo ve y elige — por INTENCIÓN)

| Herramienta | Intención | Qué devuelve |
|---|---|---|
| `buscar_producto` | "Sé QUÉ busco" (código, modelo, nombre) | El producto concreto con precio/ITBMS/stock EN VIVO. **Contrato exterior sin cambios** — es la herramienta de cotizar, la más curtida del sistema |
| `navegar_catalogo` (nueva) | "No sé cuál — explorar/elegir" | Filtros + CONTEOS + páginas sobre la réplica: "tenemos 14 Epson: 6 EcoTank, 3 láser…" |

`asesorar_impresora` **desaparece absorbida**: cuando `impresoras_specs` se convierta en columnas de
la réplica, "asesorar" es `navegar_catalogo(tipo=impresora, filtros…)`. Neto: mismas dos herramientas
de catálogo que hoy. `consultar_folleto` queda fuera de esta cuenta (lectura profunda de PDF, no
búsqueda); con specs como columnas, muchas de sus llamadas se vuelven innecesarias solas.

### Motores (lo que el CÓDIGO elige, determinista, según la forma de la consulta)

| Motor | Dónde vive | Qué resuelve mejor |
|---|---|---|
| Shopify Catalog MCP (semántico) | Shopify (`/api/ucp/mcp`) | Texto libre difuso: "tinta morada", "oficina básica" |
| Réplica FTS + `pg_trgm` (léxico) | Nuestro Postgres | Códigos y nombres exactos, typos reales ("tonner"), normalización 30"↔pulgadas |
| Réplica SQL (estructurado) | Nuestro Postgres | Filtros, conteos, tags de compatibilidad, atributos — el mapa |
| `pgvector` + embeddings (semántico propio) | Nuestro Postgres + API de embeddings de OpenAI (la misma key del STT) | FASE OPCIONAL: la cola de frases que nadie anticipó ("la rosada fuerte", "invitaciones gruesas") |

El modelo NUNCA elige motor. Elige intención; el código enruta por la forma de la consulta (¿trae
código? ¿trae "para [modelo]"? ¿trae atributo?) — la misma filosofía de la escalera actual, con
mejores peldaños. Como ambas herramientas terminan en el mismo catálogo, equivocarse de herramienta
DEGRADA (respuesta menos completa), nunca ROMPE (respuesta falsa).

### Las líneas rojas (NO se negocian)

1. **El precio replicado FILTRA y ORIENTA; jamás cotiza.** La cotización y el stock salen EN VIVO de
   `buscar_producto` (Admin GraphQL) para las finalistas, como hoy. La réplica decide QUÉ mostrar;
   Shopify en vivo decide CUÁNTO cuesta y CUÁNTAS hay. Nota explícita en la salida de
   `navegar_catalogo` + regla de prompt.
2. **El fallback nunca se rompe.** El MCP se conserva como motor semántico; `suggest.json` se
   conserva como último fallback hasta que el shadow autorice su retiro CON DATOS.
3. **Shadow-first.** Nada reemplaza al motor actual sin medirse contra él en tráfico real.

## 3. Esquema de la réplica

```sql
create table catalogo (
  id                    bigint primary key,          -- product_id de Shopify
  handle                text unique not null,
  sku                   text,                        -- regla vigente: MPN = SKU
  titulo                text not null,
  marca                 text,                        -- vendor
  tipo                  text,                        -- product_type
  tags                  text[] not null default '{}',-- la compatibilidad v34 vive aquí
  status                text not null,               -- active | draft | archived
  precio_usd            numeric(10,2),               -- SOLO filtrar/ordenar (línea roja 1)
  precio_comparado_usd  numeric(10,2),               -- detección de oferta (v64)
  descripcion           text,                        -- body limpio (limpiarHtml), alimenta el FTS
  variantes             jsonb,                       -- [{variant_id, sku, precio}] (futuro carrito)
  imagen_url            text,
  shopify_updated_at    timestamptz,                 -- updated_at del producto en Shopify
  sincronizado_at       timestamptz not null default now(),
  specs                 jsonb,                       -- FASE 3: absorbe impresoras_specs
                                                     -- {tamano_maximo, gramaje_max, tipos_papel,
                                                     --  ppm_negro, ppm_color, duplex, adf, wifi,
                                                     --  ethernet, color, funciones, perfil, nota}
  busq                  tsvector generated always as (
                          to_tsvector('spanish', unaccent(coalesce(titulo,'') || ' ' ||
                            array_to_string(tags,' ') || ' ' || coalesce(descripcion,'')))
                        ) stored,
  embedding             vector(1536)                 -- FASE 5, nullable
);
-- Índices: gin(busq) · gin(tags) · gin_trgm_ops(titulo) · btree(tipo, marca, status) ·
--          hnsw(embedding) cuando llegue la fase 5.
-- RLS on SIN policies (solo service_role) + GRANT manual — el modelo de la casa.
```

**Sinónimos** (aprendizaje del shadow): tabla `busqueda_sinonimos(termino, canonico)`. ⚠️ En Supabase
managed NO se pueden subir diccionarios de sinónimos al FTS (requieren archivos en el filesystem);
la expansión se hace en la Edge Function al armar el `tsquery` ("morada" → `morada | magenta`),
leyendo la tabla con caché en memoria. Igual de efectivo, editable por SQL, y la lista es NUESTRA.

## 4. Sincronía (las tres patas — ninguna es opcional)

1. **Webhooks de Shopify** `products/create` + `products/update` + `products/delete` → Edge Function
   nueva **`catalogo-sync`** (separada de `shopify-webhook` para no tocar el camino de pedidos), con
   verificación HMAC fail-closed idéntica y registro `hmac_rechazado` propio (el semáforo ya lo pinta
   🔴 desde el PR #4). Upsert por `id`; delete = `status='archivado_local'` (soft, auditable).
2. **Reconciliación nocturna** (pg_cron ~2 a.m.): recorrido completo por Admin GraphQL paginado →
   upsert todo + detectar huérfanos en ambas direcciones. Los webhooks SE PIERDEN — lección vivida —
   y la reconciliación es lo que convierte "casi sincronizado" en "sincronizado". Registra
   `catalogo_reconciliado {corregidos, huerfanos, ms}`.
3. **Frescura visible**: el resumen diario del watchdog muestra la edad de la última sincronización y
   cuántas filas corrigió la reconciliación. Si la reconciliación corrigió más de N (default 20) o la
   sync lleva >24 h muda → 🟡 con motivo `catalogo_sync`. Una réplica cuya frescura nadie vigila es
   la próxima auditoría.

## 5. Contrato de `navegar_catalogo`

```jsonc
// input — TODOS los campos con LISTA BLANCA de valores; un valor inválido SE DESCARTA
// (jamás se filtra por basura — lección del caso Camila 27-ago, input corrupto → 0 resultados)
{
  "texto": "…",                    // opcional: término libre (pasa por FTS+sinónimos)
  "tipo": "impresora|tinta|toner|papel|…",
  "marca": "…",
  "compatible_con": "L3250",       // lookup por tags de compatibilidad
  "precio_min": 200, "precio_max": 400,
  "atributos": { "formato_max": "11x17", "gramaje_min": 200, "color": true,
                 "multifuncional": true, "duplex": true, "adf": true, "wifi": true,
                 "perfil": "oficina" },
  "orden": "relevancia|precio_asc|precio_desc|ppm",
  "pagina": 1
}
// output
{
  "total": 23, "mostrando": 8, "pagina": 1, "hay_mas": true,
  "panorama": { "por_tipo": {"tinta_continua": 6, "laser": 3}, "por_marca": {"Epson": 14} },
  "resultados": [ { "titulo": "…", "handle": "…", "marca": "…", "tipo": "…",
                    "precio_referencia_usd": 395.00, "specs_clave": "11x17 · 22 ppm · dúplex" } ],
  "nota": "Precio de REFERENCIA para orientar. Cotiza las finalistas con buscar_producto
           (precio y stock en vivo). Si total > mostrando, dile al cliente cuántas hay."
}
```

Tope de 8 por página, conteos SIEMPRE (el mapa se mantiene abierto sin reventar tokens). Disponible
en MODO ASISTENCIA (read-only). Las reglas del prompt que hoy dicen "pregunta de categoría → 1-2
ejemplos" se reescriben a "navega y da el panorama real".

## 6. `buscar_producto`: escalera nueva por dentro, contrato intacto por fuera

```
0. Normalizaciones actuales (modelosEn, variantes de guion, juntarModelosEspaciados…)
1. NUEVO — réplica léxica: SKU/código exacto (unaccent + trgm + guiones);
   patrón "…para [modelo]" → lookup por tags (set COMPLETO de compatibles, el combo no se esconde)
2. Shopify MCP semántico (como hoy)
3. Candado v55/v60.1 verificando contra la RÉPLICA (reemplaza a suggest.json como verificador:
   más rápido, sin rate limits, más campos)
4. suggest.json como último fallback — hasta que el shadow autorice retirarlo
5. Enriquecimiento SIN CAMBIOS: ITBMS en código, stock vivo, ref_codes, tracking, oferta v64
```

## 7. El shadow (la fase que decide, no opina)

Secreto **`BUSQUEDA_REPLICA = off | shadow | codigos | primaria`** (default `off`; ADN de
COPILOT_MODE: deploy no-op, flip por secreto, rollback instantáneo).

En `shadow`: cada `buscar_producto` real dispara en `EdgeRuntime.waitUntil` (cero latencia al
cliente) la consulta equivalente a la réplica y registra
`busqueda_replica_shadow { consulta, clase, actual_n, actual_top3, replica_n, replica_top3,
replica_ms, gana }`, donde `clase ∈ {codigo, para_modelo, atributo, libre}`.

**Qué mide por clase** — y el criterio de flip:

| Clase | Pregunta | Flip a réplica-primaria si… |
|---|---|---|
| Códigos | ¿Iguala o supera a escalera+MCP? | Paridad de hits + 0 regresiones en las insignia |
| "para [modelo]" | ¿El tag trae el set completo donde el top-5 dejaba huecos? | Supera en completitud (caso combo v61) |
| Atributos | ¿Cuántos ceros históricos se vuelven hits? | Estrictamente mejor |
| Libre difuso | ¿Cuánto pierde sin semántica; cuánto recupera con sinónimos? | Probablemente NUNCA — franja del MCP (o fase 5) |

**Set de aceptación** (los casos insignia de la historia del proyecto, como fixture): TN830XL ·
PF-04 (la mochila) · papel bond 30" · 3253ci→TK-8337 · combo T544 x4 · "tinta para GX7010" (set
completo por tag) · **HP 9730 ante "11x17"** · "morada"→magenta (con sinónimo). Cada búsqueda que el
shadow registre con "los dos fallaron" alimenta la tabla de sinónimos: el shadow no solo mide,
entrena.

**Bonus estructural**: la réplica es una tabla → los casos insignia se vuelven **golden tests
ejecutables en PG local** (seed de ~20 productos reales + correr los motores léxico/SQL). La búsqueda
del bot, por primera vez, cae bajo la red de regresión de la casa.

## 8. Fases

| Fase | Qué | Criterio de salida |
|---|---|---|
| **0** (independiente, YA) | Validación de inputs de tools con lista blanca (el input corrupto del caso Camila) + los 3 guardrails de la auditoría de contexto (deícticos sobre media del asesor · lint de falsas capturas · PDF≠"esta impresora") | Golden locks en verde; el caso Camila re-jugado pasa |
| **1** | Tabla `catalogo` + `catalogo-sync` (webhooks HMAC) + reconciliación nocturna + frescura en el resumen | 1 semana con reconciliación corrigiendo ~0 filas |
| **2** | `navegar_catalogo` en vivo (aditiva — no toca `buscar_producto`) + reglas de prompt del panorama; `BUSQUEDA_REPLICA=shadow` para `buscar_producto` | Las preguntas de mapa responden; shadow acumulando |
| **3** | Fold-in de `impresoras_specs` → columna `specs` + gramaje/tipos_papel desde las fichas (la data ya extraída por specs_fuentes) | `asesorar_impresora` retirada; "¿imprime cartulina?" responde de columna |
| **4** | Flip por clase según el shadow (`codigos` → `primaria` si los datos lo dicen); retiro de suggest.json solo si el shadow lo autoriza | 2 semanas sin regresión en las insignia |
| **5** (opcional) | `pgvector` + embeddings (key OpenAI existente; ~$0.01 todo el catálogo) SI la cola de "libre difuso" perdida lo justifica | El % de ceros en clase libre baja a ~0 |

## 9. Riesgos y mitigación

- **Deriva de la réplica** — el riesgo definitorio. Mitigado ×3: webhook + reconciliación nocturna +
  frescura en el correo con semáforo. Sin las tres patas, no se enciende.
- **Doble fuente de specs durante la fase 3**: regla dura — al migrar, `impresoras_specs` se congela
  y se elimina; la réplica manda. Nunca dos tablas respondiendo lo mismo (la lección es_ack/cierres).
- **Caché de prompt (v35)**: agregar `navegar_catalogo` reescribe el caché → re-warm puntual,
  planificar con un deploy que ya lo reescriba.
- **Tokens**: `navegar_catalogo` devuelve conteos + 8 filas compactas, jamás listas largas.
- **Lo que este proyecto NO arregla**: las alucinaciones de identificación (deícticos, metadata de
  PDF) y las falsas capturas — esas van en la fase 0, que es independiente y más barata.

## 10. Métricas de éxito (medibles en el resumen semanal)

1. Los tres casos-clase re-jugados pasan: "¿tienen 11x17?" → la 9730 con conteo · "tinta para
   GX7010" → set completo con combo · "¿qué Epson tienen?" → panorama con números reales.
2. Tasa de búsquedas en cero < 2 % (baseline 22-jul: ~10 %).
3. Falsos "no lo tenemos" en el muestreo semanal: 0.
4. Frescura de la réplica: reconciliación nocturna corrigiendo ~0 filas en régimen.
