---
name: ColmadoX
description: "Sistema de gestión de colmado dominicano"
colors:
  timon-600: "#1b6f99"
  timon-700: "#15587a"
  timon-800: "#123e57"
  timon-900: "#103246"
  timon-400: "#55aad0"
  timon-950: "#0b2332"
  profundidad: "#06131e"
  guineo-400: "#ffd63a"
  guineo-500: "#f2be0e"
  mamey-600: "#b8461d"
  mamey-700: "#93371a"
  mamey-800: "#6f2c18"
  hoja-500: "#239658"
  anticipo-600: "#4f46e5"
  papel: "#f7f1e6"
  tinta: "#103246"
  tinta-suave: "#78716c"
  divisoria: "#e7e5e4"
  alerta: "#dc2626"
  aviso: "#cd5f1f"
typography:
  display:
    fontFamily: "Archivo"
    fontSize: "30px"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Archivo"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Archivo"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.08em"
    textTransform: "uppercase"
  micro:
    fontFamily: "Archivo"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.06em"
    textTransform: "uppercase"
  dinero:
    fontFamily: "Archivo"
    fontWeight: 900
    fontVariantNumeric: "tabular-nums"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "9999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "32px"
  card-pad: "20px 24px"
components:
  boton-cobrar:
    backgroundColor: "{colors.guineo-400}"
    textColor: "{colors.timon-950}"
    fontWeight: 800
    height: "56px"
    rounded: "{rounded.lg}"
  boton-primario:
    backgroundColor: "{colors.timon-700}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    height: "44px"
    minWidth: "44px"
  boton-fiado:
    backgroundColor: "{colors.mamey-600}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    height: "44px"
  card:
    backgroundColor: "#ffffff"
    rounded: "{rounded.lg}"
    textColor: "{colors.tinta}"
    border: "1px solid rgba(231,229,228,0.7)"
    padding: "{spacing.card-pad}"
  input:
    backgroundColor: "#ffffff"
    rounded: "{rounded.md}"
    textColor: "{colors.tinta}"
    border: "1px solid #d6d3d1"
    height: "48px"
---

# Design System: ColmadoX

## Overview

**North Star: "El Mostrador de Timón y Guinea"** — the system is drawn from the Caribbean storefront on a Saturday morning: cobalt-blue shutters (el timón), the green of the guineo leaf, the yellow felt-tip price tag stuck to the shelf, the mamey orange of a fruit at the register, and a floor of warm azulejo tiles under morning sun. The interface is a counter where the cashier's fingers do real work: the catalog is the shelf, the ticket is the paper receipt folded at the edge of the table, and the Cobrar button is the one thing you must never miss.

Archivo (a Latin-American grotesk with a poster-weight Black cut) carries both the signage and the ledger — one type family, no serif ornament. Every price reads in black-weight tabular numerals. Depth is almost flat: tile-paper ground with a subtle 28px checker, white cards, one warm shadow step per surface. The dark cobalt "night counter" (sidebar, mobile header, login panel, mobile bottom bar) is the only deliberately dark surface, glowing with guineo highlights.

**Why this world:** the previous system was a "paper + emerald serif" skin over a generic SaaS skeleton. This one commits to a place — the Dominican colmado — with a three-ink semantic the cashier can learn once: **cobalt = the store/brand, yellow = money in, mamey = money on trust (fiado)**, and green stays only for "life/stock/positive". No two brand inks compete; analytics (ganancia) gets its own cold violet.

**Key Characteristics:**
- Warm azulejo ground (`#f7f1e6`) with a faint 28px checker and two radial washes (timón + guineo).
- Archivo everywhere: Black(900) for the big cash moments and totals, 600–800 for controls, 400 for body.
- Every money figure is tabular-numeral Archivo; no formatting inconsistencies remain.
- The POS ticket supports the <10s sale path: autofocus search, `/` shortcut, Enter adds the first match, quick-cash chips (Exacto / $100 / $200 / $500 / $1000), a live "Faltan $X" breach, and a sticky mobile bottom bar that keeps total + Cobrar always on screen.
- Empty states and skeleton grids ship on every major screen.

