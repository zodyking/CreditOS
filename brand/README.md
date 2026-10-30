<p align="center">
  <img src="./social/readme-banner.svg" alt="CreditOS banner" width="100%" />
</p>

# CreditOS Brand Kit

CreditOS is a **credit operations suite**: the calm, well-lit desk from which a person runs their own credit file like a professional would. The brand communicates precision, custody and friendliness at once — your credit file is evidence, every claim is cited, and nothing leaves without your approval.

**Direction.** Light-first and friendly, in the register of a Fortune 500 customer-facing product: white cards on a cool off-white page, one deep navy rail that anchors the brand, a single verdigris action colour, and generous, highly legible type. Dark mode is a first-class mirror of the same tokens.

**Tagline:** _Credit intelligence, under your control._
**Short form:** _See it. Prove it. Fix it._

---

## 1. The mark

| Asset | Use |
| --- | --- |
| `logo/creditos-mark.svg` | Primary app icon. Ink tile, Verdigris "C" arc, white signal line. |
| `logo/creditos-mark-mono-dark.svg` | One-color mark for light backgrounds, print, embossing. |
| `logo/creditos-mark-mono-light.svg` | One-color mark for dark backgrounds. |
| `logo/creditos-wordmark-dark.svg` | Horizontal lockup for dark surfaces. |
| `logo/creditos-wordmark-light.svg` | Horizontal lockup for light surfaces. |
| `social/github-social-preview.svg` | 1280×640 repository social card. |
| `social/readme-banner.svg` | 1200×320 README hero. |
| `screenshots/*.png` | Product captures (1440×900 desktop and 375×812 mobile, 2× scale) used in the README. Regenerate after visual changes. |

**Concept.** The open "C" is the credit file. The signal line passing through its opening is the monitoring pulse — CreditOS reads what the bureaus report and lets nothing out of the file unnoticed.

**Clear space.** Keep at least the width of the signal line's stroke (≈ 1/16 of the tile) clear on every side. Minimum rendered size: 20 px (mark), 120 px wide (wordmark).

**Do not** recolor the arc outside the Verdigris ramp, rotate the mark, add drop shadows, or place the tile on busy photography.

## 2. Color

The palette is deliberately restrained: one brand accent, one neutral ramp, and four semantic hues with fixed meanings across the entire product.

| Token | Hex | Meaning |
| --- | --- | --- |
| **Ink 900** | `#0B1220` | Brand ink. Navigation rail, logo tile, dark-mode page. |
| **Ink 850** | `#0F1A30` | Primary text on light surfaces. |
| **Verdigris 600** | `#0F8A80` | Primary action on light surfaces (AA on white). Hover: Verdigris 700 `#0B6F68`. |
| **Verdigris 500** | `#19B3A6` | Brand accent on dark surfaces, live/verified state, logo arc. |
| **Aurum 500** | `#E9A23B` | Awaiting approval, pending, needs attention. |
| **Garnet 500** | `#E5484D` | Blocked, failed, rejected, danger. |
| **Fern 500** | `#3DBE6E` | Confirmed, resolved, supported. |
| **Azure 500** | `#4C8DFF` | Informational, estimated dates, neutral events. |
| **Orchid 500** | `#9B6DFF` | **Demo / Sandbox / AI-generated** marker. Never used for anything else. |

Full ramps (50–950) and the semantic layer (`bg`, `surface`, `surface-2/3`, `border`, `text`, `text-2/3`, `accent`, `accent-strong`, `accent-soft`, `rail`) live in `tokens/creditos.tokens.json` (W3C design-token format) and are implemented as CSS variables / Tailwind theme tokens in `app/assets/css/main.css`.

**Status tints.** Status pills and callouts always pair a `100` background with a `700` foreground of the same hue (`bg-aurum-100 text-aurum-700`), which keeps every pill ≥ 4.5:1 on white. On dark surfaces the same pills use a 20 % tint of the `600` step with the `300` foreground.

**Semantic contract.** Orchid is reserved for things that are *not real*: demo data, sandbox providers, simulated council runs, hypothetical response scenarios. Verdigris is reserved for *live* and *verified*. The two never swap. This is how the UI keeps its promise to never present a mock as live.

## 3. Typography

| Role | Face | Notes |
| --- | --- | --- |
| Headings, wordmark, large figures | **Manrope Variable** | Geometric, friendly, −0.02em tracking. Weights 700/800. Page titles 30–38 px, card titles 16 px. |
| UI text | **Inter Variable** | 15 px body, 14 px controls, 13 px table rows. Weights 400/500/600. |
| Codes, IDs, dates, hashes | **JetBrains Mono Variable** | Tabular numerals for balances, case codes (`CR-2026-0042`), hashes, timestamps. |

Type scale (rem): 0.75 · 0.875 · 0.9375 · 1.0625 · 1.25 · 1.5 · 1.875 · 2.375 · 3.

All three faces are self-hosted via Fontsource — no third-party font CDN requests leave a self-hosted installation.

## 4. Surfaces & shape

- Radii: 6 / 8 / 12 / 16 / 24 px. Cards use 16, buttons and inputs 12, pills 999.
- Light theme is the default; dark theme is a first-class mirror. Both are tokenized; the navigation rail stays navy in both.
- Borders are hairlines (`#E6EBF2` light, `rgba(255,255,255,.08)` on the rail). Depth comes from one soft card shadow and a single brand-tinted lift on primary buttons.
- Every page opens with the same header grammar: eyebrow → title → one-paragraph plain-language description → actions. Cards use `card-head` (title + sub-copy) so each block explains itself.
- Callouts (`note-info / brand / warning / danger / demo`) are pastel with a dark foreground, used to explain what will happen before an action, never as decoration.
- Readable, not dense: 15 px body, 24–32 px section rhythm, 44 px tap targets on every button and input.

## 5. Voice

- **Factual over promotional.** "Equifax reports a $1,240 balance; Experian reports $0" — not "we found an error!".
- **Distinguish fact from inference.** Agent output is labelled; scenarios are marked *illustrative, not a prediction*.
- **No guarantees.** Never "deleted", "will be removed", "boost your score". Say "requested deletion", "verified by bureau", "awaiting response".
- **Plain language for consumers; precise language for letters.**

## 6. Usage in the app

```vue
<AppLogo />                              <!-- mark + wordmark, inherits text colour -->
<AppLogo size="lg" theme="dark" tagline />  <!-- rail / auth hero lockup with tagline -->
<AppLogo size="sm" :wordmark="false" />  <!-- tile only -->
```

Favicon: `public/favicon.svg` (identical to `logo/creditos-mark.svg`).
