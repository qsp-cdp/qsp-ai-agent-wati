// Port Deno de src/shipday.js (la versión Node tiene las pruebas unitarias;
// si cambias lógica aquí, replica el cambio allá y corre `npm test`).
const SHIPDAY_BASE_URL = 'https://api.shipday.com';

export interface Pickup {
  name: string;
  address: string;
  phone: string;
}

export function defaultPickup(): Pickup {
  return {
    name: Deno.env.get('PICKUP_NAME') || 'Quick Service Panama',
    address: Deno.env.get('PICKUP_ADDRESS') || '',
    phone: Deno.env.get('PICKUP_PHONE') || '',
  };
}

export async function createShipdayOrder(order: Record<string, unknown>) {
  const apiKey = Deno.env.get('SHIPDAY_API_KEY');
  if (!apiKey) throw new Error('Falta el secreto SHIPDAY_API_KEY');
  const res = await fetch(`${SHIPDAY_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(order),
    // v62: timeout — es la única llamada externa del despacho sin límite, y va al final de una cadena
    // de 5+5+8s. Sin esto, si Shipday tarda, Shopify da el webhook por fallido y reintenta (→ duplicado).
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shipday respondió ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function shouldDispatchShopifyOrder(
  shopifyOrder: any,
  filter = Deno.env.get('SHOPIFY_DELIVERY_FILTER'),
): boolean {
  const terms = (filter || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!terms.length) return true;
  const methods: string[] = (shopifyOrder.shipping_lines || []).map(
    (l: any) => `${l.title ?? ''} ${l.code ?? ''}`.toLowerCase(),
  );
  return methods.some((m) => terms.some((t) => m.includes(t)));
}

export function shopifyOrderToShipday(shopifyOrder: any, pickup: Pickup = defaultPickup()) {
  const shipping = shopifyOrder.shipping_address || shopifyOrder.billing_address || {};
  const customer = shopifyOrder.customer || {};
  const name =
    shipping.name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    'Cliente';
  const addressParts = [shipping.address1, shipping.address2, shipping.city, shipping.province, shipping.country]
    .filter(Boolean)
    .join(', ');

  const order: Record<string, unknown> = {
    orderNumber: String(shopifyOrder.order_number ?? shopifyOrder.name ?? shopifyOrder.id),
    customerName: name,
    customerAddress: addressParts,
    customerPhoneNumber: shipping.phone || shopifyOrder.phone || customer.phone || '',
    customerEmail: shopifyOrder.email || customer.email || undefined,
    restaurantName: pickup.name,
    restaurantAddress: pickup.address,
    restaurantPhoneNumber: pickup.phone,
    totalOrderCost: Number(shopifyOrder.total_price) || undefined,
    deliveryFee: Number(shopifyOrder.total_shipping_price_set?.shop_money?.amount) || undefined,
    deliveryInstruction: shopifyOrder.note || undefined,
    orderSource: 'Shopify',
    orderItem: (shopifyOrder.line_items || []).map((li: any) => ({
      name: li.title,
      quantity: li.quantity,
      unitPrice: Number(li.price) || 0,
    })),
  };
  if (shipping.latitude != null && shipping.longitude != null) {
    order.deliveryLatitude = Number(shipping.latitude);
    order.deliveryLongitude = Number(shipping.longitude);
  }
  return order;
}

export interface WatiCapture {
  nombre?: string;
  telefono?: string;
  direccion?: string;
  referencia?: string;
  maps_url?: string;
  lat?: number | null;   // coordenadas ya resueltas (tienen prioridad sobre maps_url)
  lng?: number | null;
  pedido?: string;
  total?: string | number;
  orderNumber?: string;
  items?: Array<{ name?: string; quantity?: number; unitPrice?: number } | string>;
}

// Extrae lat/lng de un link de Google Maps (formatos @lat,lng · ?q=lat,lng ·
// ll=lat,lng · !3dlat!4dlng · geo:lat,lng de la ubicación nativa de WhatsApp).
export function parseMapsCoords(url?: string): { lat: number; lng: number } | null {
  if (!url) return null;
  const s = String(url);
  const m =
    s.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) ||
    s.match(/[?&](?:q|ll|query|daddr|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ||
    s.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) ||
    s.match(/^geo:(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i) ||
    // último recurso: dos números tipo coordenada separados por coma
    s.match(/(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// ¿El valor es una ubicación de verdad? Solo aceptamos link http(s), URI geo:
// (ubicación nativa de WhatsApp) o un par de coordenadas suelto. Todo lo demás
// — "no", "no lo tengo", "ahí mismo" — es prosa, no un pin: filtrar por FORMA
// evita la carrera interminable contra una lista de palabras negativas.
export function looksLikeLocation(value?: unknown): boolean {
  const s = String(value ?? '').trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s) || /^geo:/i.test(s)) return true;
  return parseMapsCoords(s) != null;
}

// Los links cortos (maps.app.goo.gl, goo.gl/maps) no traen coordenadas: hay
// que seguir la redirección para llegar a la URL larga que sí las tiene.
// Devuelve las coordenadas o null (nunca lanza: si falla, seguimos sin pin).
export async function resolveMapsCoords(url?: string, fetchFn = fetch): Promise<{ lat: number; lng: number } | null> {
  const direct = parseMapsCoords(url);
  if (direct || !url) return direct;
  if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(url)) return null;
  try {
    // manual: leemos el Location del 3xx sin seguirlo (más rápido y evita cargar la página)
    let current = url;
    for (let i = 0; i < 5; i++) {
      const res = await fetchFn(current, {
        method: 'GET',
        redirect: 'manual',
        // UA de navegador: Google puede responder distinto a clientes "raros"
        // desde IPs de datacenter.
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
        signal: AbortSignal.timeout(6000),
      });
      const loc = res.headers.get('location');
      if (loc) {
        const coords = parseMapsCoords(loc);
        if (coords) {
          if (res.body) await res.body.cancel();
          return coords;
        }
        current = new URL(loc, current).href;
        if (res.body) await res.body.cancel();
        continue;
      }
      // sin redirección: intentar parsear el cuerpo (algunos short links resuelven vía HTML)
      const body = await res.text();
      const fromBody = parseMapsCoords(body);
      // Solo se registra el fallo (sin datos de ubicación del cliente): útil
      // para detectar bloqueos de Google al datacenter (403/429/consent).
      if (!fromBody) console.log(`resolveMaps sin coordenadas: HTTP ${res.status}, body ${body.length} bytes`);
      return fromBody;
    }
    console.log('resolveMaps: se agotaron los saltos de redirección');
  } catch (err) {
    console.log(`resolveMaps error: ${String(err).slice(0, 200)}`);
  }
  return null;
}

export function watiCaptureToShipday(capture: WatiCapture, pickup: Pickup = defaultPickup()) {
  const required = ['nombre', 'telefono', 'direccion'] as const;
  const missing = required.filter((f) => !String(capture?.[f] ?? '').trim());
  if (missing.length) {
    throw new HttpError(400, `Faltan campos obligatorios: ${missing.join(', ')}`);
  }
  if (looksUnresolved(capture.telefono) || looksUnresolved(capture.direccion)) {
    throw new HttpError(400, 'Variable de WATI sin resolver en el pedido (teléfono o dirección)');
  }
  if (!isValidPhone(normalizePhone(capture.telefono!))) {
    throw new HttpError(400, `Teléfono inválido: "${normalizePhone(capture.telefono!)}"`);
  }
  const direccion = [capture.direccion, capture.referencia].filter(Boolean).join(' — ');
  const items = Array.isArray(capture.items)
    ? capture.items.map((it) =>
        typeof it === 'string'
          ? { name: it, quantity: 1, unitPrice: 0 }
          : { name: it.name ?? '', quantity: Number(it.quantity) || 1, unitPrice: Number(it.unitPrice) || 0 },
      )
    : undefined;

  const instrucciones = [
    capture.pedido ? `Pedido: ${capture.pedido}` : '',
    capture.maps_url ? `📍 Mapa: ${capture.maps_url}` : '',
  ].filter(Boolean).join('\n');
  const coords = (capture.lat != null && capture.lng != null)
    ? { lat: Number(capture.lat), lng: Number(capture.lng) }
    : parseMapsCoords(capture.maps_url);

  return {
    orderNumber: capture.orderNumber || `WATI-${Date.now()}`,
    customerName: String(capture.nombre).trim(),
    customerAddress: direccion,
    customerPhoneNumber: normalizePhone(capture.telefono!),
    restaurantName: pickup.name,
    restaurantAddress: pickup.address,
    restaurantPhoneNumber: pickup.phone,
    totalOrderCost: capture.total != null ? Number(capture.total) : undefined,
    deliveryInstruction: instrucciones || undefined,
    orderSource: 'WATI',
    ...(coords ? { deliveryLatitude: coords.lat, deliveryLongitude: coords.lng } : {}),
    ...(items ? { orderItem: items } : {}),
  };
}

export function normalizePhone(phone: string | number): string {
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  // Panamá: celulares de 8 dígitos → anteponer +507
  if (/^\d{7,8}$/.test(digits)) return `+${digits.length <= 8 ? '507' : ''}${digits}`;
  return `+${digits}`;
}

// Detecta un valor que WATI no resolvió: llegó como plantilla literal
// (@variable o {{variable}}). Evita guardar basura y falsos éxitos.
export function looksUnresolved(value: unknown): boolean {
  const s = String(value ?? '');
  return s.startsWith('@') || s.includes('{{') || s.includes('}}');
}

// Teléfono ya normalizado válido: + seguido de 8 a 15 dígitos.
export function isValidPhone(phone: string): boolean {
  return /^\+\d{8,15}$/.test(phone);
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
