# Brand Visual System — Three Out of Forty

> SiviHack 2026 · Track 2 · Arctis AI  
> _A visual language built on reliability. Clear, confident, and engineered to perform._

**Brand values:** Clean · Precise · Evidence-led · Industrial · Trustworthy

---

## Colour Palette

All tokens are defined as CSS custom properties on `:root` in `globals.css`. Use these — never raw hex values in components.

### Neutral foundation

| Token | Value | Usage |
|---|---|---|
| `--color-charcoal` | `#171717` | Primary background, strong surfaces |
| `--color-text-primary` | `#111111` | Main text |
| `--color-text-secondary` | `#6B6B6B` | Secondary text, captions |
| `--color-bg` | `#F7F7F5` | App background |
| `--color-surface` | `#FFFFFF` | Cards, panels, modals |
| `--color-border` | `#E5E5E2` | Dividers, borders |

### Semantic colours

Used for decision outcomes and key states. Do **not** use generic Tailwind colour utilities (e.g. `bg-green-600`) for these states — use the token or the Tailwind aliases below.

| Token | Value | Soft token | Soft value | Usage |
|---|---|---|---|---|
| `--color-pursue` | `#2E7D32` | `--color-pursue-soft` | `#D7F2E8` | Go / strong fit |
| `--color-review` | `#F59E0B` | `--color-review-soft` | `#FEF3C7` | Needs review |
| `--color-skip` | `#D14343` | `--color-skip-soft` | `#FEE2E2` | Do not pursue |
| `--color-info` | `#3B82F6` | — | — | Information, links |
| `--color-action` | `#6D28D9` | — | — | Buttons, primary action |
| `--color-disabled` | `#D1D1CC` | — | — | Disabled elements |

### Tailwind token aliases (in `globals.css` `@theme`)

```
pursue        → var(--color-pursue)
pursue-soft   → var(--color-pursue-soft)
review        → var(--color-review)
review-soft   → var(--color-review-soft)
skip          → var(--color-skip)
skip-soft     → var(--color-skip-soft)
action        → var(--color-action)
```

These let you write `bg-pursue-soft text-pursue` instead of inline style attributes.

---

## Typography

Font: **Inter** (loaded via `next/font/google`). Fall back: system sans-serif.

| Role | Token | Weight | Size / Line-height | Tailwind equivalent |
|---|---|---|---|---|
| H1 | `--text-h1` | Bold 700 | 48px / 56px | `text-5xl font-bold leading-[56px]` |
| H2 | `--text-h2` | Bold 700 | 32px / 40px | `text-3xl font-bold leading-10` |
| H3 | `--text-h3` | Semibold 600 | 24px / 32px | `text-2xl font-semibold leading-8` |
| Body | `--text-body` | Regular 400 | 16px / 24px | `text-base leading-6` |
| Caption | `--text-caption` | Regular 400 | 14px / 20px | `text-sm leading-5` |
| Label | `--text-label` | Medium 500 | 12px / 16px | `text-xs font-medium leading-4` |

---

## UI Components

### Verdict pills

Always use `VerdictBadge` from `components/verdict-badge.tsx`. Colours are defined in `lib/status.ts`.

| Verdict | Background | Text |
|---|---|---|
| Pursue / Bid | `bg-pursue text-white` | `#2E7D32` |
| Review / Consider | `bg-review text-white` | `#F59E0B` |
| Skip / No-go | `bg-skip text-white` | `#D14343` |

### Soft callout chips

For inline reason tags on `TenderCard`, use the soft colour pair:

| State | Class pattern |
|---|---|
| Pursue | `bg-pursue-soft text-pursue` |
| Review | `bg-review-soft text-review` |
| Skip | `bg-skip-soft text-skip` |

### Buttons

| Variant | Classes |
|---|---|
| Primary | `bg-charcoal text-white px-4 py-2 rounded font-medium hover:opacity-90` |
| Secondary | `border border-charcoal text-charcoal px-4 py-2 rounded font-medium hover:bg-charcoal hover:text-white` |
| Text link | `text-info underline-offset-2 hover:underline` |

### Cards / surfaces

```
rounded-xl border border-[--color-border] bg-[--color-surface] p-4 shadow-sm
```

### Evidence panel

Background `bg-[--color-bg]`, border `border-[--color-border]`, source citation in `text-[--color-text-secondary]`.

---

## Imagery & Style References

Industrial, minimal, human-centric. Photography direction: concrete, infrastructure, blueprints, natural light. No abstract or decorative illustrations.

---

## What not to do

- Do **not** reach for `bg-green-*`, `bg-red-*`, `bg-amber-*` for semantic states — use the named tokens.
- Do **not** hardcode hex values in components or `className` strings.
- Do **not** theme for dark mode — the app uses a fixed light palette.
- Do **not** add decorative shadows beyond `shadow-sm` on cards.
