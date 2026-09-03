# Intercambio con soporte de Supabase (Rodrigo) — 01-sep-2026

> Contexto y análisis completo: `docs/seguridad-2026-09-01.md`.
>
> **Resultado: la reubicación se ACEPTA.** Rodrigo aclaró que no usan drop-and-recreate sino el cambio
> de `extrelocatable` en el catálogo + `ALTER EXTENSION ... SET SCHEMA`, que preserva los datos. La
> objeción del `CASCADE` sobre los 724 polígonos no aplica a ese método.

---

## 2. Respuesta final — luz verde (para enviar)

Hi Rodrigo,

That clears it up — thank you for the precision. Flipping `extrelocatable` and then relocating with
`ALTER EXTENSION ... SET SCHEMA` is a different animal from the standard drop-and-recreate path, and
you're right that it preserves everything: the `geometry` type keeps its OID, so our
`limites_admin.geom` column and its GIST index are untouched. Our concern doesn't apply to your
method. **Please go ahead.**

We also double-checked the one runtime dependency that survives a relocation — `ST_Transform` looks up
`spatial_ref_sys` via an unqualified SPI query, so it depends on `search_path` at execution time. We
don't use it anywhere: our geographic functions only call `ST_Contains`, `ST_MakePoint`, `ST_SetSRID`,
`ST_GeomFromGeoJSON` and `ST_Multi`, none of which read `spatial_ref_sys` at runtime. Combined with
the `search_path = public, extensions` change we already made, we don't expect anything to break.

No maintenance window needed from our side, and no preparation left to do. Two small asks:

1. **A heads-up when it's done**, so we can immediately re-verify the delivery-zone resolution
   (`select zona_por_coordenadas(9.01262, -79.529077872284);` should return zone *Z1 Centro*). Any
   time is fine — our business hours are Mon–Fri 9:00–17:00 Panama time (UTC-5) if you'd prefer to
   avoid them, but we're not asking you to schedule around it.
2. **A note on future upgrades.** Since PostGIS is normally non-relocatable, we assume its upgrade
   scripts may make assumptions about their own schema. Should we expect `ALTER EXTENSION postgis
   UPDATE` (or the dashboard upgrade button) to work normally afterwards, or is there anything we
   should come back to you for when it's time to move to a newer PostGIS version?

Thanks for handling this properly rather than just waving the advisor away.

Isaac — Quick Service Panamá
Project `jbigmlcalcwiphqeudxd` (qsp-wati-copilot)

---

## 1. Primer mensaje (histórico — ya enviado)

> Planteaba el riesgo del `CASCADE` y pedía el `revoke` a secas como alternativa. Rodrigo respondió
> aclarando el método. Se conserva por trazabilidad del ticket.

Hi Rodrigo,

Thank you for looking into this and for offering the schema relocation — that's the right root-cause
fix in principle. Before we schedule anything, we ran the numbers on our side and found something
that we think changes the recommendation. Two points:

**1. On our side, the `search_path` exposure is already closed.**

We had seven `SECURITY DEFINER` / pinned-`search_path` functions that resolve extension objects by
name — five using PostGIS (including `zona_por_coordenadas`, which resolves a delivery zone and its
fee from a customer's GPS pin, so it's on a live revenue path) and two using `unaccent`. All of them
had `search_path = public` hardcoded, so a relocation would have broken them at runtime.

We've changed all seven to `search_path = public, extensions`, which resolves correctly in **both**
layouts — today it finds the extension in `public`, and after any move it would find it in
`extensions`, with `public` keeping precedence so nothing about current behaviour changes. Verified
against live data with PostGIS still in `public`.

So there is **no maintenance window needed on our account for the `search_path` issue** — that part
is safe whenever you want to proceed.

**2. `postgis` is not relocatable, and the drop-and-recreate path would destroy production data.**

```sql
select extname, extrelocatable from pg_extension where extname = 'postgis';
-- postgis | false
```

Because the extension is marked `relocatable = false` in its control file,
`ALTER EXTENSION postgis SET SCHEMA extensions` is rejected regardless of privileges — so the only
route is `DROP EXTENSION postgis CASCADE` followed by `CREATE EXTENSION postgis SCHEMA extensions`.

That `CASCADE` would drop `public.limites_admin.geom`: 724 MultiPolygons (13 provinces, 76 districts,
635 *corregimientos* of Panama, ~4.5 MB) plus its GIST index. We've confirmed the source data for
those polygons is not held anywhere outside the database, and our delivery-zone resolution depends on
them.

Could you confirm whether you're describing that drop-and-recreate procedure, or a platform-side
method we don't have visibility into?

**What we'd like to request instead**

Given the above, the outcome we actually need is much narrower than a relocation: the advisor fires
because `anon` and `authenticated` hold write privileges on `public.spatial_ref_sys`
(`anon=arwdDxtm/supabase_admin`). We can't revoke them ourselves — the grants were issued by
`supabase_admin`, and `postgres` is not a member of that role, so a `REVOKE` from the SQL Editor
succeeds silently without changing the ACL (we verified this).

**Could you run the revoke on our behalf?**

```sql
revoke all on table public.spatial_ref_sys from anon, authenticated;
```

That closes the actual exposure (the table is writable by the Data API) in seconds, with no data
movement and no risk to our geometry column. `spatial_ref_sys` holds no application data — our
concern is purely that a leaked `anon` key could corrupt SRID 4326 and degrade the coordinate-based
zone resolution.

If the relocation is the only remediation you're able to support, we'll take it — but we'd want to
schedule it with a text-column backup of the geometries taken immediately beforehand, and we'd ask
you to confirm before and after so we can re-verify the geographic functions right away.

Thanks again,

Isaac — Quick Service Panamá
Project `jbigmlcalcwiphqeudxd` (qsp-wati-copilot)
