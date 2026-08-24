# Saneo de números de parte (MPN) en Shopify

> ## ⚠️ LEER ESTO PRIMERO — la regla cambió el 24-ago-2026
>
> **El MPN se deriva del campo SKU de la variante. No se investiga producto por producto.**
>
> Este directorio nació buscando el número de parte de cada impresora en folletos de fabricante, uno
> por uno. Fue trabajo perdido en su mayor parte: **el campo SKU de Shopify ya tenía el número
> correcto en casi todo el catálogo**, y el metacampo `mm-google-shopping/mpn` era una copia que
> nadie mantenía y que arrastraba números viejos, vacíos y repetidos.
>
> Los dos casos que lo dejan claro:
>
> | Producto | Lo que hice | Lo que decía el SKU |
> |---|---|---|
> | HP OfficeJet Pro 9130 | la dejé sin resolver por no poder confirmar el número en hp.com | `404K5C#AKY` |
> | Canon imageRUNNER 1643i | encontré `3630C006AA` en un folleto de Canon alojado por un distribuidor | `5160C004AA` — o sea ese folleto no era de este equipo |
>
> Y el último grupo duplicado que quedaba, las tres POS de Epson, tenían `C31CH51001` las tres en el
> metacampo mientras cada una ya tenía el suyo en el SKU (`C31CJ57052`, `C31CK50012`, `C31CH51002`).
> Ni siquiera la que yo había llamado "dueña legítima" del número lo era.
>
> **Estado: `mpn_duplicado` = 0 y `sin_mpn` = 0** tras sincronizar 51 productos con su SKU.
>
> El centinela ahora vigila `mpn_vs_sku` cada lunes, así que la desincronización se detecta sola. Es
> una regla que una máquina puede revisar, a diferencia de "¿este número es el que publica el
> fabricante?", que necesita leer una ficha y criterio.
>
> **`datos.py` y el `.xlsx` son un registro histórico de cómo se llegó hasta aquí, no una lista de
> tareas.** Varias de sus propuestas fueron superadas por el SKU (la TR160 dice `7069C002` ahí y
> `7069C002AA` en el SKU, por ejemplo). Si hay que corregir un MPN hoy: se mira el SKU.
>
> Lo único pendiente son **2 SKU que llevan la marca pegada al frente** y que el centinela reporta:
> `EPSON B12B808441` y `HP RM1-3717-020`. El MPN ya quedó limpio (`B12B808441`, `RM1-3717-020`); el
> SKU se corrige en el pareo con Sage 50, donde ambos sistemas deben coincidir para que sincronice el
> inventario.

---

El MPN es la llave con la que indexan **Google Shopping** y **cualquier catálogo de contenido
sindicado** (1WorldSync, Icecat, Syndigo). Un MPN repetido hace que le entreguen a un producto el
contenido de otro: especificaciones, fotos y todo. Mientras siga así, sindicar contenido **empeora**
el catálogo en vez de arreglarlo.

`specs-centinela` detectó **20 grupos duplicados sobre productos activos** (57 productos), más 12
hallazgos sueltos de MPN equivocado que no llegan a duplicarse entre activos.

## El patrón

Al duplicar un producto en Shopify para crear otro, el número de parte viaja con la copia y nadie lo
cambia. Es la misma raíz de las descripciones equivocadas: **la Brother SP-1 y la Epson SureColor F170
comparten `C11CJ80201` hasta hoy** — por eso la SP-1 tenía pegada la ficha de la F170. Se corrigió la
descripción, el número de parte no.

Los casos más llamativos:

| MPN | Se repite en | Nota |
|---|---|---|
| `MFCL3710CW` | 7 productos | Canon imageRUNNER, Brother MFC-T4500DW, Canon imageCLASS X MF1538C… |
| `C11CK24301` | 4 Epson WorkForce | C5810, C5890, C5891, M5899 |
| `5HB06A#B1K` | 1 HP + 3 Canon | un número de HP DesignJet en tres plotters Canon |
| `4SB24A#AKY` | Smart Tank 530, 580, 583 | |
| `CZ993A#AKY` | HP OfficeJet 200 y Canon PIXMA TR160 | cruzado entre marcas |
| `4621C004AA` | Canon G510 y **Epson** EcoTank L8050 | número Canon en una Epson |

