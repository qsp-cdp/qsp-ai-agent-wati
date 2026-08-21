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

## Errores de la TIENDA encontrados durante la extracción (corregir en Shopify)

1. **Brother SP-1 (sublimación)**: su ficha tiene pegada la descripción de la **Epson SureColor
   F170** — un copy-paste. La fila quedó casi vacía a propósito.
2. **Epson LQ-590II (matriz)**: la ficha está vacía (solo el título). Sin datos que extraer.
3. **Epson EcoTank L5590**: el título dice **15 ppm color** y el cuerpo dice **20 ppm** — la fila
   quedó con 15 (el título) y la nota del conflicto. Confirmar cuál es y unificar la ficha.

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
