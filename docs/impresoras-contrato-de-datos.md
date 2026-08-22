# Contrato de datos de impresoras — cómo mantener la consistencia

Escrito el 22-ago-2026, después de descubrir a mano que la tabla tenía velocidades de dos estándares
mezcladas, fichas con la descripción de otro modelo y campos vacíos. Este documento existe para que no
haya que volver a descubrirlo a mano.

## Fuente de verdad

**Los metacampos de Shopify.** La tabla `impresoras_specs` es un espejo que alimenta al bot. El dato se
corrige en Shopify y baja; nunca al revés, para que no haya dos versiones.

Y por encima de Shopify está **la ficha oficial del fabricante**: es la única autoridad sobre un spec.
Ni el título del producto, ni la descripción que escribió alguien, ni un metacampo que llenó una app.

## Las cuatro reglas

**1. Velocidad: siempre ISO, nunca borrador.**
Epson y HP publican "ISO ppm"; Canon publica "ESAT ipm". Los tres salen de la norma **ISO/IEC 24734**,
así que son comparables entre sí y el orden por velocidad significa algo. La velocidad de **borrador**
es siempre más alta y NO va en las columnas `ppm_negro`/`ppm_color` — va en las notas si vale la pena.
Los fabricantes publican ambas en el mismo párrafo; ahí está la trampa.

*De aquí salieron todos los errores encontrados: L5590, G3170, G4170, GX4010.*

**2. Solo se afirma lo que la fuente dice.**
Si la ficha no menciona el ADF, `adf` queda en **NULL**, no en `false`. Comprobado: la HP LaserJet Pro
MFP 3103fdw sí tiene ADF y su metacampo solo lista "Almacenamiento de papel". Deducir el "no" desde el
silencio hace que el bot descarte modelos válidos cuando el cliente pide alimentador automático.

Un nulo dice "no sé" y es cierto. Un dato deducido dice una mentira con la misma cara que un dato bueno.

**3. Todo dato lleva su fuente.**
`fuente_url` apunta al documento del fabricante y `fuente_fecha` a cuándo se leyó. Una fila con fuente
se audita en treinta segundos; una sin fuente hay que volver a creerla entera.

**4. El tamaño máximo es el más grande que ADMITE, no el más común.**
Si la ficha lista Oficio entre los tamaños soportados, es `legal` aunque casi todos impriman en carta.

## Qué hacer cuando entra un equipo nuevo

1. Buscar la **ficha oficial del fabricante** (sitio de Latinoamérica, en español). Si el PDF existe, se
   procesa con la función `ficha-pdf`, que lo baja y deja su texto en `fichas_pdf` para consultarlo con
   SQL. Dónde están los PDF: Shopify (Contenido → Archivos) y el sitio del fabricante. Canon
   Latinoamérica tiene ruta predecible:
   `cla.canon.com/es_PA/app/pdf/brochures/<Serie>/<MODELO>_Brochure.pdf`
2. Llenar los metacampos de Shopify con esos valores, aplicando las cuatro reglas.
3. Agregar la fila a `impresoras_specs` con su `handle`, `fuente_url` y `fuente_fecha`.
4. Dejar `verificado = false` hasta que un humano que conozca el equipo lo repase.

**El bot no recomienda lo que no está en la tabla.** Un equipo nuevo sin fila es un equipo que nunca se
va a ofrecer, por bueno que sea.

## El centinela

La función **`specs-centinela`** compara el catálogo vivo de Shopify contra la tabla y avisa. Corre sola
todos los **lunes a las 8:00 a.m. hora Panamá** (cron `specs-centinela-lunes`) y deja su resultado en
`job_log`. Se puede correr a mano en cualquier momento.

Reporta seis cosas:

| Qué | Por qué importa |
|---|---|
| `nuevos` | impresora en la tienda que el bot no conoce — no la va a recomendar jamás |
| `retirados` | fila cuya impresora ya no está activa |
| `titulo_vs_ficha` | el título anuncia una velocidad distinta a la de la ficha verificada |
| `mal_clasificados` | consumibles con tipo de producto de impresora (ensucia los filtros de la tienda) |
| `sin_fuente` | filas que nadie puede auditar |
| `fuente_vieja` | fichas leídas hace más de 18 meses |

**El chequeo estrella es `titulo_vs_ficha`.** En su primera corrida encontró solo, y sin ayuda, las
tres contradicciones que habían costado un día entero de trabajo manual:

