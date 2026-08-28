# Réplica del catálogo — puesta en marcha (fase 1)

> Pieza del "mapa abierto" (diseño: `docs/diseno-2026-08-27-replica-catalogo.md` en la rama de
> archivo). Fase 1 = tabla + sincronía + telemetría. El bot AÚN NO la lee — eso es la fase 2
> (`navegar_catalogo` + shadow de `buscar_producto`) — así que desplegar esto no cambia ninguna
> respuesta al cliente: es infraestructura pura, riesgo cero al canal.

## Orden de encendido

**1. Aplicar la migración** (SQL Editor): `supabase/migrations/20260828170000_catalogo_replica.sql`
— crea `catalogo` + `busqueda_sinonimos` (6 sinónimos semilla), extensiones `unaccent` y `pg_trgm`,
índices, RLS + grants. Validada end-to-end en PG16 local con los tres casos reales de la semana
(la C9344 agotada aparece por FTS, la 9730 por "11x17", la tinta de la L3250 por tag).

**2. Setear el secreto de la reconciliación** (uno nuevo, valor aleatorio fuerte):
```
npx supabase secrets set --project-ref jbigmlcalcwiphqeudxd "CATALOGO_SYNC_KEY=<valor aleatorio>"
```
(⚠️ PowerShell: `--project-ref` primero y el par entre comillas.) Sin este secreto la función
rechaza toda reconciliación — fail-closed a propósito. Los demás secretos que usa **ya existen**:
`SHOPIFY_WEBHOOK_SECRET` (firma HMAC, el mismo del webhook de pedidos), `SHOPIFY_ADMIN_TOKEN` +
`SHOPIFY_ADMIN_API_BASE` (solo lectura, `read_products` ya en el scope).

**3. Desplegar `catalogo-sync`** — al fusionar el PR, GitHub Actions la despliega sola (pasa por las
4 suites de pruebas primero). Verificar el healthcheck:
```
https://jbigmlcalcwiphqeudxd.functions.supabase.co/catalogo-sync
→ { hmac_configurado: true, sync_key_configurada: true, admin_configurado: true }
```

**4. Primera reconciliación a mano** (siembra el catálogo completo, ~1-2 min):
```
https://jbigmlcalcwiphqeudxd.functions.supabase.co/catalogo-sync?reconciliar=1&key=<CATALOGO_SYNC_KEY>
→ { productos: ~N, paginas: ~N/100, archivados: 0, parcial: false }
```
Y comprobar en SQL que los casos de la semana están:
```sql
select status, count(*) from catalogo group by 1;
select titulo from catalogo where busq @@ to_tsquery('spanish', unaccent('caja & mantenimiento & l5590'));
select titulo from catalogo where exists (select 1 from unnest(tags) t where t ilike '%gx7010%');
```

**5. Crear los webhooks en Shopify** (Admin → Configuración → Notificaciones → Webhooks → Crear):
| Evento | URL |
|---|---|
| Creación de producto (`products/create`) | `https://jbigmlcalcwiphqeudxd.functions.supabase.co/catalogo-sync` |
| Actualización de producto (`products/update`) | (la misma) |
| Eliminación de producto (`products/delete`) | (la misma) |

Formato JSON, versión API la más reciente estable. ⚠️ Verificar que la **firma** que muestra esa
página (al pie: "Todos tus webhooks se firmarán con…") es la misma que ya valida el webhook de
pedidos — si el de pedidos funciona hoy con `SHOPIFY_WEBHOOK_SECRET`, es la misma y no hay nada que
tocar. Probar: editar cualquier producto (un tag) → debe aparecer `catalogo_sync {tema:
products/update}` en job_log y la fila actualizada.

**6. Programar la reconciliación nocturna** (SQL Editor; 07:07 UTC = 2:07 a.m. Panamá):
```sql
select cron.schedule(
  'catalogo-reconciliar-nocturno',
  '7 7 * * *',
  $$ select net.http_get(
       url := 'https://jbigmlcalcwiphqeudxd.functions.supabase.co/catalogo-sync?reconciliar=1&key=REEMPLAZA_CATALOGO_SYNC_KEY'
     ) $$
);
```

## Cómo leer su salud

```sql
-- ¿La sincronía está viva? (webhooks del día + última reconciliación)
select action, ok, count(*),
       to_char(max(created_at) at time zone 'America/Panama','DD HH24:MI') as ultimo
from job_log where function_name = 'catalogo-sync' and created_at > now() - interval '1 day'
group by 1, 2;

-- ¿Cuánta deriva corrigió anoche? (en régimen debe tender a 0 productos "nuevos" y 0 archivados)
select detail from job_log where action = 'catalogo_reconciliado' order by created_at desc limit 3;

-- Frescura de la réplica
select max(sincronizado_at) as ultima_sync, count(*) filter (where status = 'active') as activos,
       count(*) filter (where status <> 'active') as no_activos
from catalogo;
```

## Qué NO hace la fase 1 (a propósito)

- El bot no la consulta todavía (fase 2: `navegar_catalogo` + `BUSQUEDA_REPLICA=shadow`).
- No guarda stock — línea roja del diseño: un número de inventario replicado envejece en minutos y
  un bot "no inventar" no puede citarlo. El stock sigue saliendo en vivo.
- La frescura aún no aparece en el correo del resumen — se cablea junto con la fase 2, leyendo las
  mismas filas `catalogo_reconciliado` de arriba.
