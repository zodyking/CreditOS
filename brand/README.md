<p align="center">
  <img src="./social/readme-banner.svg" alt="CreditOS banner" width="100%" />
</p>

# CreditOS Brand Kit

CreditOS is a **financial operations control center**, not a consumer fintech landing page. The brand communicates precision, custody, and calm authority: your credit file is evidence, and CreditOS is the operations desk that keeps it honest.

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
| **Ink 900** | `#0B1220` | Brand ink. Dark surfaces, logo tile, headlines on light. |
| **Verdigris 500** | `#19B3A6` | Primary action, live/verified state, brand accent. |
| **Aurum 500** | `#E9A23B` | Awaiting approval, pending, needs attention. |
| **Garnet 500** | `#E5484D` | Blocked, failed, rejected, danger. |
| **Fern 500** | `#3DBE6E` | Confirmed, resolved, supported. |
| **Azure 500** | `#4C8DFF` | Informational, estimated dates, neutral events. |
| **Orchid 500** | `#9B6DFF` | **Demo / Sandbox / AI-generated** marker. Never used for anything else. |

Full ramps live in `tokens/creditos.tokens.json` (W3C design-token format) and are implemented as CSS variables / Tailwind theme tokens in `app/assets/css/main.css`.

**Semantic contract.** Orchid is reserved for things that are *not real*: demo data, sandbox providers, simulated council runs, hypothetical response scenarios. Verdigris is reserved for *live* and *verified*. The two never swap. This is how the UI keeps its promise to never present a mock as live.

## 3. Typography

| Role | Face | Notes |
| --- | --- | --- |
| UI & headings | **Inter Variable** | Tight tracking on display sizes (−0.02em to −0.035em). Weights 500/600/700. |
| Figures, IDs, dates, hashes | **JetBrains Mono Variable** | Tabular numerals for balances, case codes (`CR-2026-0042`), timestamps. |

Type scale (rem): 0.75 · 0.8125 · 0.9375 · 1.0625 · 1.25 · 1.5 · 1.875 · 2.375.

Both faces are self-hosted via Fontsource — no third-party font CDN requests leave a self-hosted installation.

## 4. Surfaces & shape

- Radii: 6 / 10 / 14 / 20 px. Cards use 14, inputs 10, pills 999.
- Dark theme is the default; light theme is first-class. Both are tokenized.
- Borders are low-contrast hairlines (`Ink 600` on dark, `Ink 100` on light). Depth comes from layered surfaces, not heavy shadows.
- Dense-but-readable: 15 px body text, 13 px table rows, generous 24 px section rhythm.

## 5. Voice

- **Factual over promotional.** "Equifax reports a $1,240 balance; Experian reports $0" — not "we found an error!".
- **Distinguish fact from inference.** Agent output is labelled; scenarios are marked *illustrative, not a prediction*.
- **No guarantees.** Never "deleted", "will be removed", "boost your score". Say "requested deletion", "verified by bureau", "awaiting response".
- **Plain language for consumers; precise language for letters.**

## 6. Usage in the app

```vue
<BrandLogo />            <!-- mark + wordmark -->
<BrandLogo mark-only />  <!-- tile only -->
```

Favicon: `public/favicon.svg` (identical to `logo/creditos-mark.svg`).
