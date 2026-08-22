# Base de conocimiento de impresoras — guía de revisión

Creada el 21-ago-2026 (v105). La tabla **`impresoras_specs`** tiene los 87 modelos activos del
catálogo con sus specs estructurados: categoría, funciones, dúplex, ADF, Wi-Fi/Ethernet, tamaño
máximo, velocidad, rendimiento, consumibles y perfil de uso. El bot la consulta con la herramienta
`asesorar_impresora` cuando un cliente pide una recomendación ("¿qué impresora me conviene para mi
oficina?") — y el precio/stock SIEMPRE lo confirma aparte con `buscar_producto` (en esta tabla no
hay precios a propósito).

## De dónde salieron los datos — y por qué hay que revisarlos

Todo se extrajo de las **fichas de los productos en Shopify** (21-ago-2026). Regla estricta: si la
ficha no decía un dato, quedó **NULL** (el bot dice "ese dato se lo confirma un asesor" en vez de
inventarlo). Aun así, la extracción fue automática y **toda fila nace con `verificado = false`**:
conviene que un humano que conozca los equipos les dé una pasada.

**Cómo revisar sin SQL**: Supabase → Table Editor → `impresoras_specs`. Corrige lo que esté mal
directamente en la celda y marca `verificado` ✔ en las filas que ya repasaste. No hay apuro: el bot
ya funciona con las filas sin verificar (presenta los specs "según ficha").

## Errores de la TIENDA encontrados durante la extracción — ✅ RESUELTOS (22-ago-2026)

Las tres fichas fueron corregidas en Shopify y la tabla se re-sincronizó desde ellas
(migración `20260822170000_impresoras_specs_tres_fichas_corregidas`).

1. **Brother SP-1 (sublimación)** — tenía pegada la descripción de la Epson SureColor F170.
   Ya es la real: Artspira, cartuchos CMYK de 47 ml, prensa de calor aparte. *Sigue sin dato el
   `tamano_maximo`: la ficha nueva no menciona el tamaño de papel, y se prefiere el nulo a deducirlo.*
2. **Epson LQ-590II (matriz)** — la ficha estaba vacía. Ya trae 24 agujas, 584 cps a 12 cpi,
   formularios de hasta 7 partes, USB + paralelo. Sin ppm a propósito: una matricial se mide en
   caracteres por segundo, igual que el resto de su categoría aquí.
3. **Epson EcoTank L5590** — el error era **peor que el conflicto 15/20** que se había anotado.
   La fila decía `33 ppm negro / 15 ppm color`, y eso no es un par: **33 es la velocidad en borrador
   y 15 es la velocidad ISO en NEGRO metida en la columna de color**. Las demás EcoTank de la tabla
   están todas en ISO (L3250 10/5, L4360 15/8, L6370 18/9), así que la L5590 se comparaba con sus
   hermanas usando otra vara — y como `asesorar_impresora` ordena por `ppm_negro`, el bot la habría
   presentado como **más del doble de rápida de lo que es**. Corregida a su ISO real, 15/8; la
   velocidad de borrador (33/20, la que anuncia el título) quedó en las notas.

> **Lección para futuras cargas:** al leer una ficha, comprobar que los dos ppm sean del MISMO
> estándar. Epson publica borrador e ISO en el mismo párrafo y es fácil cruzarlos.

## Campos que más merecen ojo humano

- `duplex_auto` y `adf` en **NULL**: la ficha no lo decía. Son los dos datos que más pesan al
  recomendar para oficina — completarlos vale oro.
- `consumibles`: solo se llenó cuando la ficha nombraba el cartucho/botella (23 de 87). Completarlo
  permite al bot cotizar "la impresora + sus tintas" de una.
- `perfil` (hogar / hogar_oficina / oficina / alto_volumen / portatil / punto_de_venta /
  especializada / formato_ancho): es juicio mío a partir de la ficha — ajústalo a como ustedes
  venden cada equipo.

## Mantenimiento

- **Producto nuevo en Shopify** → agregar su fila aquí (INSERT con el `handle` del producto). El bot
  no recomienda lo que no está en la tabla.
- **Producto retirado** → borrar la fila (o dejarla: si Shopify ya no lo tiene, `buscar_producto` no
  lo encontrará y el bot no lo ofrecerá — pero mejor limpiar).
- La migración con el seed completo está en `supabase/migrations/20260821230000_impresoras_specs.sql`.
