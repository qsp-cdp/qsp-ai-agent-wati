// Shopify → Shipday. Registrar en Shopify (Configuración → Notificaciones →
// Webhooks) con evento "Creación de pedidos" o "Preparación de pedidos":
//   https://<PROJECT_REF>.supabase.co/functions/v1/shopify-webhook
// Desplegar con --no-verify-jwt (Shopify no envía JWT de Supabase).
import {
  createShipdayOrder,
  json,
  normalizePhone,
  shopifyOrderToShipday,
  shouldDispatchShopifyOrder,
} from '../_shared/shipday.ts';
import { logJob, resolverTarifa, shipdayOrderIdDe, upsertPedido, type ZonaResuelta } from '../_shared/db.ts';

// Detecta la tarifa de envío GRATIS (>$300 aplica en todo el país). Por NOMBRE de la tarifa (término
// configurable por env), NO por precio $0 — así "Recoger en tienda" (también $0) NO cuenta como envío gratis.
function esEnvioGratis(shopifyOrder: any): boolean {
  const terms = (Deno.env.get('SHOPIFY_FREE_SHIP_TERMS') ?? 'gratis,free').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const lines: string[] = (shopifyOrder?.shipping_lines || []).map((l: any) => `${l?.title ?? ''} ${l?.code ?? ''}`.toLowerCase());
  return terms.length > 0 && lines.some((m) => terms.some((t) => m.includes(t)));
}

// ¿La zona resuelta es entrega de FLOTA PROPIA (→ Shipday)? v64: este es EL criterio de despacho para
// todo pedido de Shopify (antes solo rescataba envíos gratis): la ZONA de la dirección corregida decide,
// no el nombre de la tarifa. Cualquier otra cosa (interior/sin_servicio de v2, servientrega, retiro,
// asesor) → false: no es nuestra flota, va por Servientrega a la sucursal o lo ve el operador. `ambiguo`
// solo si TODAS las opciones son propias (ej. San Miguelito Z3/Z6, ambas $7 propia): la entrega es
// posible sea cual sea la zona real. Conservador: ante la duda, NO despacha.
function esFlotaPropia(zona: ZonaResuelta | null): boolean {
  if (!zona) return false;
  if (zona.estado === 'ok') return zona.ambito !== 'interior' && zona.metodo === 'propia';
  if (zona.estado === 'ambiguo') {
    const ops = zona.opciones ?? [];
    return ops.length > 0 && ops.every((o: any) => o?.metodo === 'propia');
  }
  return false;
}

// v32: RETIRO EN TIENDA. Señal fuerte = el pedido NO trae `shipping_address` (Shopify no pide dirección
// cuando el cliente elige recoger). El nombre de la tarifa NO sirve solo: en esta tienda es literalmente
// la dirección del local ("Via Ricardo J Alfaro, Plaza Aventura...") y no contiene la palabra retiro.
// Sin esta guardia el resolver clasificaría la dirección de FACTURACIÓN y marcaría flags de puro ruido.
function esRetiroEnTienda(shopifyOrder: any): boolean {
  const env = shopifyOrder?.shipping_address;
  const sinDireccion = !env || !String(env.address1 ?? '').trim();
  if (sinDireccion) return true;
  const lineas: string = (shopifyOrder?.shipping_lines || []).map((l: any) => `${l?.title ?? ''} ${l?.code ?? ''}`).join(' ').toLowerCase();
  return lineas.includes('recoger') || lineas.includes('retiro en tienda') || lineas.includes('pickup');
}

// v63: ¿la línea de envío elegida INDICA ciudad/domicilio? Se usa para (a) no leer como "interior" una
// línea de ciudad y (b) silenciar `direccion_no_reconocida` en pedidos de ciudad. Cuidado: la línea de
// ciudad de esta tienda dice "…zonas alejadas: retiro en punto Servientrega" (nota, NO método), por eso
// NO basta mirar "servientrega". Señales de ciudad: pasa el filtro de despacho, o el nombre trae domicilio
// / Ciudad de Panamá / San Miguelito. Independiente del filtro de despacho, que en piloto puede estar
// apuntando solo a la línea de prueba ("Local Delivery") y no a la línea real de ciudad.
function lineaIndicaCiudad(lineas: string, esLineaCiudad: boolean): boolean {
  return esLineaCiudad || lineas.includes('domicilio') || lineas.includes('ciudad de panam') || lineas.includes('san miguelito');
}