## Colors

One warm tile ground and four brand inks, each with a strict semantic job. The old "paper + emerald + amber" world is retired; amber survives only as the warning orange (`aviso`).

### Primary
- **Timón** (`timon-600` `#1b6f99` → `timon-950` `#0b2332`): the storefront cobalt. Brand surfaces (sidebar, mobile bar, login panel), primary buttons, active filters/segments, catalog prices. On `#ffffff`, `timon-600` reaches 5.5:1; `timon-700` is the default button fill for AA white text.
- **Guineo** (`guineo-400` `#ffd63a`, `guineo-500` `#f2be0e`): the price tag yellow — **reserved for money-in**: Cobrar, Abrir caja, the mobile total. Always paired with ~black-blue text (`timon-950`) to exceed 10:1.

### Tertiary
- **Mamey** (`mamey-600` `#b8461d`, `mamey-700` `#93371a`): fiado. Buttons/lines that move money onto the trust ledger. Text on paper uses `mamey-700/800`; white-on-`mamey-600` is 4.3:1 (large/bold only), `mamey-700` is the AA-safe fill.
- **Hoja** (emerald scale, `#239658`-ish): stock and positive balances only — no longer the brand.
- **Anticipo (indigo)** (`#4f46e5`): ganancia and analytical numbers — the one cool distinct hue, separated from timón.

### Neutral
- **Papel** (`#f7f1e6`): warm-tile app ground.
- **Tinta** (`timon-900` `#103246`): primary text on light — the world's ink is blue-tinted near-black, never pure `#000`.
- **Tinta Suave** (`#78716c`): secondary text at AA on paper.
- **Divisoria** (`#e7e5e4`): hairlines; cards are white on the tile with a hairline and the `card` shadow.

### Named Rules
**The Three-Ink Rule.** Cobalt is the store, yellow is money-in, mamey is fiado. Green never brandishes; amber is only the warning orange. If a new hue is needed, it must be a true cold contrast (like indigo), not another tint of an existing ink.
**The Slot Rule.** `slate` is a warm-neutral alias of `stone`; use `stone` when writing new code. `emerald`/`amber`/`indigo` are fixed semantic sluts (leaf/positive, warning, analytics) — never repoint them for decoration.

## Typography

**Family:** Archivo (400–900), plus system fallbacks. No italic serif; no second family.
**Character:** Sets like hand-painted storefront lettering — square, sturdy, poster-grade — yet tabular and calm at data size. The Black weight is the voice of money.

### Hierarchy
- **Display** (900, 30px, 1.1, -0.02em): page titles and brand lockup. One per page.
- **Money Grand** (Black, 24–30px, tabular): TOTAL, Debe haber, stat heroes.
- **Title** (600–700, 18px, 1.3): card titles, section heads.
- **Body** (400, 14px, 1.5): default text, tables, inputs.
- **Label** (600, 11px, 0.08em, uppercase): card kickers only.

### Named Rules
**The Black-Money Rule.** Any number that answers "how much do I count now" — total, debe haber, cobrar — is Archivo Black and never lighter than 600. Money in `font-variant-numeric: tabular-nums` everywhere.
**One-Screen-One-Serif Done Right.** Every heading level uses one family; hierarchy comes from weight (900/700/600) and size, never from font switching.

## Layout

Two-rail shell: fixed 288px cobalt sidebar (desktop) / slide-in drawer + sticky 56px header (mobile); content max-1720px with `16/24/32/40px` scale-up padding.

