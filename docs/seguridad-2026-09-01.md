# Alerta de seguridad de Supabase (01-sep-2026) — qué era, qué se arregló y qué queda

## La alerta

Correo de Supabase, severidad CRITICAL: *"Table publicly accessible — Anyone with your project URL can
read, edit, and delete all data in this table because Row-Level Security is not enabled"*
(`rls_disabled_in_public`), proyecto `qsp-wati-copilot` (`jbigmlcalcwiphqeudxd`).

## Qué encontró la investigación

Dos tablas sin RLS en `public`, y **una tercera cosa peor que la alerta no menciona**:

| Hallazgo | Gravedad real | Estado |
|---|---|---|
| **TRUNCATE a `anon`/`authenticated` en 17 tablas del negocio** | 🔴 La peor | ✅ **CERRADO** |
| `_stri_staging` sin RLS | 🟡 Baja (anon no tenía ningún privilegio sobre ella) | ✅ **CERRADO** |
| `spatial_ref_sys` sin RLS y escribible por anon (lo que la alerta nombra) | 🟠 Media | ⛔ **NO se puede cerrar desde SQL** — ver abajo |

### 🔴 El hallazgo grave: TRUNCATE saltaba el modelo de seguridad entero

17 tablas —`messages`, `conversations`, `pedidos`, `contacts`, `catalogo`, `store_facts`,
`zonas_entrega`, `sectores_entrega`, `ref_codes`, `handoffs`, `job_log`…— tenían **TRUNCATE**
otorgado a `anon` y `authenticated`.

**RLS no protege contra TRUNCATE.** Las políticas filtran filas en SELECT/INSERT/UPDATE/DELETE; un
TRUNCATE vacía la tabla completa sin pasar por ellas. El modelo de la casa ("RLS on sin policies =
solo service_role") tenía por ahí un agujero por el que se podía borrar **todo el historial de
conversaciones y el catálogo entero** sin violar una sola política.

Ya estaba anotado como **P2-a en la auditoría del 27-ago** y seguía abierto. Cerrado ahora:
`revoke truncate, references, trigger … from anon, authenticated` sobre todas las tablas propiedad de
`postgres`. `service_role` —el único rol que usan las Edge Functions— no se tocó.

### ⛔ `spatial_ref_sys`: por qué NO se puede arreglar desde el SQL Editor

Es la tabla de sistema de PostGIS (8.500 sistemas de coordenadas). Su ACL:

```
anon=arwdDxtm/supabase_admin
```

El permiso lo otorgó **`supabase_admin`**, que es su dueño. En Postgres solo puede revocar quien
otorgó, el dueño o un superusuario — y el rol `postgres` (con el que corre el SQL Editor y el MCP)
**no es miembro de `supabase_admin`** (verificado). Por eso un `revoke` desde aquí **corre sin error y
no hace nada**: es un no-op silencioso. Lo comprobé: tras ejecutarlo, `anon` seguía con DELETE.

**Causa raíz:** la extensión PostGIS está instalada en el schema `public` (el schema `extensions`
existe pero no se usó). Por eso queda expuesta a la Data API.

**Riesgo real, sin dramatizar:** no contiene datos del negocio ni PII — son definiciones de sistemas
de coordenadas. Pero `zona_por_coordenadas` (la que resuelve la zona de entrega desde un pin de GPS)
depende de PostGIS: corromper el SRID 4326 degradaría o rompería la resolución de zonas, y con ella
las tarifas por coordenadas. Requiere además que alguien tenga la clave `anon` del proyecto.

**Las tres salidas posibles** (ninguna ejecutable desde SQL, en orden de preferencia):

1. **Pedirle a soporte de Supabase** que revoque `anon`/`authenticated` sobre `public.spatial_ref_sys`.
   Es la vía limpia y sin riesgo. Es un pedido común: casi todo proyecto con PostGIS en `public`
   recibe este mismo advisor.
2. **Mover PostGIS al schema `extensions`.** Resuelve la causa raíz, pero requiere privilegios
   elevados y **tocaría todas nuestras funciones geográficas** (habría que ajustar `search_path` de
   `zona_por_coordenadas`, `ubicacion_por_coordenadas`, `cargar_limites_*`). Con el sistema en vivo y
   despachando pedidos, no lo haría sin una ventana de mantenimiento y pruebas en local.
3. **Aceptar y documentar** (lo que este archivo hace), sabiendo que el advisor va a seguir marcándolo.

Recomendación: **la opción 1.** Un ticket a soporte, cero riesgo operativo.

## Lo que quedó verificado tras el arreglo

```
tablas del negocio con TRUNCATE expuesto ......... 0   (antes: 17)
tablas nuestras sin RLS .......................... 0   (antes: 1)
mensajes en la base .............................. 70.753  (intactos)
productos en el catálogo ......................... 1.633   (intactos)
```

Y las funciones críticas siguen respondiendo: `resolver_tarifa_v2` (metro **e** interior),
`asistencia_pendientes` (el barrido) y `buscar_catalogo` (incluida la C9344 agotada).

**Nota sobre `lugares_interior`:** `service_role` no tiene SELECT directo sobre ella (es previo, no lo
causó este cambio) y **no hace falta**: `resolver_tarifa_v2` es `security definer`, así que corre con
los privilegios de su dueño. Verificado con David y Santiago → `ok / interior`.

## Para la próxima vez

El advisor de seguridad de Supabase (Dashboard → Advisors) vale la pena revisarlo después de cada
cambio de esquema. Esta alerta llegó por correo cuatro días después de crear la tabla `catalogo`, y
aunque `catalogo` estaba bien (RLS activa desde su migración), la revisión destapó un agujero de
meses en 17 tablas. La auditoría del 27-ago ya lo había visto y no se había cerrado.