## Cómo se generó

`armar.py` construye la hoja desde `datos.py`. Regenerar:

```bash
python3 armar.py     # produce MPN-duplicados-QSP.xlsx
```

Cada propuesta lleva su origen. Por orden de confianza:

1. **Folleto oficial del fabricante** — el más fuerte. Los folletos Canon traen una tabla
   "NÚMERO DE MODELO / DESCRIPCIÓN / NÚMERO DE ÍTEM"; su texto ya está en `fichas_pdf`, así que el
   número se saca con SQL sin volver a descargar nada. Ejemplo:
   `PIXMA G3170 BK * Impresora Inalámbrica Multifuncional MegaTank 5805C004AA`.
2. **Nombre del PDF oficial que la tienda hospeda** — así salió el de la Smart Tank 580 (`1F3Y2A`,
   de `MULTIFUNCIONAL-HP-SMART-TANK-580-WIRELESS-1F3Y2A.pdf`).
3. **Título o handle del producto** — HP y Canon suelen ponerlo ahí. Fuerte cuando el número que
   aparece en el título es distinto al del metacampo: significa que alguien sí lo sabía.
4. **Patrón de la marca** — es inferencia, no dato, y **no se aplica mientras siga siéndolo**. El de
   Brother (código de modelo sin guiones) dejó de ser patrón el 24-ago: brother-usa.com usa ese mismo
   código como identificador de producto en tres familias distintas — `/products/hll2460dw`,
   `/product-support/HLL2460DW`, `/products/mfcl3720cdw`, `/products/ql820nwb`,
   `/p/sublimation-printers/SP1`. Eso lo convirtió en fuente, y por eso los 9 Brother se aplicaron.
   Un patrón que no se logra confirmar así se queda sin aplicar.

**Atajo por marca**, que es lo que hace rápido el trabajo:

- **Epson** — el SKU va en la URL de su página oficial: `…/Impresora-WorkForce-Pro-WF-C5891/p/C11CK27301`.
  Basta con buscar el modelo y leer la URL.
- **Canon** — el folleto trae la tabla "NÚMERO DE MODELO / DESCRIPCIÓN / NÚMERO DE ÍTEM". Si el PDF ya
  está en `fichas_pdf`, sale con SQL sin descargar nada.
- **HP** — el número va en el título de la página, en la URL de la tienda y en el nombre del PDF de
  especificaciones (`6QN28A.pdf`).
- **Brother** — el MPN es el modelo sin guiones, y su propio sitio lo confirma: la URL del producto y
  la de soporte usan ese código (`/products/mfcl3720cdw`, `/product-support/HLL2460DW`). Ojo: en esta
  tienda la QL-800 está guardada **con** guion, así que lo guardado no siempre sigue la convención —
  se compara contra Brother, no contra los vecinos.
- **Lexmark** — no lo publica en la ficha del producto, pero su **lista de precios oficial** sí, con el
  formato `<número de parte> Lexmark <modelo> <precios>`. Se procesa con `ficha-pdf` como cualquier otro
  PDF y salen todos los modelos de una: así se resolvieron la CX522ade (`42C7360`) y la MX522adhe
  (`36S0840`). *Cuidado con la fecha de la lista: la de 2019 no tiene los modelos nuevos.*

**Punto de venta (POS): confirmar la variante.** Las térmicas Epson tienen un SKU distinto por interfaz
y color (la TM-m30III es `C31CK50012` y la -H es `C31CK51012`). Ahí no basta con el modelo: hay que
saber cuál se vende.

## Resueltos con evidencia dura

*Registro histórico — no copiar de aquí.* Varios de estos números fueron después ajustados al SKU,
que es el que manda: la TR160 quedó en `7069C002AA`, la Smart Tank 583 en `4A8D7A#AKY`, la M501dn en
`J8H61A#BGJ`, y el MC-G01 volvió a `MC-G01`. La tabla se conserva porque documenta **dónde** publica
cada fabricante su número, que sigue siendo útil cuando entra un equipo nuevo sin SKU todavía.

