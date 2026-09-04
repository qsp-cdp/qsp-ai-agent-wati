# Réplica del catálogo — fase 3: la réplica responde primero cuando hay código (04-sep-2026)

> Fase 2 (motor corregido + sombra) corrió del 28-ago al 04-sep. Esta fase la cablea al camino real
> detrás de `BUSQUEDA_REPLICA=codigos`. El texto libre sigue en Shopify.

## Lo que dijo la sombra (7 días, 235 comparaciones)

| Clase | Consultas | Ambos hallan | Solo réplica | Solo motor actual | Agotados que solo la réplica ve |
|---|---|---|---|---|---|
| código de modelo | 205 | 180 | 0 | 23 | 58 |
| texto libre | 28 | 26 | 1 | 1 | 71 |
| atributo | 2 | 2 | 0 | 0 | 3 |

La columna decisiva es la última. El caso que lo resume ocurrió el 04-sep a las 09:04: el cliente
preguntó por la caja de mantenimiento de su L5590; el motor en vivo devolvió la T04D1 (no le sirve) y
el bot terminó ofreciéndola; la réplica, en sombra, devolvió «Caja de Mantenimiento Epson C9344 para
L3560 y L5590», agotada, que es lo que un asesor tuvo que explicar a mano seis minutos después.

De las 23 "pérdidas" con código, revisadas una por una, la mayoría son virtudes: códigos que no existen
("HP 205A", "HP 88A", "Canon CL-546", "GT51") donde el motor semántico devolvió el vecino equivocado y
la réplica calló (regla v60.1). Quedaban tres pérdidas reales, las tres de *match*, y las arregla la
RPC v3 (`20260904210000_buscar_catalogo_v3.sql`):

| Caso | Por qué fallaba | Arreglo |
|---|---|---|
| `PFI-050BK` | el código completo solo vive en el **handle** | el handle entra al match |
| `toner canon MF1238` | el T08 no tiene tags; la compatibilidad está en la **descripción** | descripción como último criterio de match y de orden |
| `toner HP M283fdw` | el tag dice «M283»; el cliente escribe el modelo completo | un token del tag (≥4, con dígito) que sea **prefijo** del código pedido cuenta |

Verificado contra producción después de aplicar: los tres se encuentran, la L5590 da la C9344, los
códigos inexistentes siguen dando vacío, y los 20 casos del banco de la fase 2 no cambian.

## Cómo funciona el modo `codigos` (v128)

En `buscarProducto`, **antes** del MCP:

1. Solo entra si la consulta trae un código de modelo (`modelosEn`). "Grapas" o "algo para fotos" no
   tocan la réplica.
2. Llama a `buscar_catalogo` y se queda con los productos `active` (un borrador no se le ofrece a un
   cliente). Aplica el tipo que nombró el cliente (v61.2) sin dejar la lista vacía.
3. **Precio, precio de antes y stock salen en vivo de Shopify Admin**, en el mismo viaje que la foto
   (`inventarioShopify` con `precios`). La réplica decide *qué*; Admin, *cuánto* y *cuántos*.
   Cantidad 0 → "❌ sin stock" (lo tenemos, está agotado). Sin dato de Admin → "🔎 un asesor verifica",
   nunca "sin stock" por un hipo.
4. Re-ranquea combos igual que el MCP y entra a `enriquecer` como coincidencia exacta.
5. Vacío o fallo → sigue el camino de siempre (MCP → suggest.json). Nada se rompe.

Telemetría: `busqueda_replica_primaria` (n, vía, agotados, top3, ms), `busqueda_replica_vacia`,
`busqueda_replica_fallo`. La sombra (`busqueda_replica_shadow`) sigue midiendo el texto libre.

## Encendido

```
BUSQUEDA_REPLICA=codigos
```

Sin redeploy. Rollback: volver a `shadow`.

## Lo que sigue

- **`primaria`** (réplica también para texto libre) NO se recomienda con estos datos: "grapas" cayó
  al FTS y devolvió laptops y UPS. El buscador semántico de Shopify sigue ganando ahí.
- **Carrito**: el mismo protocolo UCP de Shopify expone `update_cart` y el enlace de checkout. La
  réplica guarda los `variant_id` que hacen falta. Es la fase siguiente, una vez asentado el guard de
  precio (v126) y este flip.
