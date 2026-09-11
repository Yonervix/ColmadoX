# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Jefe (dueño/gerente):** runs the business — sells, opens/audits the caja, and owns inventory, purchases (compras), waste (mermas), expenses (gastos), and reports. `is_jefe()` gates these areas.
- **Cajeros/empleados:** register sales (contado and fiado) at the counter, collect fiado payments, and open/close their own daily caja. Employee flows must keep working; caja functions check `auth.uid()`, not `is_jefe()`.
- Day to day the **jefe and cashiers work the counter together**; the jefe supervises operations at close. Confirmed with the owner.

## Product Purpose

ColmadoX is a web POS and management system for a **Dominican colmado** (corner grocery/store). It controls sales (cash and informal credit), a daily cash register with arqueo, inventory with physical counting, purchases, waste, expenses with budgets, debtors (fiado), and profit reports — in Spanish, with a fast counter-first selling flow. Success means the daily caja reconciles at close, fiados are collected, and stock is never guessed at.

## Positioning

A POS that treats the Dominican colmado's real operating model as first-class rather than a generic retail system: informal per-name credit (fiado) with debtors, packages/cases bought whole and sold loose by unit, daily cash drawers shared across shifts, and a business "today" defined by Santo Domingo local time. Every sale still requires an open caja, sales are numbered server-side, and no financial row is ever written from the client — every mutation goes through security-definer RPCs. This correctness-and-trust posture is the mechanism a plain POS clone would not copy.

## Operating Context

- Used **at the counter during business hours** and **during off-hours for management**; run on **tablet/phone touch AND desktop/laptop** depending on the moment (owner-confirmed). Selling must stay fast on either.
- Business is cash-heavy; the daily **caja** is opened with a starting fund (`abrir_caja`), records sales, fiado payments (cobros), and paid expenses as they flow, and is closed with a physical-money arqueo (`cerrar_caja(p_dinero_fisico)` comparing "debe haber").
- Products are stocked in **sell units** (`productos.stock`), bought as units/packages/cases, with three stock semantics (see Capabilities). Packages without count ("sin conteo") are removed manually via Mermas with motivo "Se acabó el paquete".
- Users expect **Spanish UI** and prices in **Dominican pesos**; the app renders `$` (DOP).
- The product runs as a **PWA** (service worker), exposing the mobile/touch flow to install on devices at the counter; deployed statically to Vercel.
- Support contact is the developer: WhatsApp +1 (829) 255-5768 and Instagram @yon3rvi_esp, surfaced in the app's "Sobre mí" screen.

## Capabilities and Constraints

- **Roles:** `profiles.rol` enum `'jefe' | 'empleado'`, auto-created by trigger `handle_new_user` from `raw_user_meta_data.rol`; `is_jefe()` gates jefe-only surfaces (inventario, compras, mermas, gastos, reportes). Employees keep ventas, caja, fiado, inicio, info.
- **Daily caja invariant:** no venta exists without an open caja opened the same business day; `ventas.numero` is assigned by a before-insert trigger.
- **Business "today":** `public.fecha_local()` = `now() at time zone 'America/Santo_Domingo'` (fixed -04:00, no DST). Browser/device timezones and UTC must never drive "today" logic; the frontend uses -04:00 helpers.
- **Stock semantics:** `productos.tipo` enum `unidad | paquete | caja` with `unidades_por_paquete numeric`: unidad sells normally; paquete/caja with `unidades_por_paquete > 0` is "con conteo" (purchase enters package count, stock += qty × per-package, sales deduct units); paquete/caja with NULL/0 is "sin conteo" (stock counts packages, POS sells without decrementing, packages removed via Mermas). `registrar_venta`, `registrar_compra`, and view `productos_venta` must all stay consistent on this.
- **Mutation rule:** all financial mutations go through `security definer` RPCs (`registrar_venta`, `registrar_compra`, `registrar_merma`, `abrir_caja`, `cerrar_conteo`, `cerrar_caja`, `anular_venta`, `registrar_pago`, `registrar_gasto`), always with `set search_path = public`. The client never inserts/updates financial rows directly.
- **Schema drift is manual:** `supabase/schema.sql` is the single source of truth but does not auto-apply; a human must run changes in Supabase SQL Editor (which aborts at the first error), and `create or replace view` can only append new columns at the end.
- **Infrastructure:** Angular 22 standalone/Signals; Tailwind; Supabase (Postgres) backend; per-client deployment = new Supabase project + env values; Supabase free tier pauses after ~7 days idle.
- **Currency display** uses `$`; recorded as Dominican pesos (inferred from product context, not explicitly confirmed).

## Brand Commitments

- Name **"ColmadoX"** — wordmark set in Sora display font with the terminal **X** accented in amber; letter-mark is a rounded "C" tile in emerald gradient.
- Tagline: **"Sistema de gestión de colmado"**.
- Voice is plain, practical Dominican Spanish; © 2026 ColmadoX appears on the login screen.
- Developer/brand contact ("Yon3rvi"): WhatsApp +1 (829) 255-5768 and Instagram @yon3rvi_esp, framed as support.

## Evidence on Hand

- Real Spanish product copy throughout `src/app` (login value proposition, dashboard labels, feature screens).
- Login claim: "Controla tus ventas, inventario y fiados en un solo lugar", plus feature bullets (punto de venta contado/fiado, caja diaria con arqueo y gastos, reportes/deudores/stock al día).
- Real developer contact details in the "Sobre mí" screen (`src/app/features/info/`).
- Committed history of an evolving product (git log) and a single source-of-truth database schema (`supabase/schema.sql`).
- Absences to respect: no customer testimonials, pricing, marketing site, or case studies exist yet — future work must not fabricate them.

## Product Principles

1. **Counter speed is sacred.** Registering a sale — contado or fiado — is the fastest, lowest-friction flow in the app; employees are never blocked from selling by anything but a missing open caja.
2. **Every peso traces to the caja.** All money flows through the daily caja, which must reconcile at close; nothing is written to financial rows except through auditable server-side RPCs.
3. **Roles shape the surface.** Employees sell and self-supervise their caja; the jefe alone sees cost, profit, purchasing, and waste. Employee flows keep working whenever jefe-only checks are touched.
4. **The Dominican colmado model is the product.** Fiado by name, packages bought whole and sold loose, DOP pricing, and the Santo Domingo business day are features, not workarounds.
5. **Trust by construction.** Sales are numbered server-side, stock semantics are kept consistent across every path, and the schema is one authoritative file whose changes are applied deliberately, not silently.