# Auditoría del system prompt — mapa de reestructuración

**Fecha**: 21-ago-2026 · **Método**: guía oficial de Anthropic de auditoría de prompts (prompt-audit)
**Alcance**: `SYSTEM_PROMPT` (líneas 669–798 de copilot-webhook, ~10,000 tokens), los 5 sufijos de modo
(ASSIST, CAPTURA, SWEEP, ENVIO_ASESOR, PIDIO_ASESOR) y las 10 descripciones de herramientas.
**Modelo objetivo**: `claude-sonnet-5` (el que corre en producción).
**Regla de la guía que gobierna todo**: *"cruft ≠ longitud; el contexto nunca es cruft"* — no se acorta
por acortar: se eliminan instrucciones específicamente desactualizadas o duplicadas, y el contexto que
solo el negocio conoce SE QUEDA aunque sea largo.

## Resumen ejecutivo

| Veredicto | Cantidad aprox. | Ejemplos |
|---|---|---|
| 🔴 **Línea roja — queda en el prompt corto** | ~35% del texto | Regla de oro de precios, pagos/facturación = humano, anti-interrupción, trato de usted, formato WhatsApp |
| 🔧 **Procedimiento — se muda a la herramienta** | ~40% del texto | Rutas de enrutamiento (qué tool para qué pregunta), reglas de sucursales/tarifas/recompra/asesoría que las notas de las tools ya dicen |
| ✂️ **Eliminar o comprimir** | ~25% del texto | Duplicados entre secciones, narrativa de incidentes ("caso real: …"), marcadores de versión (v105), coaching de estrategia que Sonnet 5 ya hace solo |

**Estimación del prompt resultante: ~4,000–4,500 tokens (de 10,000)** — no por recorte ciego, sino
porque el 40% "procedimiento" ya tiene un lugar mejor (la herramienta lo dice en el momento exacto en
que aplica, sin depender de que el modelo lo recuerde entre 150 reglas).

## Los 3 hallazgos de mayor impacto

### 1. Duplicación masiva prompt ↔ herramientas (el hallazgo principal)

Las mejoras v92–v106 movieron la precisión a las notas de las herramientas (`respuesta_sugerida`,
`eco_guardado`, `nota_recompra`, tipo de agencia explicado…), **pero las reglas viejas del prompt que
cubrían lo mismo nunca se retiraron**. Hoy el modelo recibe la misma instrucción 2 y hasta 3 veces
(prompt + descripción de la tool + nota del resultado), con redacciones distintas que debe reconciliar.
La guía lo marca explícito: *"duplicated rules make the model spend effort reconciling wordings"*.

Secciones del prompt que las herramientas ya cubren en el momento exacto:

| Sección del prompt | Ya vive en | Qué queda en el prompt |
|---|---|---|
| SUCURSALES DEL INTERIOR (bloque gigante, línea 750) | descripción + nota de `sucursales_interior` (v106) | 1 línea: "el interior va por Servientrega; la tool trae el punto y SIEMPRE ofrece también puerta a puerta" |
| COSTO POR SECTOR (751) | `respuesta_sugerida` determinista de `tarifa_entrega` | 1 línea de enrutamiento ciudad vs interior |
| CONCIENCIA DE PEDIDOS + RECOMPRA (764–769) | descripción de `estado_pedido` + `nota_recompra` | 1-2 líneas |
| ASESORÍA DE IMPRESORAS (771–775) | descripción + nota de `asesorar_impresora` (v105) | 1 línea |
| Códigos de zona prohibidos, eco de dirección, bloque de confirmación (760–761) | `avisoInterno`, `eco_guardado`, `confirmacion` de `guardar_datos_envio` | media línea |
| Partes de REGLA DE ORO (stock tal cual, oferta, aviso de inventario insuficiente) | los campos y `respuesta_sugerida` de `buscar_producto`/`calcular_cotizacion` | el principio ("todo precio sale de la tool"), sin los detalles de formato que la tool ya arma |

### 2. Arqueología dentro del prompt (patrón "History narratives" de la guía)