| Producto | Tenía | Es | Fuente |
|---|---|---|---|
| Canon PIXMA G3170 | 4468C004AA (de la G3160) | **5805C004AA** | folleto Canon |
| Canon MAXIFY GX4010 | 4471C004AA (de la GX7010) | **5779C004AA** | folleto Canon |
| Canon PIXMA G4170 | (vacío) | **5807C004AA** | folleto Canon |
| HP Smart Tank 580 | 4SB24A#AKY (de la 530) | **1F3Y2A** | PDF de HP en la tienda |
| Epson EcoTank L8050 | 4621C004AA (Canon) | **C11CK37301** | página oficial Epson |
| Epson EcoTank L4360 | C11CJ63301 (de la L4260) | **C11CL41301** | página oficial Epson |
| HP DesignJet T850 | F9A30A (de la T830) | **2Y9H2A** | título |
| HP DesignJet T1700dr | F9A30A (de la T830) | **1VD88A** | título |
| HP LaserJet M111w | 7ZU85A#BGJ (de la M578dn) | **7MD68A** | título y handle |
| HP DeskJet 2875 / 2975 | 7FR21A (de la 2775) | **588S4A** / **AJ4Y5A** | título y handle |
| Canon TC-20 / TM-340 / TM-340 MFP | 5HB06A#B1K (HP) | **5815C002** / **6248C002** / **6248C023AA** | título |
| Epson WF-C5890 | C11CK24301 (de la C5810) | **C11CK23301** | página oficial Epson |
| Epson WF-C5891 | C11CK24301 (de la C5810) | **C11CK27301** | página oficial Epson |
| Epson WF-M5899 | C11CK24301 (de la C5810) | **C11CK76301** | página oficial Epson |
| HP Color LaserJet Ent. 5700dn | 7KW55A#BGJ | **6QN28A** | hp.com |
| HP Color LaserJet Pro 3303fdw | 7KW55A#BGJ | **499M8A** | tienda oficial HP |
| Canon MAXIFY GX7110 | 4471C004AA (de la GX7010) | **6880C004AA** | folleto Canon, fila *Modelo GX7110 / Impresora multifunción* |
| Canon imageCLASS MF289dw | MFCL3710CW (Brother) | **6354C005AA** | folleto Canon: *"Código mercury"* |
| Canon PIXMA TR160 | CZ993A#AKY (HP) | **7069C002** | Canon USA |
| Canon MC-G01 / MC-G03 / MC-G04 | texto "MC-G01" / 4589C001 | **4628C001AA** / **5794C001AA** / **5813C001AA** | tabla de mantenimiento en los folletos GX7110, GX4010 y G3170 |
| HP OfficeJet Pro 9730 | G5J38A#AKY (de la 7740) | **537P5C** | ficha HP: *"Contenido de la caja"* |
| HP Color LaserJet Flow 6800zf | 7KW55A#BGJ | **6QN36A** | ficha HP: *"Product number"* |
| HP Smart Tank 583 | 4SB24A#AKY (de la 530) | **4A8D7A** | URL de la tienda HP México |
| HP LaserJet Pro M501dn | 2Z610A (de la 4003dw) | **J8H61A** | portal de documentos de HP |
| Brother SP-1 | C11CJ80201 (**Epson** F170) | **SP1** | página oficial Brother |

**La trampa de los folletos:** traen varios números y solo uno es del equipo. El de la MF289dw lista
tres, y dos son **tóners** (`5647C001AA`, `5648C001AA`). El bueno es el que va precedido de
*"Modelo imageCLASS MF289dw. Código mercury"*. Sin leer el contexto alrededor del número se escoge un
consumible y queda igual de mal que antes.

## Al terminar

Correr `specs-centinela` de nuevo. Al 24-ago quedó en **`mpn_duplicado` = 0, `sin_mpn` = 0,
`mpn_vs_sku` = 2** (los dos SKU con la marca pegada, arriba). Corre solo los lunes a las 8:00 a.m.
hora Panamá, y también se puede disparar a mano.