The POS is the flagship:
- **Desktop:** `lg:grid-cols-3` — catalog across 2 cols (cards `2→3→4` by breakpoint), ticket aside sticky in col 3.
- **Mobile:** the ticket card sits in flow, collapsible via the bottom bar, and a **fixed bottom counter bar** (`bg-timon-950`) keeps live count + total (guineo Black) + Cobrar always in the thumb zone. Page reserves `pb-36` so nothing hides behind it.
- Filters are 44px-high segmented pills; product cards hold a photo, name + type pill, price Black, stock line, and a 44px-equivalent tap area (full card ≥ 150px tall).
- The ticket: 44px steppers, 44px quick-cash chips, 56px Cobrar. Caja orders by money hierarchy: Debe haber leads the stat band as a tinted hero card.

## Elevation & Depth

Flat tile floor under daylight; one warm shadow scale (timón-tinted, `rgba(16,50,70,α)`): `soft` 0.05 / `card` 0.07 (40px) / `lift` 0.10 (48px). Cards rest flat; hover lifts one step; modals, drawers and the mobile bar carry the strongest shadow. No neumorphism, no hard offsets, no glow.

**The Flat-At-Rest Rule.** Interaction = elevation. At rest, prints. The mobile bottom bar and open modals are the two permitted floating surfaces.

## Shapes

Corners are the market-carton curve, one coherence: cards 16–20px, buttons/inputs 8–12px, pills/tabs/chips 9999px. Hairlines on cards and inputs only; the only dashes are the receipt tear lines. No clipped corners, no overlap tricks.

## Components

### Buttons
- **Cobrar (flagship):** `bg-guineo-400`, `text-timon-950`, Archivo 800, 56px, rounded-2xl, `shadow-guineo-500/30`. The one unmistakable action. Disabled at 50%.
- **Primario (Abrir caja-nav, Caja, guardar):** `bg-timon-700`, white, 44px min-touch.
- **Fiado:** `bg-mamey-600 → mamey-700` on hover, white.
- **Warning (aviso):** amber burnt-orange, white text.
- All buttons inherit global `focus-visible: outline 2px timón`.

### Cards / Containers
- White, 16–20px radius, hairline stone, `card` shadow at rest, `lift` on hover. POS product cards `p-3`; ledger cards `p-4`; panels `card-pad`.

### Inputs / Fields
- 48px height, 12px radius, stone border, white fill; focus = `timon-600` border + 4px `timon/15` ring. Numeric inputs carry `aria-label` or a real `<label for>`. Money inputs center-right aligned.

### Navigation
- **Sidebar:** timón-950→700 gradient with guineo/timón radials; groups; active item = white/10 pill + guineo dot; icons tint to guineo on hover/active. Mobile drawer over timón scrim + blurred mobile header.
- **POS ticket segmented:** Contado = timón / Fiado = mamey (44px, `role=tablist`).

### Receipt Modal (signature)
- Paper ticket: white, rounded-3xl, dashed tear lines, guineo Cobrar / "Nueva venta" 48px. `role=dialog`, `aria-modal`, backdrop-click closes, Esc closes (host listener on the ventas component, incl. mobile). Counts and prices tabular Black.

## Do's and Don'ts

### Do:
- **Do** keep Archivo mono-family; weight, not font choice, carries hierarchy.
- **Do** use Archivo Black + tabular-nums for every money figure.
- **Do** reserve guineo-yellow for money-in moments (Cobrar, Abrir caja, mobile total) and mamey for fiado.
- **Do** give the cashier the live total on every viewport (sticky mobile bar) and quick-cash chips.
- **Do** keep every tappable ≥44px in the sale flow (steppers, chips, filters, inputs 48px).
- **Do** show underpayment as a clear red "Faltan $X" beside the pay field, and disable Cobrar until covered.

### Don't:
- **Don't** use indigo as a casual accent; it is the analytics voice only.
- **Don't** ship a price without `| number: '1.2-2'`.
- **Don't** mix cool and warm grays; write `stone`, treat `slate` as its alias.
- **Don't** rely on browser/device time for "today"; keep the `-04:00` business-day rule.
- **Don't** expect the schema to auto-apply; every `schema.sql` change needs a manual run in Supabase (functions are `create or replace`, views only append columns).