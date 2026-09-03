# Notificaciones de estado de Shipday: APLAZADO (28-ago-2026)

> Decisión de Isaac tras revisar los datos reales y la configuración de Shipday. Se aplaza construir
> los mensajes propios. Este archivo guarda lo averiguado para que la próxima sesión no re-investigue.

## Lo que había

Cuatro mensajes ya escritos en `_shared/status.ts` (asignado 📦 · en camino 🛵 · entregado ✅ ·
fallido ⚠️), enviados desde `shipday-status` detrás de la bandera `WATI_NOTIFY === 'true'`.

## Lo que se descubrió (con datos de 30 días)

1. **No se está enviando ninguno.** 98 eventos de Shipday procesados en 7 días y CERO mensajes
   automáticos en los hilos. Los que parecían serlo eran asesores escribiendo a mano o asistencias
   del copiloto. Causa probable: `WATI_NOTIFY` no vale exactamente `true` (la comparación es
   estricta; `1`/`TRUE`/`si` fallan en silencio). NO se verificó ni se corrigió — se aplazó.
2. **El mensaje de "asignado" es código muerto.** En 30 días Shipday nunca mandó `ORDER_ASSIGNED`
   ni `ORDER_ACCEPTED`.
3. **Frecuencia real de eventos (30 d):** `ORDER_POD_UPLOAD` 46 · `ORDER_INSERTED` 8 ·
   `ORDER_INCOMPLETE` 7 · `ORDER_UPDATED` 5 · `ORDER_UNASSIGNED` 2 · **`ORDER_ONTHEWAY` 1** ·
   `ORDER_COMPLETED` 1.
   → El "va en camino" casi no se dispararía: parece que los repartidores no marcan el inicio de
   ruta en la app y van directo a entregar y subir la foto. **Es un tema de proceso con el equipo de
   reparto, no de código** — cualquier diseño de notificaciones depende de que esa marca exista.
4. **Los pedidos por Servientrega ya están excluidos** por diseño: `esFlotaPropia` los filtra en el
   despacho y nunca entran a Shipday. Verificado: 0 pedidos `metodo='servientrega'` con evento de
   Shipday. No hacía falta ningún cambio.

## Por qué se aplaza: Shipday YA notifica por WhatsApp

En Shipday → Notificaciones para el cliente (captura del 28-ago):

- **Compartir ETA del cliente: ENCENDIDO, con WhatsApp y correo.** El cliente recibe una página de
  seguimiento en vivo, con ETA en minutos y el nombre del conductor. Disparo configurado en "el
  pedido está en camino". → **Nuestro mensaje 🛵 sería el mismo aviso dos veces, desde dos números
  distintos.**
- **Recibo de entrega:** encendido solo por correo.
- **Alertas de retraso: APAGADO.** ← lo más valioso que está sin usar; avisa solo cuando el pedido
  se atrasa, que es justo lo que dispara el "¿dónde está mi pedido?" en WhatsApp.
- **Comentarios sobre la entrega:** apagado.

## El aviso de "LLEGÓ" (lo que Isaac quería): NO existe nativo

Requisito: avisar cuando el repartidor está AFUERA del local, para que el cliente salga a recibir.

- El desplegable de disparo de Shipday solo ofrece tres momentos: *aceptado por un conductor* ·
  *después de recogido* · *en camino*. **No hay alerta de proximidad ni geocerca.**
- El webhook tampoco manda ningún evento de llegada (vocabulario capturado en
  `docs/shipday/webhook-payload-real.md`).
- Construirlo requeriría consultar la posición del repartidor en bucle: caro, frágil y dependiente
  de que la app esté abierta con GPS. **No recomendado** sin antes medir cuán frecuente es el
  problema (¿cuántas veces el repartidor espera afuera sin que el cliente baje?).

## Recomendación registrada (para cuando se retome)

1. **Encender "Alertas de retraso"** en Shipday — un clic, cubre el caso de mayor fricción.
2. **Evaluar mover "Recibo de entrega" a WhatsApp** si el panel lo permite.
3. **Eliminar los 4 mensajes propios** en vez de completarlos: duplican lo que Shipday ya hace mejor
   (con ETA en vivo). La única excepción defendible sería **fallido**, porque Shipday no avisa de
   entregas fallidas — y son 7 en 30 días.
4. Lo que sí aporta valor del lado nuestro **ya funciona**: la tool `estado_pedido` responde bien
   cuando el cliente pregunta (verificado el 25-ago: *"Su pedido 75215 va en camino 🚚, puede
   seguirlo aquí…"*). Ese es el caso donde el bot gana: responder a la pregunta, no empujar avisos.
5. Antes de cualquier diseño nuevo: **resolver con el equipo de reparto que marquen el inicio de
   ruta** en la app. Sin esa marca no hay "en camino" que notificar.
