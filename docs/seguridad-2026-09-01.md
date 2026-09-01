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
2. **Mover PostGIS al schema `extensions`.** Resuelve la causa raíz. Soporte la ofreció; **medida y
   desaconsejada** — ver la sección siguiente.
3. **Aceptar y documentar** (lo que este archivo hace), sabiendo que el advisor va a seguir marcándolo.

Recomendación: **la opción 1.** Un ticket a soporte, cero riesgo operativo.

## La respuesta de soporte (Rodrigo, 01-sep): mover PostGIS a `extensions`

Se midió antes de contestar. Dos hallazgos, uno cerrado y uno que cambia la recomendación.

### ✅ Cerrado: el `search_path` fijo (era el riesgo obvio)

**Siete** funciones nuestras resuelven una extensión POR NOMBRE y todas tenían `search_path=public`
—un search_path fijo no hereda nada del entorno, así que si la extensión se muda dejan de encontrar
`ST_Contains` / `unaccent` y **revientan en caliente**:

| Función | Extensión | Qué se cae si falla |
|---|---|---|
| `zona_por_coordenadas` | PostGIS | **la tarifa desde el pin de GPS** que manda el cliente |
| `ubicacion_por_coordenadas` | PostGIS | resolución de provincia/distrito/corregimiento |
| `resolver_ubicacion` | PostGIS | ídem |
| `cargar_limites_admin` / `cargar_limites_cod` | PostGIS | carga de polígonos |
| `buscar_catalogo` | `unaccent` | el motor de búsqueda de la réplica |
| `catalogo_actualizar_busq` | `unaccent` | **el TRIGGER del tsvector**: falla el UPDATE entero → el webhook de Shopify deja de sincronizar **en silencio** |

No era solo PostGIS: `unaccent` y `pg_trgm` **también** viven hoy en `public` y sí son reubicables.

**Cerrado el 01-sep** con `search_path = public, extensions` en las siete
(`20260901140000_search_path_tolerante_extensions.sql`). Esa lista resuelve bien en **ambos estados**
—hoy encuentra la extensión en `public`, después en `extensions`—, con `public` conservando la
precedencia: cero cambio de comportamiento hoy, y **soporte puede ejecutar su plan cuando quiera sin
ventana de mantenimiento**. Probado con PostGIS todavía en `public`: `zona_por_coordenadas(9.01262,
-79.5290)` → *Z1 Centro, $6, propia, Alta*; `buscar_catalogo('caja de mantenimiento Epson L5590')` →
la C9344.

No hizo falta tocar nada más: los índices (`limites_admin_geom_gix` GIST, `catalogo_titulo_trgm`
`gin_trgm_ops`) guardan la operator class **por OID** y viajan con la extensión; las columnas
generadas no usan extensiones; no hay vistas, defaults ni constraints nuestras que las llamen.

### 🔴 El que cambia la recomendación: PostGIS **no es reubicable**

```
select extname, extrelocatable from pg_extension where extname = 'postgis';
→ postgis | false
```

`ALTER EXTENSION postgis SET SCHEMA extensions` **falla**, y no por permisos: la extensión está
marcada `relocatable = false` en su control file (PostGIS hardcodea el schema en varios cuerpos de
función). **Ni un superusuario lo puede forzar.** Así que "mover PostGIS" no es el ALTER limpio que la
frase sugiere — es `DROP EXTENSION postgis CASCADE` + `CREATE EXTENSION postgis SCHEMA extensions`.

Y ese `CASCADE` se lleva **`limites_admin.geom`**: el mapa administrativo completo de Panamá,
**724 polígonos** (13 provincias + 76 distritos + 635 corregimientos, ~4,5 MB) y su índice GIST.
Verificado que **su fuente NO está versionada en ninguna rama del repo** — esos polígonos existen
únicamente dentro de la base. Sin ellos, la resolución de zona por coordenadas queda muerta.

**Si aun así se decide mover** (o si soporte lo hace de todos modos), el respaldo es simple y hay que
tomarlo ANTES — una columna de TEXTO sobrevive al `CASCADE` porque no depende de la extensión:

```sql
-- ANTES del drop
create table limites_admin_respaldo as
  select id, nivel, nombre, provincia, distrito, st_asewkt(geom) as geom_ewkt
  from limites_admin;
select count(*) from limites_admin_respaldo;   -- debe dar 724

-- DESPUÉS de recrear PostGIS en `extensions`
alter table limites_admin add column geom geometry(MultiPolygon, 4326);
update limites_admin l set geom = st_geomfromewkt(r.geom_ewkt)
  from limites_admin_respaldo r where r.id = l.id;
alter table limites_admin alter column geom set not null;
create index limites_admin_geom_gix on public.limites_admin using gist (geom);
select zona_por_coordenadas(9.01262, -79.529077872284);   -- → Z1 Centro, $6, propia, Alta
```

**Recomendación firme: seguir con la opción 1** (el revoke a secas). El agujero real que la alerta
nombra es que `anon` puede escribir en `spatial_ref_sys`; el revoke lo cierra por completo, en
segundos y sin tocar datos. La reubicación paga el mismo beneficio con un drop-cascade sobre 724
polígonos irrecuperables desde el repo — es cambiar un riesgo teórico por uno operativo real.

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
