// WATI → Shipday: despacho de un pedido que gestiona un ASESOR desde el inbox.
//   POST https://<REF>.supabase.co/functions/v1/wati-order
//   Header: x-wati-token: <WATI_WEBHOOK_TOKEN>
//   Body: { telefono | waId, nombre?, pedido?, total?,
//           direccion?, referencia?, maps_url?,   ← opcionales: si faltan se leen de la libreta
//           notificar?, forzar? }
//
// Si la dirección no viene en el body, se busca en la libreta (la llena wati-address o la captura del
// copiloto). Crea la orden en Shipday y, salvo notificar=false, le avisa al cliente que su pedido va a
// preparación. El asesor manda; esta función NO bloquea despachos: informa y protege.
//
// v63 — tres endurecimientos sobre la versión anterior:
//   1. IDEMPOTENCIA: la plantilla disparada dos veces creaba DOS órdenes en Shipday (dos repartidores
//      al mismo destino). Ahora, si a este cliente ya se le creó una orden hace <15 min, se devuelve
//      la existente sin recrear. `forzar:true` permite saltarse la guarda a propósito.
//   2. TIMEOUT: la llamada a Shipday no tenía límite (createShipdayOrder ahora corta a los 15 s), así
//      que un Shipday lento colgaba la respuesta al asesor sin decirle nada.
//   3. CONCIENCIA DE ZONA: antes marcaba TODO como flota propia. Ahora resuelve la zona real y, si el
//      destino es del INTERIOR, Z4a (sin domicilio) o zona sin servicio, lo anota en la orden con 🚨 y
//      lo registra como bandera consultable — el asesor ve el problema en Shipday, no después.
// v64 — LA FICHA DE WATI COMO RESPALDO DE DIRECCIÓN. Caso real (03-sep-2026, conv 50760466239): el
//   asesor disparó "Despachar a Shipday" para un cliente RECURRENTE que tenía su dirección en la ficha
//   del contacto en WATI, pero sin fila en la libreta `contacts` → esta función respondió "no tiene
//   dirección registrada" y el chatbot cayó a su rama de captura vieja (tres preguntas + POST a
//   `wati-address`, una función que NO existe en esta rama: nunca hubo un rastro suyo en job_log).
//   Resultado: "⚠️ No pudimos guardar tu dirección" y el cliente preguntando "¿cada vez que les compro
//   debo repetir lo mismo?". Ahora, si la libreta no tiene la dirección, se lee de la ficha de WATI
//   (direccion_envio / referencia_envio / pin_envio / maps_envio) y la libreta se AUTOCURA con el upsert
//   que ya corre tras crear la orden. Solo si las DOS fuentes están vacías se devuelve el 400 — y ese
//   error ahora nombra el camino vivo (la captura del copiloto, `?captura=1`) y deja el teléfono en el log.
import { createShipdayOrder, direccionDesdeAtributosWati, HttpError, json, resolveMapsCoords, watiCaptureToShipday } from '../_shared/shipday.ts';
import { findContactByPhone, logJob, pedidoWatiReciente, resolverTarifa, upsertContactByPhone, upsertPedido } from '../_shared/db.ts';
import { getWatiContact, sendWatiSessionMessage } from '../_shared/watiapi.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const expected = Deno.env.get('WATI_WEBHOOK_TOKEN');
  if (!expected || req.headers.get('x-wati-token') !== expected) {
    return json({ error: 'Token inválido' }, 401);
  }
  try {
    const capture = await req.json();
    capture.telefono = String(capture.telefono ?? capture.waId ?? capture.wa_id ?? '').trim();
    if (!capture.telefono) throw new HttpError(400, 'Falta el teléfono (telefono o waId)');

    // v63 (1) — IDEMPOTENCIA. Antes de tocar Shipday: ¿ya se despachó a este cliente hace un momento?
    if (capture.forzar !== true) {
      const previo = await pedidoWatiReciente(capture.telefono, 15);
      if (previo) {
        await logJob('wati-order', 'despacho_duplicado_evitado', true, {
          telefono_final: String(capture.telefono).slice(-4), pedido_ref: previo.pedido_ref,
        });
        return json({
          ok: true, ya_despachado: true, orderNumber: previo.pedido_ref, shipday_order_id: previo.shipday_order_id,
          nota: 'Ya se creó una orden para este cliente en los últimos 15 minutos; no se recreó. Envía forzar:true si de verdad son dos entregas distintas.',
        });
      }
    }

    // Completa desde la libreta lo que no venga en el body.
    if (!String(capture.direccion ?? '').trim() || !String(capture.nombre ?? '').trim()) {
      const contacto = await findContactByPhone(capture.telefono);
      if (contacto) {
        if (!String(capture.direccion ?? '').trim()) {
          capture.direccion = contacto.address;
          if (!capture.referencia && contacto.referencia) capture.referencia = contacto.referencia;
          if (!capture.maps_url && contacto.maps_url) capture.maps_url = contacto.maps_url;
          // La libreta ya guardó las coordenadas resueltas al capturar: úsalas.
          if (capture.lat == null && contacto.latitude != null) capture.lat = contacto.latitude;
          if (capture.lng == null && contacto.longitude != null) capture.lng = contacto.longitude;
        }
        if (!String(capture.nombre ?? '').trim()) capture.nombre = contacto.name;
      }
      // v64 — RESPALDO: la ficha del contacto en WATI (ver cabecera). Un fallo de red aquí no es fatal:
      // se registra y se sigue con lo que haya; el 400 de abajo solo sale si tampoco hay dirección.
      if (!String(capture.direccion ?? '').trim()) {
        let ficha: { name: string; attrs: { name: string; value: string }[] } | null = null;
        try {
          ficha = await getWatiContact(capture.telefono);
        } catch (err) {
          await logJob('wati-order', 'ficha_wati_fallo', false, {
            telefono_final: String(capture.telefono).slice(-4), error: String((err as Error).message ?? err).slice(0, 150),
          });
        }
        const d = direccionDesdeAtributosWati(ficha?.attrs);
        if (d) {
          capture.direccion = d.direccion;
          if (!capture.referencia && d.referencia) capture.referencia = d.referencia;
          if (!capture.maps_url && d.maps_url) capture.maps_url = d.maps_url;
          if (!String(capture.nombre ?? '').trim() && ficha?.name) capture.nombre = ficha.name;
          // La libreta se autocura más abajo: upsertContactByPhone corre tras crear la orden con esta
          // dirección, así que el PRÓXIMO despacho ya no necesita venir a WATI.
          await logJob('wati-order', 'direccion_desde_wati', true, {
            telefono_final: String(capture.telefono).slice(-4), con_referencia: !!d.referencia, con_pin: !!d.maps_url,
            habia_fila_contacts: !!contacto,
          });
        }
      }
      if (!String(capture.direccion ?? '').trim()) {
        await logJob('wati-order', 'sin_direccion', false, {
          telefono_final: String(capture.telefono).slice(-4), habia_fila_contacts: !!contacto,
        });
        throw new HttpError(400, 'El cliente no tiene dirección ni en la libreta ni en su ficha de WATI: activa la captura del copiloto (?captura=1) y despacha cuando confirme');
      }
    }

    // Si el pedido trae un link de mapa pero aún no tenemos coordenadas
    // (p.ej. link corto pegado directo en el despacho), resuélvelas.
    if ((capture.lat == null || capture.lng == null) && capture.maps_url) {
      const coords = await resolveMapsCoords(capture.maps_url);
      if (coords) { capture.lat = coords.lat; capture.lng = coords.lng; }
    }

    const order = watiCaptureToShipday(capture);

    // v63 (3) — CONCIENCIA DE ZONA. El asesor decide, pero la orden sale con la verdad anotada:
    // el repartidor y quien despacha ven en Shipday si el destino NO es de flota propia.
    const zona = await resolverTarifa(String(capture.direccion ?? ''));
    const nota: string[] = [];
    let bandera: string | null = null;
    if (zona?.estado === 'ok' && zona.ambito === 'interior') {
      bandera = 'wati_despacho_al_interior';
      nota.push(`🚨 DESTINO DEL INTERIOR (${[zona.provincia, zona.lugar && zona.lugar !== zona.provincia ? zona.lugar : null].filter(Boolean).join(' · ')}) — NO es entrega de flota propia. Confirmar si debe ir por Servientrega antes de asignar repartidor.`);
    } else if (zona?.estado === 'ok' && zona.metodo === 'retiro_agente_verde') {
      bandera = 'wati_z4a_sin_domicilio';
      nota.push(`🚨 ${zona.zona} — aquí NO hay entrega a DOMICILIO, solo retiro en punto. ${zona.puntos_retiro ?? ''}`.trim());
    } else if (zona?.estado === 'sin_servicio') {
      bandera = 'wati_sin_servicio';
      nota.push('🚨 Zona SIN SERVICIO de entrega (comarca) — coordinar con el cliente.');
    } else if (zona?.estado === 'ok') {
      nota.push(`🗺️ ${zona.zona} · $${zona.tarifa_usd} · ${zona.metodo}`);
      if (zona.sectores?.length) nota.push(`Sector: ${zona.sectores.join(' / ')}`);
    } else if (zona?.estado === 'sin_match') {
      nota.push('⚠️ Dirección no reconocida en el diccionario de zonas — verificar antes de despachar.');
    }
    if (nota.length) order.deliveryInstruction = [order.deliveryInstruction, ...nota].filter(Boolean).join('\n');
    if (bandera) {
      await logJob('wati-order', 'pedido_flag', true, {
        order: order.orderNumber, flag: bandera, zona: zona?.zona ?? zona?.estado ?? 'n/d',
        ambito: zona?.ambito ?? null, lugar: zona?.lugar ?? null,
      });
    }

    // v63 (2): createShipdayOrder ya trae AbortSignal.timeout(15000) en _shared/shipday.ts.
    const result = await createShipdayOrder(order);
    const shipdayId = (result && (result as any).orderId != null) ? String((result as any).orderId)
      : (result && (result as any).id != null) ? String((result as any).id)
      : null;
    console.log(`Pedido WATI ${order.orderNumber} enviado a Shipday (zona: ${zona?.zona ?? zona?.estado ?? 'n/d'}${bandera ? ` · ${bandera}` : ''}${shipdayId ? ` · shipday ${shipdayId}` : ''})`);

    // v48: conciencia de pedidos — deja el pedido en `pedidos` para el copiloto. v63: se persiste
    // shipday_order_id (antes no se guardaba) para que la guarda de arriba pueda devolverlo, y el
    // método sale de la zona REAL en vez de asumir 'propia' siempre.
    await upsertPedido({
      wa_id: String(order.customerPhoneNumber ?? ''),   // watiCaptureToShipday ya normalizó a +507…
      fuente: 'wati',
      pedido_ref: String(order.orderNumber),
      estado: 'nuevo',
      metodo: zona?.estado === 'ok' ? (zona.ambito === 'interior' ? 'servientrega' : (zona.metodo ?? 'propia')) : 'propia',
      shipday_order_id: shipdayId,
      total_usd: capture.total != null ? Number(capture.total) || null : null,
      resumen: capture.pedido ? String(capture.pedido).slice(0, 120) : null,
      zona: zona?.estado === 'ok' ? (zona.ambito === 'interior' ? `INT ${[zona.provincia, zona.lugar].filter(Boolean).join(' · ')}` : (zona.zona ?? null)) : null,
      zona_estado: zona?.estado ?? null,
      zona_ambito: zona?.estado === 'ok' ? (zona.ambito ?? 'metro') : null,
      envio_flag: bandera,
    });

    try {
      await upsertContactByPhone({
        name: order.customerName as string,
        phone: order.customerPhoneNumber as string,
        address: capture.direccion,
        referencia: capture.referencia || null,
        maps_url: capture.maps_url || null,
        source: 'wati',
      });
    } catch (err) {
      // La orden ya salió; un fallo en la libreta no debe romper el flujo.
      console.error('No se pudo guardar el contacto:', (err as Error).message);
    }

    // Anuncio al cliente (best-effort). Shipday enviará su propio tracking cuando el repartidor tome
    // la orden; este mensaje cubre el "va a preparación", que Shipday no comunica.
    let notificado = false;
    if (capture.notificar !== false) {
      try {
        const nombre = String(capture.nombre || '').split(' ')[0] || '';
        await sendWatiSessionMessage(
          capture.telefono,
          `🛠️ ${nombre ? nombre + ', tu' : 'Tu'} pedido ya está en preparación para envío 📦\n` +
          `Entregaremos en: ${capture.direccion}\n` +
          `Te avisaremos por aquí cuando salga en camino. 🚚`
        );
        notificado = true;
      } catch (err) {
        console.error('No se pudo enviar el anuncio por WATI:', (err as Error).message);
      }
    }

    return json({ ok: true, orderNumber: order.orderNumber, shipday_order_id: shipdayId, zona: zona?.zona ?? zona?.estado ?? null, bandera, notificado, shipday: result });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error('Error WATI→Shipday:', (err as Error).message);
    await logJob('wati-order', 'error', false, { error: String((err as Error).message ?? err).slice(0, 300) });
    return json({ ok: false, error: (err as Error).message }, status);
  }
});