El prompt le cuenta al modelo los incidentes: *"caso real: el bot dijo oficina 4008…"*, *"caso real
reportado por los asesores: pidió 3 de cada color…"*, *"(v105 —…)"*. La guía es directa: *"la autoridad
de una regla es el comportamiento que prescribe, no el incidente que la motivó; suelta la arqueología"*.
La CONSECUENCIA sí se queda (es la razón: "un número de oficina inventado manda a una persona a la
puerta equivocada"); la narrativa del incidente vive ya en los comentarios del código, que es su lugar.
Detectados: 6 "caso real:" + 1 marcador de versión dentro del texto del prompt.

### 3. Volumen de énfasis (patrón "Pressure language")

Densidad altísima de NUNCA/SIEMPRE/JAMÁS en mayúsculas (>90 apariciones). La guía: cuando todo es
crítico, los marcadores dejan de informar, y *"el registro del prompt se vuelve el registro de la
salida: un prompt ansioso produce un modelo cauteloso y acartonado"* — exactamente la rigidez que el
negocio quiere quitar. El arreglo NO es borrar las reglas: es decirlas una vez, en volumen normal, con
su porqué al lado, y reservar el énfasis para las 4-5 de verdad críticas (plata y confianza: precios,
pagos, promesas).

## Lo que NO se toca (la "keep list" aplicada)

- **Todas las reglas de negocio con fallo demostrado en Sonnet 5** — la oficina inventada, el sábado
  confirmado sin consultar, el ITBMS doble, los códigos de zona filtrados: **reproducidos en este
  modelo, en producción, este mismo mes**. Se quedan (en volumen normal).
- **El conocimiento del catálogo que el modelo no puede saber**: que el catálogo escribe 30" con
  símbolo, que la 140XL es Canon y no HP, que "HP 410" existe como tóner y como Ink Tank, que los
  precios van sin ITBMS. Eso es contexto, no cruft — la guía lo protege explícito.
- **El formato de burbujas [[---]]**: es un contrato con el código (partirMensaje), no coreografía.
- **Los sufijos de modo** (ASSIST/CAPTURA/SWEEP): son contextuales por diseño — solo entran cuando
  aplica ese modo. Ya son la arquitectura correcta; solo se les quita lo que dupliquen.
- **El detalle de contrato en las descripciones de herramientas**: la guía advierte que el error más
  común es DESCRIBIR DE MENOS las tools. Las nuestras están bien; solo se les baja el volumen de caps.

## Estructura propuesta del prompt corto (~4,000 tokens)

1. **Identidad y estilo** (quién es, usted, WhatsApp, mensajes cortos, formato) — casi igual, -30% de volumen.
2. **Las 5 líneas rojas** (con su porqué, énfasis real): todo precio/stock sale de las herramientas ·
   pagos/facturación/quejas = humano, siempre · no prometas acciones que no puedes hacer · no
   interrumpas a un asesor activo · ante la duda, callar es mejor que inventar.
3. **Conocimiento del catálogo** (los hechos que solo QSP sabe) — compactado, sin coaching de estrategia.
4. **Enrutamiento en 6 líneas** (qué herramienta para qué tipo de pregunta) — el detalle de CÓMO usarla
   vive en la descripción de cada tool.
5. **Venta consultiva + captura de leads** — compactado.
6. **Canales especiales** (imágenes, PDF, audio) — compactado, con la regla fiscal dicha UNA vez para
   todos los canales.

## Plan de migración (sin big-bang)

| Fase | Qué | Riesgo | Validación |
|---|---|---|---|
| F1 | Quitar arqueología + duplicados exactos (lo que las tools ya dicen) | Bajo | suites regex + 10 conversaciones de prueba 1-a-1 |
| F2 | Mover el enrutamiento fino a las descripciones de herramientas | Medio | mismas pruebas + revisar `asistencia_handoff`/`abstencion` en telemetría 48h |
| F3 | Bajar el volumen (caps → prosa con porqué) sección por sección | Medio | prueba A/B informal: mismas 10 preguntas antes/después |

Cada fase es un commit reversible con su versión (v107, v108…) y el healthcheck de siempre. Si una
métrica de la telemetría se degrada (fugas, abstenciones erradas, respuestas sin tool), se revierte esa
fase sola.

## Nota final

La guía cierra con la advertencia que más nos aplica: *"remover es una hipótesis, no una conclusión"* —
cada recorte se prueba, y si algo regresa, se re-agrega **en su forma mínima**, no el original verboso.
