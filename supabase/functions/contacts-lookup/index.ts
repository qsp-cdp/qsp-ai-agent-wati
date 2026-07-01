// Libreta de direcciones para el bot de WATI:
//   GET https://<PROJECT_REF>.supabase.co/functions/v1/contacts-lookup?phone=61112233
//   Header: x-wati-token: <WATI_WEBHOOK_TOKEN>
// Devuelve el contacto (nombre y dirección) para pre-llenar la captura.
import { json } from '../_shared/shipday.ts';
import { findContactByPhone } from '../_shared/db.ts';

Deno.serve(async (req) => {
  const expected = Deno.env.get('WATI_WEBHOOK_TOKEN');
  if (!expected || req.headers.get('x-wati-token') !== expected) {
    return json({ error: 'Token inválido' }, 401);
  }
  const phone = new URL(req.url).searchParams.get('phone') ?? '';
  try {
    const contact = await findContactByPhone(phone);
    if (!contact) return json({ found: false }, 404);
    return json({ found: true, contact });
  } catch (err) {
    console.error('Error en lookup:', (err as Error).message);
    return json({ found: false, error: (err as Error).message }, 500);
  }
});
