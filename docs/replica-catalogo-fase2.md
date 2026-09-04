# Réplica del catálogo — fase 2: el motor corregido y el shadow (03-sep-2026)

> Fase 1 (tabla `catalogo` + `catalogo-sync`) está **en producción desde el 28-ago** y sana: 1.633
> productos (1.339 activos, 290 borradores, 4 archivados), 415 sincronizaciones por webhook en 7 días,
> 6 reconciliaciones nocturnas sin parciales. Esta fase NO cambia ninguna respuesta al cliente.

## Por qué la fase 2 estaba parada

El motor (`buscar_catalogo`, v1 del 28-ago) fallaba y no quise commitear un motor con fallas conocidas.
Al retomarlo lo medí contra un banco de casos reales de la historia del proyecto: **acertaba 4 de 8**.

Los fallos no eran de calibración fina. Cada uno **rompía una regla que el copiloto ya tenía escrita en
TypeScript** y que este motor, nacido aparte, no heredó:

| # | Caso real | v1 devolvía | Causa | Regla que ya existía |
|---|---|---|---|---|
| 1 | `tinta HP 63XL` (no existe) | «Tinta Hp 662XL», módulo dúplex | el código sin match caía al FTS | **v60.1**: código no hallado → no ofrecer el vecino |
| 2 | `cabezales para HP 410` | botellas Canon GI-190 | match de código en tags por substring («Canon Pixma G4100» contiene 410) | **v55**: frontera de palabra |
| 3 | `cabezales para HP 410` | mezclaba cabezales y tintas | el TIPO que nombra el cliente se ignoraba | **v61.2**: el tipo es excluyente |
| 4 | `papel bond 30 pulgadas` | «Cinta Epson ERC-38B» | FTS puramente OR ordenado solo por `ts_rank` | — |

El #1 es el más grave: es **la misma forma del incidente del 01-sep** (v120), donde el bot inventó un
63XL y mandó a un cliente a la tienda. Un motor que ante un código inexistente responde con el vecino
más parecido le sirve la alucinación en bandeja.

## Lo que se corrigió, y con qué evidencia

Todo se decidió mirando el catálogo real, no ajustando a los casos:

- **Código sin match → VACÍO.** La réplica prefiere callar. Ve el catálogo COMPLETO (agotados y
  borradores incluidos), así que si el código no está, no está.
- **Frontera de palabra en tags.** Los datos lo muestran: el tag correcto («Hp Ink Tank 410») convive
  con falsos amigos donde el número vive DENTRO de otro — `Canon Pixma G4100`, `Brother PT-2410`,
  `Lexmark MS410dn`, `HP LaserJet Pro MFP 4103dw`.
  ⚠️ Pero **la frontera NO sirve como filtro en títulos**: medido, «Toner Lexmark C540A1CG … X544 /
  C544» se perdería para "toner Lexmark 544". Por eso es criterio de **orden**, no de filtro.
- **Tipo excluyente** (`tipo_pedido` / `tipo_producto`, espejo del TS), más un tipo que el TS no tenía
  y el catálogo sí necesita: `mantenimiento` (una caja de mantenimiento no es tinta aunque diga
  "Cartucho"). Conservador: un título sin tipo claro nunca se descarta.
- **Orden del FTS por términos distintos matcheados**, antes de `ts_rank`. No filtra — solo ordena —
  así que el recall del OR se conserva.

Validando aparecieron **tres palabras más que el cliente escribe y el motor ignoraba**:

- **MARCA** — `toner HP 410` devolvía tóners **Lexmark**: su lista de compatibles trae "410" como
  palabra suelta mientras el HP real se llama «CF410A» (el código pegado a una letra), así que hasta la
  frontera premiaba al equivocado. Ninguna heurística de texto separa eso; la marca sí, y el catálogo
  la tiene limpia (Hp 493 · Canon 307 · Brother 192 · Epson 139 · Lexmark 62). Es **filtro**, con la
  misma tolerancia que el tipo. Efecto lateral bueno: `toner HP 70C8` (ese código es de Lexmark) ahora
  da **vacío** en vez de ofrecer otra marca.
- **CLASE** — `impresora epson ecotank` devolvía cajas de mantenimiento. Se agrega el tipo `equipo`,
  detectado por cómo **arranca** el título (medido: 135 títulos arrancan con impresora/multifuncional/
  plotter/escáner y son equipos reales; los 82 que mencionan "impresoras" sin serlo son tóners «para
  Impresoras Xerox» y no arrancan así). El orden de las ramas importa en los dos sentidos: en
  `tipo_producto` `equipo` va **primero** (una «Impresora Canon G4170 Tinta Continua» es un equipo), y
  en `tipo_pedido` va **último** ("tinta para impresora G4170" pide TINTA).
- **COLOR** — `tinta HP 954 negra` devolvía la Cyan primero. Criterio de **orden**, no filtro: un combo
  de 4 colores sigue siendo respuesta válida.