// v65: señal de ciudad por la PROVINCIA de la dirección, no por el nombre de la línea de envío.
//
// Caso real, pedido #8871 (24-ago): la línea era "¡Envío GRATIS! 🚚 Compra mayor a $300", que NO dice
// ciudad ni interior — el envío gratis aplica en ambos (en el interior, solo hasta sucursal o agente
// verde de Servientrega). Como además la dirección no resolvió zona, el pedido quedó sin despachar y
// nadie se enteró hasta que el cliente reclamó.
//
// La provincia sí discrimina, y se comprobó contra los pedidos reales: los de ciudad traen "Panamá"
// (#8871, #8865, #8861…) y los de interior traen la suya (#8870 "Bocas del Toro", #8863 "Chiriquí").
// "Panamá Oeste" queda FUERA a propósito: Arraiján y La Chorrera no son flota propia.
function provinciaEsMetro(shopifyOrder: any): boolean {
  const p = String(shopifyOrder?.shipping_address?.province ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return p === 'panama';
}

// F4 (v31): detecta ventas imposibles o mal ruteadas comparando la LÍNEA de envío elegida en el
// checkout con la zona real resuelta. NO bloquea nada — el agente humano maneja y asigna todos los
// pedidos; esto produce `envio_flag` (pedidos) + job_log `pedido_flag` + nota 🚨 en Shipday.
function calcularFlag(shopifyOrder: any, zona: ZonaResuelta | null, esLineaCiudad: boolean, gratis: boolean): string | null {
  if (!zona) return null;
  const lineas: string = (shopifyOrder?.shipping_lines || []).map((l: any) => `${l?.title ?? ''} ${l?.code ?? ''}`).join(' ').toLowerCase();
  // v63: la línea es INTERIOR solo si dice servientrega/sucursal y NO trae señal de ciudad. Sin este
  // guardián, la línea de ciudad (que menciona "Servientrega" en su nombre) marcaba falso
  // `eligio_interior_siendo_ciudad` en TODO pedido de ciudad — correcto aunque el filtro de despacho no la incluya.
  const esLineaInterior = (lineas.includes('servientrega') || lineas.includes('sucursal')) && !lineaIndicaCiudad(lineas, esLineaCiudad);
  if (zona.estado === 'sin_match') return 'direccion_no_reconocida';
  if (zona.estado === 'sin_servicio') return 'sin_servicio_comarca';
  if (zona.estado !== 'ok') return null; // ambiguo ya lleva su nota ⚠️; no es un imposible
  if (zona.ambito === 'interior' && esLineaCiudad) return 'eligio_ciudad_siendo_interior';
  if (zona.ambito !== 'interior' && esLineaInterior) return 'eligio_interior_siendo_ciudad';
  if (zona.ambito !== 'interior' && zona.metodo === 'retiro_agente_verde' && (esLineaCiudad || gratis)) return 'domicilio_imposible_z4a';
  return null;
}

async function verifyShopifyHmac(rawBody: string, hmacHeader: string): Promise<boolean> {
  const secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET');
  if (!secret || !hmacHeader) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const digest = btoa(String.fromCharCode(...new Uint8Array(sig)));
  if (digest.length !== hmacHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < digest.length; i++) diff |= digest.charCodeAt(i) ^ hmacHeader.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const rawBody = await req.text();
  const ok = await verifyShopifyHmac(rawBody, req.headers.get('X-Shopify-Hmac-Sha256') ?? '');
  if (!ok) return json({ error: 'Firma HMAC inválida' }, 401);

  try {
    const shopifyOrder = JSON.parse(rawBody);
    const order = shopifyOrderToShipday(shopifyOrder);
    // v64: DECISIÓN DE DESPACHO POR ZONA, no por el nombre de la tarifa. El diseño es: Shopify manda el
    // pedido → Supabase corrige/clasifica la dirección → si la entrega es de flota propia, va a Shipday
    // sin intervención humana. El filtro por nombre (shouldDispatchShopifyOrder) queda solo como señal
    // secundaria ("el cliente eligió línea de ciudad") para banderas y como respaldo si el resolver cae.
    // Despacha: metro flota propia · ambiguo con TODAS las opciones propias · sin_match con línea de
    // ciudad (Shipday geocodifica la dirección cruda). NO despacha: interior (Servientrega a sucursal),
    // Z4a (solo retiro en punto), comarca sin servicio, retiro en tienda — esos llevan bandera/registro.
    // F4 (v31): la zona se resuelve SIEMPRE con resolver_tarifa_v2 y se persiste en `pedidos` + `envio_flag`.
    const esLineaCiudad = shouldDispatchShopifyOrder(shopifyOrder);
    const gratis = esEnvioGratis(shopifyOrder);
    // v32: en retiro no hay dirección de entrega que clasificar — el pedido se registra sin zona ni flag.
    const retiro = esRetiroEnTienda(shopifyOrder);
    const zona = retiro ? null : await resolverTarifa(String(order.customerAddress ?? ''));
    const lineasEnvio: string = (shopifyOrder?.shipping_lines || []).map((l: any) => `${l?.title ?? ''} ${l?.code ?? ''}`).join(' ').toLowerCase();
    // La provincia solo rescata cuando la dirección NO nombró un lugar del interior: si el resolver la
    // descartó por eso (`fuera_del_area_metro`), manda ese motivo aunque Shopify diga provincia Panamá.
    // Ese guardián se aplica SOLO a este camino nuevo — el de la línea de envío se deja intacto para no
    // dejar de despachar nada que hoy sí se despacha.
    const provinciaRescata = provinciaEsMetro(shopifyOrder) &&
      (zona as unknown as { motivo?: string } | null)?.motivo !== 'fuera_del_area_metro';
    const sinMatchCiudad = zona?.estado === 'sin_match' &&
      (lineaIndicaCiudad(lineasEnvio, esLineaCiudad) || provinciaRescata);
    // RPC caído (zona null, no retiro) → respaldo al filtro por nombre: mejor despachar un pedido de
    // ciudad sin zona que perderlo en silencio. En retiro nunca se despacha.
    const despachar = retiro ? false : (zona ? (esFlotaPropia(zona) || sinMatchCiudad) : esLineaCiudad);
    if (gratis && !retiro) {
      // Traza del envío gratis (>$300, aplica en todo el país): en ciudad va a flota propia, en el
      // interior es retiro en la sucursal Servientrega. La zona ya decidió arriba; esto solo registra.
      await logJob('shopify-webhook', despachar ? 'envio_gratis_rescatado' : 'envio_gratis_omitido', true, {
        order: order.orderNumber, zona: zona?.zona ?? zona?.estado ?? 'n/d', total: shopifyOrder.total_price ?? null,
      });
    }
    const flagRaw = calcularFlag(shopifyOrder, zona, esLineaCiudad, gratis);
    // v63: en un pedido de CIUDAD, `direccion_no_reconocida` es ruido — Shipday geocodifica la dirección
    // cruda y el agente la maneja igual; no hay decisión de ruteo que corregir. Se SILENCIA del flag (no va
    // al correo ni a `envio_flag`), pero se deja registro APARTE en job_log para seguir mejorando el
    // diccionario de zonas (qué direcciones de ciudad no matchean). "Ciudad" se decide por el nombre de la
    // línea (domicilio/Ciudad de Panamá/San Miguelito), aunque el filtro de despacho no la incluya.
    const silenciarSinMatch = flagRaw === 'direccion_no_reconocida' && lineaIndicaCiudad(lineasEnvio, esLineaCiudad);
    const flag = silenciarSinMatch ? null : flagRaw;
    if (silenciarSinMatch) {
      await logJob('shopify-webhook', 'direccion_no_reconocida_silenciada', true, {
        order: order.orderNumber, zona: zona?.zona ?? zona?.estado ?? 'n/d',
        ambito: zona?.ambito ?? null, lugar: zona?.lugar ?? null, total: shopifyOrder.total_price ?? null,
      });
    }
    if (flag) {
      await logJob('shopify-webhook', 'pedido_flag', true, {
        order: order.orderNumber, flag, zona: zona?.zona ?? zona?.estado ?? 'n/d',
        ambito: zona?.ambito ?? null, lugar: zona?.lugar ?? null, total: shopifyOrder.total_price ?? null,
      });
    }
    // v48/v52/v31: conciencia de pedidos — ahora se escribe para TODO pedido (antes solo los
    // despachados): el copiloto gana visibilidad de interior/retiro y la zona+flag quedan consultables.
    await upsertPedido({
      wa_id: normalizePhone(String(order.customerPhoneNumber ?? '')),
      fuente: 'shopify',
      pedido_ref: String(order.orderNumber),
      shopify_order_id: shopifyOrder.id != null ? String(shopifyOrder.id) : null,
      estado: shopifyOrder.cancelled_at ? 'cancelado' : 'nuevo',
      estado_raw: shopifyOrder.financial_status ?? null,
      metodo: zona?.estado === 'ok' ? (zona.ambito === 'interior' ? 'servientrega' : (zona.metodo ?? 'propia')) : (despachar ? 'propia' : undefined),
      total_usd: Number(shopifyOrder.total_price) || null,
      resumen: (shopifyOrder.line_items || []).map((li: any) => `${li.quantity}x ${li.title}`).slice(0, 3).join(', ') || null,
      zona: zona?.estado === 'ok' ? (zona.ambito === 'interior' ? `INT ${[zona.provincia, zona.lugar && zona.lugar !== zona.provincia ? zona.lugar : null].filter(Boolean).join(' · ')}` : (zona.zona ?? null)) : null,
      zona_estado: zona?.estado ?? null,
      zona_ambito: zona?.estado === 'ok' ? (zona.ambito ?? 'metro') : null,
      tarifa_zona_usd: zona?.estado === 'ok' && zona.ambito !== 'interior' && zona.tarifa_usd != null ? Number(zona.tarifa_usd) : null,
      envio_flag: flag,
    });
    if (!despachar) {
      console.log(`Pedido ${shopifyOrder.order_number ?? shopifyOrder.id} omitido (${retiro ? 'retiro en tienda' : `zona ${zona?.zona ?? zona?.estado ?? 'sin resolver'} no es flota propia`})${flag ? ` · flag ${flag}` : ''}`);
      return json({ ok: true, skipped: true });
    }
    // v62: IDEMPOTENCIA. Shopify entrega at-least-once (reintenta ante timeout/no-2xx) y un pedido puede
    // disparar varios eventos (creación + preparación). Si este pedido YA tiene una orden en Shipday
    // registrada (pedidos.shipday_order_id, persistido tras el despacho de abajo), NO se recrea: evita la
    // doble asignación de repartidor. La lectura corre DESPUÉS del upsert de arriba, así que ve el estado
    // más reciente. (No atómica contra dos webhooks EXACTAMENTE simultáneos, escenario que Shopify no
    // produce: sus reintentos son secuenciales con backoff, y para entonces la marca ya está escrita.)
    const yaShipday = await shipdayOrderIdDe(String(order.orderNumber));
    if (yaShipday) {
      console.log(`Pedido Shopify ${order.orderNumber} ya despachado (shipday_order_id=${yaShipday}); no se recrea.`);
      return json({ ok: true, ya_despachado: yaShipday });
    }
    // v52: enriquecimiento de despacho. NO altera la dirección que Shipday geocodifica;
    // agrega la zona resuelta a las instrucciones para quien despacha. Best-effort:
    // si el RPC falla o tarda, `zona` es null y el pedido sale igual que antes.
    const nota: string[] = [];
    if (zona?.estado === 'ok' && zona.ambito === 'interior') {
      nota.push(`🚨 PEDIDO DEL INTERIOR (${[zona.provincia, zona.lugar && zona.lugar !== zona.provincia ? zona.lugar : null].filter(Boolean).join(' · ')}) con tarifa de ciudad — NO entregar con flota propia. Coordinar envío Servientrega con el cliente.`);
    } else if (zona?.estado === 'ok') {
      nota.push(`🗺️ ${zona.zona} · $${zona.tarifa_usd} · ${zona.metodo} · confianza ${zona.confianza}`);
      if (zona.sectores?.length) nota.push(`Sector: ${zona.sectores.join(' / ')}`);
      if (zona.metodo === 'retiro_agente_verde') {
        nota.push(`🚨 Z4a — aquí NO hay entrega a DOMICILIO: solo retiro en punto. ${zona.puntos_retiro ?? ''}`.trim());
      } else if (zona.metodo && zona.metodo !== 'propia') {
        nota.push(`⚠️ NO es flota propia (${zona.metodo}). ${zona.puntos_retiro ?? ''}`.trim());
      }
    } else if (zona?.estado === 'ambiguo') {
      const ops = (zona.opciones ?? [])
        .map((o: Record<string, unknown>) => `${o.zona} $${o.tarifa_usd}`)
        .join(' | ');
      nota.push(`⚠️ Zona ambigua — confirmar sector antes de despachar. Opciones: ${ops}`);
    } else if (zona?.estado === 'sin_match') {
      nota.push('⚠️ Dirección no reconocida en el diccionario de zonas — verificar antes de despachar.');
    } else if (zona?.estado === 'sin_servicio') {
      nota.push('🚨 Zona SIN SERVICIO de entrega (comarca) — coordinar con el cliente antes de despachar.');
    }
    if (nota.length) {
      order.deliveryInstruction = [order.deliveryInstruction, ...nota].filter(Boolean).join('\n');
    }
    const result = await createShipdayOrder(order);
    // v62: persistir la marca de despacho (idempotencia + trazabilidad). Shipday devuelve el id interno
    // de la orden creada como `orderId` (o `id`). Sin esto, el reintento de Shopify no tendría cómo saber
    // que el pedido ya se despachó y crearía un duplicado.
    const shipdayId = (result && (result as any).orderId != null) ? String((result as any).orderId)
      : (result && (result as any).id != null) ? String((result as any).id)
      : null;
    if (shipdayId) {
      await upsertPedido({
        wa_id: normalizePhone(String(order.customerPhoneNumber ?? '')),
        fuente: 'shopify',
        pedido_ref: String(order.orderNumber),
        shipday_order_id: shipdayId,
      });
    }
    console.log(`Pedido Shopify ${order.orderNumber} enviado a Shipday (zona: ${zona?.zona ?? zona?.estado ?? 'n/d'}${flag ? ` · flag ${flag}` : ''}${shipdayId ? ` · shipday ${shipdayId}` : ''})`);
    return json({ ok: true, shipday: result });
  } catch (err) {
    const e = err as Error;
    console.error('Error Shopify→Shipday:', e.message);
    await logJob('shopify-webhook', 'error', false, { error: (e.message ?? String(e)).slice(0, 300) });
    // v62: error de DATOS (payload malformado → JSON.parse lanza SyntaxError) → 200: es no-reintentable,
    // reintentarlo nunca funcionaría y las repeticiones terminarían DESACTIVANDO el webhook en Shopify.
    // Fallo TRANSITORIO (Shipday caído, red) → 5xx para que Shopify reintente; el reintento es idempotente
    // por shipday_order_id, así que no duplica la orden.
    const esErrorDeDatos = e instanceof SyntaxError;
    return json({ ok: false, error: e.message }, esErrorDeDatos ? 200 : 500);
  }
});
