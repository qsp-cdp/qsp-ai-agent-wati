# Saneo de números de parte (MPN) en Shopify

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
4. **Patrón de la marca** — Brother usa el código de modelo sin guiones (`DCPT730DW`). Marcado como
   "confirmar" porque es inferencia, no dato.

## Resueltos con evidencia dura

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

## Al terminar

Correr `specs-centinela` de nuevo: `mpn_duplicado` debe quedar en **0**. Corre solo los lunes a las
8:00 a.m., y también se puede disparar a mano.
