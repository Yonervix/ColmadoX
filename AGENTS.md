# AGENTS.md

## Project
Angular 22 (standalone components, signals, `@`-control-flow templates) + Supabase/Postgres. Spanish-language POS/inventory for a Dominican colmado ("ColmadoX"). Backend is a single source-of-truth file: `supabase/schema.sql`.

## Commands (verification)
- Dev: `ng serve` (port 4200) — hits the real Supabase project.
- **Verify with `ng build`**: there is no test suite (0 spec files; generators use `skipTests`). `ng test` is not usable.
- Test the PWA locally after build: `npx http-server dist/colmadox` (service worker needs localhost/HTTPS).

## Critical: schema changes are manual
`schema.sql` does not auto-apply. Every change must also be run by a human in Supabase → SQL Editor, or live DB and app drift (functions/vistas go stale silently).
- Supabase SQL Editor **aborts at the first error**; everything after the failing statement never runs. Fix the offender and re-run the whole block — functions use `create or replace`, and `add column if not exists` is idempotent.
- `create or replace view` cannot add columns mid-select or reorder them (error `42P16`) — new columns must be appended at the END.

## Architecture
- Features in `src/app/features/{caja, compras, fiado, gastos, inicio, info, inventario, mermas, reportes, ventas}` as `{name}.component.{ts,html}` + `{name}.service.ts`. Shared UI in `src/app/componentes/` (Spanish kebab names) and `src/app/layout/`.
- All business mutations go through **`security definer` RPC functions** (e.g. `registrar_venta`, `registrar_compra`, `abrir_caja`, `cerrar_conteo`), always declared `set search_path = public`. Client calls `supabase.rpc('fn_name', { p_... })`. Never insert/update financial rows directly from the client — extend the RPC instead.
- Roles: `profiles.rol` (`'jefe' | 'empleado'`), auto-created by trigger `handle_new_user` from `raw_user_meta_data.rol`. `is_jefe()` gates jefe-only features (compras, gastos, mermas, balance/ganancia). Employee flows must keep working — previous breakage happened because caja funcions checked `is_jefe()` and now only check `auth.uid()`.
- **Business "today" = `public.fecha_local()`** = `now() at time zone 'America/Santo_Domingo'` (fixed -04:00, no DST). Never use browser/device timezone or UTC for "today" logic; frontend uses -04:00 helpers. No sale without an open caja (`abrir_caja` same day); `ventas.numero` is assigned by a before-insert trigger.

## Product stock semantics — get this right
`productos.stock` is one integer in *sell units*. `tipo` enum: `unidad | paquete | caja`. Column `unidades_por_paquete numeric`:
- `unidad`: normal; sales deduct stock.
- `paquete`/`caja` + `unidades_por_paquete > 0`: "con conteo" (e.g. yogurt = 13). Purchase enters package count; stock += qty × por_paquete. Sales deduct units.
- `paquete`/`caja` + `unidades_por_paquete` NULL/0: "sin conteo" (e.g. mints sold loose). Stock counts packages; POS sells without decrementing; packages are removed manually via Mermas (motivo "Se acabó el paquete").
- `registrar_venta`, `registrar_compra`, and view `productos_venta` all read `unidades_por_paquete` — keep all three consistent.

## Conventions
- Spanish UI text; **no code comments**; no emojis in code (icons are inline SVG via `layout-icon.component.ts`).
- Tailwind 3 (`tailwind.config.js`): fonts Sora (display) / Inter (body) from Google Fonts, custom shadows `soft`/`card`, emerald palette.
- Single `src/environments/environment.ts`: Supabase URL + **anon key** (deliberately public, safe to commit). Per-client deployment = new Supabase project, apply schema.sql, update env values.
- Supabase Free **pauses** the project after ~7 days idle.
- Deploy static to Vercel (Angular preset, dist output `dist/colmadox`); Vercel project names must be lowercase, no spaces, no `--`.