Y se conservó la lección de **v61**: si el cliente dice "combo/juego/pack/kit", los combos van primero
— su código suele vivir en el SKU (`T544520-4P`) o en un tag, no en el título.

## Resultado: 19 de 20

| | consulta | devuelve |
|---|---|---|
| ✅ | `caja de mantenimiento Epson L5590` | Caja de Mantenimiento Epson **C9344** (agotada — la que el motor de Shopify no ve) |
| ✅ | `papel bond 30 pulgadas` | Rollo Bond **Alliance 30" x 150'** |
| ✅ | `cabezales para impresora HP 410` | Cabezal M0H50AL · M0H51AL · Combo 3YP86AL |
| ✅ | `toner TN830XL` | Tóner Brother TN-830XL |
| ✅ | `tinta HP 63XL` | **(vacío)** |
| ✅ | `toner HP 70C8` | **(vacío)** — ese código es Lexmark |
| ✅ | `toner HP 410` | Toner Hp CF410A / CE410A |
| ✅ | `tinta HP 954 negra` | la **Negra** primero |
| ✅ | `impresora epson ecotank` | Impresoras Epson EcoTank |
| ✅ | `impresora 11x17` | HP 9730 · 7740 |
| ✅ | `tinta para impresora Canon G4170` | botellas GI-11 (no la impresora) |
| ✅ | `juego de tintas para GX7010` | **Combo** GI-16 primero |
| ✅ | `toner Lexmark 544` | C540A1KG/CG/YG (recall conservado) |
| ❌ | `toner 508A magenta` | CF361A, que es **cian** |

**El que falla es un hueco de DATOS, no de código:** los títulos de esa familia («Toner Hp CF361A 508A
| M552 / M553») **no llevan el color**, así que la llave de color no tiene con qué ordenar. Se arregla
en Shopify agregando el color al título o a un tag — como ya se hizo con el tag "T544" del combo Epson.

Costo: **21 ms** por consulta sobre los 1.633 productos.

## Lo que se despliega ahora: SOLO el shadow

`BUSQUEDA_REPLICA` (`off` | `shadow` | `codigos` | `primaria`, default **off** con el ADN de
`COPILOT_MODE`: valor inválido → `off`). En `shadow`, tras cada `buscar_producto` se consulta también
la réplica **en segundo plano** y se registra la comparación en `job_log` (`busqueda_replica_shadow`).
**El cliente recibe exactamente lo de siempre**; desplegar con el default es un no-op.

Se mide **por clase de consulta**, porque el flip no debe ser en bloque:

```
clase        para_modelo · codigo · atributo · libre
replica_rescata          el motor actual no halló y la réplica sí
replica_pierde           regresión potencial
agotados_solo_en_replica los que Shopify no devuelve (la razón de existir)
via                      tag | codigo | fts
```

**El primer flip previsto es `codigos`**, no `primaria`: la réplica es fuerte en su terreno
determinista (código y compatibilidad por tag) y el motor semántico en vivo sigue siendo mejor en
lenguaje difuso. Los dos casos que aún fallan son de texto libre, que en modo `codigos` nunca llega al
cliente.

## Línea roja (no cambia)

La réplica decide **qué mostrar**, nunca **cuánto cuesta ni si hay stock**. `precio_usd` es de
referencia (filtrar y ordenar); la cotización y la disponibilidad salen EN VIVO de `buscar_producto`.
Hay un golden test que lo fija.

## Puesta en marcha

1. Fusionar el PR → GitHub Actions despliega (no-op: `BUSQUEDA_REPLICA` viene apagado).
   La migración `20260903120000_buscar_catalogo_v2.sql` **ya está aplicada en producción** (se validó
   ahí el banco de 20 casos); el archivo es la fidelidad del repo.
2. Encender el shadow:
   ```
   npx supabase secrets set --project-ref jbigmlcalcwiphqeudxd "BUSQUEDA_REPLICA=shadow"
   ```
3. Dejarlo unos días y leerlo:
   ```sql
   select detail->>'clase' as clase, count(*),
          count(*) filter (where (detail->>'replica_rescata')::boolean) as rescata,
          count(*) filter (where (detail->>'replica_pierde')::boolean)  as pierde,
          sum((detail->>'agotados_solo_en_replica')::int) as agotados_solo_replica,
          round(avg((detail->>'replica_ms')::numeric)) as ms
   from job_log where action = 'busqueda_replica_shadow' and created_at > now() - interval '7 days'
   group by 1 order by 2 desc;
   ```
4. Si en las clases `codigo` y `para_modelo` rescata más de lo que pierde → `BUSQUEDA_REPLICA=codigos`.

## Tarea de datos pendiente (no es código)

Agregar el **color al título o a un tag** de las familias cuyos títulos solo llevan el código
(`Toner Hp CF361A 508A`, y las que estén igual). Es lo único que separa "toner 508A magenta" del
cartucho correcto.
