# Respuesta a soporte de Supabase (Rodrigo) — 01-sep-2026

> Contexto: `docs/seguridad-2026-09-01.md`. Rodrigo ofreció mover PostGIS de `public` a `extensions`
> como remediación de raíz del advisor `rls_disabled_in_public` sobre `spatial_ref_sys`.
>
> Lo que pedimos: que hagan el **revoke** a secas. El pedido de reubicación queda como plan B, con la
> condición de que confirmen el procedimiento (PostGIS no es reubicable — el detalle está abajo).

---

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