| Modelo | El título anuncia | La ficha verificada dice |
|---|---|---|
| Epson EcoTank L5590 | 33 negro / 20 color | 15 negro / 8 color |
| Canon PIXMA G3170 | 8.8 negro / 5 color | 11 negro / 6 color |
| Canon MAXIFY GX4010 | 30 negro / 18 color | 18 negro / 13 color |

Solo compara filas **verificadas**: ahí la ficha manda y un título que no cuadra es un error del título.
En una fila sin fuente no se sabe cuál de los dos está mal, y avisar de eso sería ruido.

El centinela **no corrige nada**. Reporta. Corregir specs sin leer la fuente es exactamente como
llegamos hasta aquí.

## Consulta rápida

```sql
select created_at, ok, detail
from job_log
where function_name = 'specs-centinela'
order by created_at desc limit 5;
```

## Contenido sindicado: sirve, pero primero hay que sanear el número de parte

**Ya tienen sindicación instalada.** Es 1WorldSync: la clave `05405c2a` y la zona `hp-auto-pp` están
embebidas en varios metacampos (`sindicado.custom.contenido_sindicado`, `informacion_extra.custom.codigo.html`,
`descripcion.custom.html`, `Descripcion.custom.descripcion`) de productos Epson, Canon y Lexmark.

Tres cosas que hay que saber antes de apoyarse en ella:

**1. Es un widget, no un feed.** El script `h1ws.js` arma `ws.cs.1worldsync.com/script/<zona>?mf=…&pn=…`
y **inyecta HTML en el navegador del cliente**. No hay tabla de specs legible desde el servidor: llamar
al endpoint desde fuera del navegador devuelve 400. Para nuestro uso —cargar campos estructurados— hace
falta la **API de datos**, no el widget. Como ya son clientes de 1WorldSync, pedir acceso al feed puede
ser cuestión de un correo. Alternativa con catálogo abierto: **Icecat**.

**2. La zona configurada es `hp-auto-pp`** — la de HP — y se la están pasando también a productos Epson
(`mf: 'Epson'`) y Canon. Vale confirmar con el proveedor si esos productos están mostrando algo, porque
puede haber sindicación pagada que no se ve.

**3. Aunque llegue el feed, el contrato de datos sigue haciendo falta.** El contenido sindicado es
material de marketing autorizado por el fabricante: excelente para descripciones, fotos y bullets, pero
sus specs vienen como "velocidad de impresión: hasta 33 ppm", sin decir si es ISO o borrador. Resuelve
el problema de TENER contenido, no el de la unidad.

### El bloqueante real: 20 MPN duplicados

Todo catálogo sindicado (1WorldSync, Icecat, Syndigo) y también Google Shopping indexan por **número de
parte**. Un MPN repetido hace que el feed le entregue a un producto el contenido de otro: specs, fotos y
todo. La primera corrida del centinela encontró **20 duplicados**, varios abarcando de 3 a 7 productos:

| MPN | Se repite en | Comentario |
|---|---|---|
| `MFCL3710CW` | 7 productos | Canon imageRunner, Brother MFC-T4500DW, Canon imageCLASS X MF1538C… |
| `C11CK24301` | 4 Epson WorkForce | WF-C5810, C5890, C5891, M5899 |
| `5HB06A#B1K` | 1 HP + 3 Canon | un número de parte de HP DesignJet en plotters Canon |
| `4SB24A#AKY` | Smart Tank 530, 580, 583 | el de la 580 debería ser `1F3Y2A` (está en el nombre de su ficha) |
| `C11CJ80201` | Epson F170 y **Brother SP-1** | el MISMO copy-paste que le puso a la SP-1 la descripción de la F170 |
| `CZ993A#AKY` | HP OfficeJet 200 y **Canon** PIXMA TR160 | cruzado entre marcas |

El patrón es claro: al duplicar un producto en Shopify para crear otro, el número de parte viaja con la
copia y nadie lo cambia. Es la misma raíz que las descripciones equivocadas — y explica por qué la
SP-1 tenía la ficha de la F170: comparten el MPN hasta hoy.

**Conclusión: con esto sin arreglar, sindicar contenido empeora el catálogo en vez de arreglarlo.**
Saneado el MPN, la sindicación pasa a ser la mejor opción de largo plazo. El centinela ya vigila
`mpn_duplicado` y `sin_mpn` (18 impresoras sin número de parte), y un duplicado cuenta como "no limpio"
igual que una contradicción de specs.
