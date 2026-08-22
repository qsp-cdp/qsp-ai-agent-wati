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

## Segunda fuente encontrada: los metacampos estructurados de Shopify (22-ago-2026)

Los productos de impresora traen metacampos de la **taxonomía estándar de Shopify**, ya poblados:

| Metacampo | Contenido | Alimenta |
|---|---|---|
| `shopify.printer-copier-specialized-features` | ADF, Impresión dúplex, Impresión sin bordes, Almacenamiento de papel, Soporte de impresión móvil | `adf`, `duplex_auto` |
| `shopify.compatible-paper-size` | Carta, Legal, A4, 11x17, 13x19, 4x6… | `tamano_maximo` |
| `shopify.connection-type` | USB, Ethernet, Wi-Fi | `wifi`, `ethernet` |
| `shopify.printer-functions` | Impresión, Copiar, Escaneo, Fax, Multifuncional | `funciones` |
| `shopify.print-technology` | Láser, Inyección de tinta | `categoria` |

Son datos ya estructurados — no hay que interpretar prosa. **Pero están incompletos**, y de ahí sale
la regla con la que se cargan: *solo se escribe el TRUE cuando el metacampo lo afirma; la ausencia
NO se toma como "no tiene"*. Caso comprobado: la HP LaserJet Pro MFP 3103fdw sí tiene ADF y su
metacampo solo lista "Almacenamiento de papel". Deducir el `false` desde el silencio haría que
`asesorar_impresora` descartara modelos válidos. Mismo principio que la regla del barrio ambiguo.

Al cruzarlos con la tabla **no apareció ni una contradicción** con lo extraído de las fichas — buena
señal sobre la carga original. Rellenaron 5 `adf` y 2 `duplex_auto`.

## Campos que más merecen ojo humano

Estado al 22-ago-2026 (de 87 filas): `adf` 2 nulos · `duplex_auto` 38 · `consumibles` 56 vacíos ·
`rendimiento` 50 nulos.

- `duplex_auto` en **NULL** (38): ni la ficha ni el metacampo lo dicen. Es el dato que más pesa al
  recomendar para oficina. Está en los PDF de ficha técnica (ver abajo) y muchas veces en el sufijo
  del modelo (`dw`/`dn`/`fdw` suelen implicar dúplex), pero eso último es deducción, no dato.
- `consumibles` (56) y `rendimiento` (50): permiten cotizar "la impresora + sus tintas" de una.
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

## Tercera fuente: los PDF de ficha técnica en Archivos de Shopify (pendiente)

La tienda guarda ~90 PDF de fichas técnicas oficiales del fabricante en **Contenido → Archivos**
(no en metacampos del producto: se revisaron los metacampos de varios modelos y ninguno referencia
un PDF; tampoco existe una definición de metacampo de tipo archivo para productos).

Muchos son de modelos ya descontinuados (2020-2022), pero hay coincidencias con el catálogo actual:
`ECOTANK_L3250`, `ECOTANK_L1210`, `ECOTANK_L4260`, `ECOTANK_L8180`, `L14150`, `WF-C5710`,
`Folleto-EcoTank-L5590-v2`, `HP_SMART_TANK_750`, `MULTIFUNCIONAL-HP-SMART-TANK-580`, `G7010`,
`GX7010`, `MAXIFY-GX4010`, `G3160`, `G4110`, `PIXMA-G3170_Brochure`, `HP_9020`,
`HP_OFFICEJET_PRO_7740`, `LEXMARK_MX331ADN`, `LEXMARK_MX622ADHE`, `CANON_MF644CDW`,
`Canon_imageCLASS_MF455dw_Brochure_ES`, `CL_MFC-L6900DW`, `PE_MFC-T4500DW`, `Brother_MFCT920DW`,
`Ficha-tecnica-Epson-SureColor-F170`, `Brother_QL-800-Ficha`, `imagePROGRAF-TC-20_Brochure`…

Son la fuente natural para los 38 `duplex_auto`, los 56 `consumibles` y los 50 `rendimiento` que
faltan — es el dato oficial del fabricante, no prosa de tienda.

**Bloqueo actual:** la política de red del entorno remoto rechaza `cdn.shopify.com`
(el proxy responde 403 al CONNECT), así que los PDF no se pueden descargar desde la sesión.
Dos caminos:

1. **Permitir `cdn.shopify.com`** en la política de red del entorno (claude.ai/code → entorno).
   Es el camino corto: se descargan, se leen y se cargan los campos.
2. **Una Edge Function en Supabase** que baje el PDF y extraiga el texto. Supabase no está detrás de
   ese proxy — es el mismo truco con el que se trajeron las agencias de Servientrega. Cuesta más
   (hay que meter un extractor de PDF en Deno) pero queda como herramienta reutilizable.

Un aviso que dejó la revisión: el metacampo `schemaapp.schema` de la L5590 contiene una tabla de
especificaciones que **no es de ese modelo** (dice ISO 10/5 y borrador 33/15, que son los números de
la L3210/L3250) mientras el párrafo de arriba, en el mismo campo, dice ISO 15/8. Ese metacampo lo
llena una app de SEO y arrastra copy-paste viejo: **no usarlo como fuente de specs**.
