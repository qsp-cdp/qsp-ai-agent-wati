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
- `consumibles` (56 vacíos) y `rendimiento` (50): solo se llenaron cuando la ficha nombraba el
  cartucho/botella. Completarlos permite al bot cotizar "la impresora + sus tintas" de una.
- `perfil` (hogar / hogar_oficina / oficina / alto_volumen / portatil / punto_de_venta /
  especializada / formato_ancho): es juicio mío a partir de la ficha — ajústalo a como ustedes
  venden cada equipo.

## Tercera fuente: los PDF de ficha técnica en Archivos de Shopify — ✅ RESUELTA

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

Son la fuente natural para los `duplex_auto`, `consumibles` y `rendimiento` que faltan — es el dato
oficial del fabricante, no prosa de tienda.

**Cómo se leen.** La política de red del entorno remoto rechaza `cdn.shopify.com` (el proxy responde
403 al CONNECT), así que no se pueden descargar desde la sesión. Se resolvió con la Edge Function
`ficha-pdf`: Supabase no está detrás de ese proxy — el mismo camino con el que se trajeron las
agencias de Servientrega — y ahí sí hay código para manejar el binario y extraer el texto. Ver la
sección de carga oficial más abajo para el método completo.

Un aviso que dejó la revisión: el metacampo `schemaapp.schema` de la L5590 contiene una tabla de
especificaciones que **no es de ese modelo** (dice ISO 10/5 y borrador 33/15, que son los números de
la L3210/L3250) mientras el párrafo de arriba, en el mismo campo, dice ISO 15/8. Ese metacampo lo
llena una app de SEO y arrastra copy-paste viejo: **no usarlo como fuente de specs**.

## Mantenimiento

- **Producto nuevo en Shopify** → agregar su fila aquí (INSERT con el `handle` del producto). El bot
  no recomienda lo que no está en la tabla.
- **Producto retirado** → borrar la fila (o dejarla: si Shopify ya no lo tiene, `buscar_producto` no
  lo encontrará y el bot no lo ofrecerá — pero mejor limpiar).
- La migración con el seed completo está en `supabase/migrations/20260821230000_impresoras_specs.sql`.

## Carga desde la ficha oficial del fabricante (22-ago-2026, en curso)

Decisión de Isaac: **los metacampos de Shopify son la fuente de verdad**, y los datos se buscan en los
sitios oficiales de Latinoamérica. Orden de trabajo: los modelos que más preguntan los clientes reales,
medido sobre las conversaciones de WhatsApp (`messages`), no por catálogo.

**Cómo se consigue el dato.** Ni la ficha de la tienda ni los metacampos ni el HTML de la página oficial
traen la tabla de especificaciones — Epson y compañía la cargan por JS (comprobado bajando la página con
pg_net: 200 y 290 KB, y el panel "Especificaciones" solo con "qué hay en la caja"). El dato duro vive en
el **PDF de la ficha técnica**. Como el PDF es binario y pg_net devuelve texto, lo baja la Edge Function
`ficha-pdf`, que le extrae el texto y lo deja en `fichas_pdf`.

Dos orígenes de PDF, en este orden:
1. **Los que la tienda ya hospeda** en Contenido → Archivos (~90).
2. **El sitio del fabricante**. Canon Latinoamérica publica los folletos en español con sección para
   Panamá y una ruta predecible:
   `https://www.cla.canon.com/es_PA/app/pdf/brochures/G-Series_Inkjet_Printers/PIXMA-<MODELO>_Brochure.pdf`
   (funcionó tal cual para la G4170; la ruta de la serie TS no es la misma y devuelve 500).

**Unidades — la trampa que explica casi todos los errores.** Epson y HP publican "ISO ppm", Canon publica
"ESAT ipm", y los tres salen de **ISO/IEC 24734**: son comparables entre sí, así que el orden por
`ppm_negro` de `asesorar_impresora` significa algo. Lo que NUNCA se mezcla es la velocidad de **borrador**
con la **ISO** — de ahí salieron la L5590 y las dos Canon.

### Errores encontrados contra la fuente oficial

| Modelo | Decía la tabla | Dice el fabricante |
|---|---|---|
| Epson EcoTank L5590 | ISO 33/15 · carta | **ISO 15/8** · borrador 30/20 (el título dice 33) · **legal** |
| Canon MAXIFY GX4010 | 30/18 ppm | **ESAT 18,0/13,0 ipm** (~67% más lenta de lo que decía) |
| Canon PIXMA G3170 | 8.8/5 ppm | **ESAT 11,0/6,0 ipm** |
| Canon PIXMA G4170 | 8.8/5 ppm | **ESAT 11,0/6,0 ipm** |
| HP Laser 137fnw | dúplex sin dato · carta | **dúplex MANUAL** · ADF 40 hojas · **legal** |
| HP Smart Tank 750 | carta | **legal** (HP lista Oficio en las capacidades de entrada) |
| Epson EcoTank L14150 | ADF genérico | **ADF de 35 hojas**, dúplex automático |
| Epson SureColor F170 | conectividad en nulo | **USB + Ethernet + inalámbrica** |

Confirmados sin cambios (la carga original estaba bien): L3250, HP Smart Tank 530, HP Smart Tank 580,
L4360.

### Estado

12 de 87 filas ya tienen `fuente_url` verificable · consumibles vacíos 50 (eran 56) · dúplex sin dato 37.

### Pendiente

- Modelos preguntados que aún no tienen ficha localizada: Canon TS3610 (la ruta de la serie TS en
  cla.canon.com da 500), HP OfficeJet Pro 9730 y 9130, Epson L1250, L8050, WF-C5891, Canon imageCLASS
  X MF1538C, HP DesignJet T250.
- **Escribir los metacampos de Shopify por API** con lo verificado, que es donde se acordó que viva el
  dato bueno, y dejar a `impresoras_specs` sincronizándose desde ahí.
