# El bot inventó un producto y mandó a un cliente a la tienda (01-sep-2026)

Conversación `50760016863`. Lo trajo Isaac el mismo día.

## Qué pasó

| Hora | Quién | Qué |
|---|---|---|
| 15:15:21 | cliente | *"Tinta para impresora Hp officeJet 5255"* |
| 15:15:42 | bot | busca `tinta HP OfficeJet 5255` → **"Ninguna confirma compatibilidad exacta"** ✅ honesto |
| 15:16:09 | cliente | *"63XL en blanco y negro"* |
| 15:16:28 | bot | busca `tinta HP 63XL negra` → **"No encontré una tinta HP 63XL"** ✅ honesto |
| 15:16:33 | cliente | *"63 XL"* |
| **15:17:01** | **bot** | busca `HP 63XL negombro` → **"Encontré el cartucho HP 63XL Negro"** + link |
| 15:17:07 | bot | *"$32.50 + ITBMS (7%) = $34.78"* |
| 15:17:12 | bot | *"✅ 8 unidades disponibles"* |
| 15:25 | cliente | *"Ubicación?"* → el bot se la da. **El cliente sale para la tienda.** |
| 15:53 | asesor | *"esas tintas no las tenemos disponibles"* |
| 15:54 | cliente | *"Dígame me habia dicho que si que tenía 8 unidades ya iba en camino"* |
| 15:58 | asesor | *"fue un error del bot, disculpe la molestia"* |

**Nada de eso existe.** Ni el producto, ni el precio, ni las 8 unidades. En los 1.633 productos de la
réplica no hay un solo 63XL, ni ningún compatible con la OfficeJet 5255.

## Por qué no fue "la búsqueda no encontró nada"

Es lo que uno supondría, y es lo contrario. En el turno de las 15:16:57 `buscar_producto` **sí
devolvió cinco productos reales** — se puede verificar por los `ref_codes` que emitió:

```
15:16:57  R5NOAXyT → cabezal-hp-x4e75al-tricolor-para-smart-tank
15:16:57  UpkbZRxv → tinta-hp-664xl-negra-f6v31al
15:16:57  V1W9LBnU → tinta-hp-60xl-tinta-color-negro
15:16:57  FoEDS869 → hp-smart-tank-750-impresora-multifuncional
15:16:57  OjPthQ1O → tinta-hp-964xl-negra-3ja57al
```

Ninguno es un 63XL. El modelo tenía los cinco delante y, en vez de repetir lo que ya había dicho bien
dos veces, **agregó un sexto que no estaba en la lista**. No rellenó un vacío: contradijo el
resultado. Y como ya había decidido cotizar un producto, la plantilla de burbujas (v66) le abrió tres
huecos —título, precio, stock— y los llenó los tres.

## El delator: `ref_code=qsp01`

El link salió con `ref_code=qsp01`. Por el invariante de **v28**, el sistema **nunca emite un ref_code
que no haya guardado antes** en la tabla `ref_codes`. Los reales son 8 alfanuméricos crypto
(`R5NOAXyT`…). `qsp01` **no existe en la tabla**: no lo generó este sistema, lo escribió el modelo.

Eso da una prueba determinista, que no depende de juzgar el texto. Barrido de 30 días de tráfico:

```
URLs de producto emitidas por el bot ......... 1.169
con un ref_code que NO existe en ref_codes ...     1   ← este caso
```

**Un solo falso, y es el que costó el viaje.**

## El fix (v120)

`productosNoDelTurno()` + `linksInventados()`, cableados en el flujo normal y en asistencia, justo
donde ya vive `reaplicarTracking` (que ya conoce los handles legítimos del turno).

Un link de producto se considera respaldado si **(a)** su handle salió de `buscar_producto` en ESTE
turno, o **(b)** su `ref_code` existe en `ref_codes`. Si no cumple ninguna, la respuesta no se envía:
va la deferencia ("déjeme verificar bien esa información") y queda `producto_inventado` en `job_log`
con la respuesta original para auditarla. En asistencia simplemente se calla (un asesor ya tiene el
caso), como el guard de v44.

**Por qué la condición (b) y no solo (a).** Medido sobre los mismos 30 días: hay ~15 turnos legítimos
donde el cliente dice "sí, ese" y el bot RE-CONFIRMA un link ya compartido antes en la conversación
(*"Perfecto, entonces le confirmo: \*Cabezal HP M0H50AL\*…"*). Con solo (a) los habríamos bloqueado —
media regresión por día. Mirando el ref_code, pasan: el link lo emitimos nosotros, aunque haya sido
en otro turno.

**Por qué no se valida contra la réplica del catálogo.** Un handle ausente de `catalogo` puede
significar "producto borrado en Shopify" *o* "réplica atrasada", y no queremos que una sincronía con
retraso haga callar al bot. El libro de `ref_codes` es data nuestra y no envejece.

**Fail-open**: si la consulta a `ref_codes` falla no se puede verificar, y se deja pasar
(`ref_code_verif_fallo` en job_log). Dejar mudo al bot ante cada link por un hipo de la base sería
peor que el riesgo que cubre. El guard corre además **antes** de partir en burbujas — si corriera
después, la burbuja del título ya habría salido.

Coste: una consulta por PK, y solo cuando aparece un link que no es del turno (~1 vez al día).

## Lo que este guard NO cubre

Si el modelo inventara un producto **sin link**, nada lo detecta: el precio y el stock inventados
viajarían igual. En este caso el link vino incluido (la plantilla de v66 siempre lo lleva) y con él se
cae todo el mensaje, pero no es una garantía general. Queda anotado como riesgo residual — cubrirlo
exigiría validar precio/stock contra el resultado de la tool, que es harina de otro costal.

## Verificar después de desplegar

```sql
-- Debe estar vacío en régimen normal. Cada fila es un intento de inventar bloqueado.
select created_at, detail from job_log where action = 'producto_inventado' order by created_at desc;
-- Y que el guard no esté fallando en silencio:
select count(*) from job_log where action = 'ref_code_verif_fallo';
```

Healthcheck: `version: v120-producto-inventado`.

## De paso: dos bugs del arnés de pruebas

Extraer la función nueva destapó que `tests/_extraer.mjs` no sabía leer dos formas de TS perfectamente
normales, y **truncaba la función en silencio** en vez de fallar:

1. **Genérico en un parámetro** — `links: Record<string, string>` se partía por la coma de adentro y
   dejaba un parámetro fantasma llamado `string>`.
2. **Llaves en el tipo de retorno seguido de `[]`** — `): { handle: string; ref: string | null }[] {`
   tomaba la llave del TIPO por la del CUERPO y devolvía la función sin cuerpo.

Ambos arreglados (`finDeParams`, `inicioDelCuerpo`, corte por nivel cero). Son la misma clase de
problema que ya se había visto: un arnés que extrae mal produce locks que pasan sin probar nada.
