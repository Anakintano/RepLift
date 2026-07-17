# RepLift Design System

Generated via `ui-ux-pro-max` (see `design-system/replift/MASTER.md` for the raw skill output).
This document is the **codified decision record** the frontend implements.

## Direction

- **Style:** Clean modern SaaS with *selective* glassmorphism (nav bar, modals, hero cards get `backdrop-blur` + translucent surfaces; dense data UI stays flat and crisp).
- **Mode:** **Light-first with full dark mode** (class-based `.dark`, toggle via `next-themes`). The skill flagged "dark mode by default" as an anti-pattern for this product type; the black/white logo works on both.
- **Landing pattern:** Minimal single-column — hero headline, short description, 3 benefit bullets, one large CTA, footer.
- **Density:** Standard (6/10) — spacious marketing pages, denser diary/dashboard views.
- **Motion:** Subtle (150–300 ms), stagger-on-load for card grids, `prefers-reduced-motion` respected. No overshoot easing on data tables.

## Color Tokens (shadcn semantic naming, CSS vars in `globals.css`)

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--primary` | `#F97316` (orange-500) | `#FB923C` (orange-400) | Brand "energy orange" — CTAs, active states, calorie ring |
| `--primary-foreground` | `#FFFFFF` | `#0F172A` | |
| `--accent-success` | `#22C55E` / dark `#4ADE80` | | Goal met, positive deltas, protein-on-target |
| `--destructive` | `#EF4444` | `#F87171` | Errors, over-budget, delete flows |
| `--background` | `#FFFFFF` | `#0B1120` | |
| `--card` | `#FFFFFF` | `#111827` | |
| `--muted` | `#F1F5F9` | `#1E293B` | |
| `--border` | `#E2E8F0` | `#293548` | |
| `--foreground` | `#0F172A` | `#F8FAFC` | slate scale for all neutrals |
| `--ring` | `#F97316` | `#FB923C` | |

Macro chart palette (fixed, colorblind-differentiated by position + label, never color-only):
- Protein `#3B82F6` (blue) · Carbs `#F59E0B` (amber) · Fat `#8B5CF6` (violet) · Calories `--primary` · Water `#0EA5E9` (sky)

## Typography

- **Font:** Plus Jakarta Sans (300–700, Google Fonts via `next/font`) for headings *and* body — friendly modern SaaS.
- **Numerics:** `font-variant-numeric: tabular-nums` on all metric displays, tables, and countdowns.
- Base 16 px, line-height 1.5; body text never below 12 px.

## Charts (Recharts via shadcn `ChartContainer` + chartConfig)

| Use case | Chart |
|---|---|
| Calories remaining vs target | Radial ring (gauge) **with numeric value + % always visible as text** |
| Macro progress vs goals | Horizontal bullet-style bars with target markers |
| Weight / measurement trends | Line chart (<1000 pts SVG), 20% opacity area fill |
| Weekly nutrition breakdown | Stacked bars per day |
| Water intake | Segmented progress (waffle-like) with count label |

Accessibility: every chart pairs with visible text values; series differentiated by style + label, not color alone.

## Non-negotiable UX rules (from skill priority table)

1. Contrast ≥ 4.5:1 both modes; visible focus rings; aria-labels on icon buttons (Lucide SVG only, never emoji).
2. Touch targets ≥ 44×44 px, `inputmode="decimal"` / `type="email"` etc. on all inputs.
3. Mobile-first breakpoints (375 / 768 / 1024 / 1440); no horizontal scroll; reserve space for async content (CLS < 0.1).
4. Forms: visible labels, validate on blur, error text adjacent to field, helper text for units.
5. `cursor-pointer` + 150–300 ms hover transitions on all interactive elements.
6. Skeletons for loading, designed empty states, inline error recovery on every data surface.
