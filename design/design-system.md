# Design system

Tokens only. No magic values anywhere in the stylesheets — if a number is not in this file,
it does not belong in a component.

Deliberately small. Seven screens do not need a component library
(`design/stack.md`), and a system that fits on one page is one that actually gets followed.

## Colour

Built around one accent and a neutral ramp. Every text pairing below is checked against
4.5:1 (`design/nfr.md`).

```css
/* neutrals */
--ink-900: #14181F;   /* primary text            on --paper: 15.8:1 */
--ink-700: #3D4653;   /* secondary text          on --paper:  9.1:1 */
--ink-500: #6B7685;   /* tertiary / placeholder  on --paper:  4.6:1 */
--ink-200: #D9DEE5;   /* borders, dividers */
--ink-100: #EDF0F4;   /* surfaces, skeletons */
--paper:   #FFFFFF;

/* accent — deep teal. Reads as civic/utility rather than consumer-app. */
--accent-700: #0B5A55;  /* text on paper: 7.4:1 */
--accent-600: #0E6F68;  /* primary button bg, white text: 5.2:1 */
--accent-100: #E3F2F0;  /* selected row, focus halo */

/* status */
--ok-700:    #1B6B3A;   /* confirmed        on paper: 6.1:1 */
--ok-100:    #E6F4EB;
--warn-700:  #8A5A00;   /* expiring, cold start. Amber, never red. */
--warn-100:  #FDF3E0;
--stop-700:  #A02020;   /* bay taken, errors on paper: 6.4:1 */
--stop-100:  #FBE9E9;
```

**Rules**
- Colour is never the only signal — every status carries an icon or a word as well
  (`design/a11y.md`).
- Red is reserved for *failure*, never for "unavailable". A fully-booked spot is neutral,
  not an error; it is the normal state of a popular car park.
- The accent is used for one primary action per screen. Two primary buttons means the
  screen has not decided what it is for.

## Type

One family. `Inter` if it loads, system stack if it does not — no webfont blocking first
paint on 4G.

```css
--font: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;  /* reference code only */

--text-xs:   0.75rem;   /* 12px — captions, never body */
--text-sm:   0.875rem;  /* 14px — secondary */
--text-base: 1rem;      /* 16px — body. Never smaller for input labels. */
--text-lg:   1.125rem;  /* 18px — spot names */
--text-xl:   1.5rem;    /* 24px — screen titles */
--text-2xl:  2rem;      /* 32px — the price, the reference code */

--weight-regular: 400;
--weight-medium:  500;
--weight-bold:    700;

--leading-tight: 1.25;
--leading-body:  1.55;
```

**Rules**
- Inputs are `--text-base` (16px) minimum — anything smaller makes iOS Safari zoom on
  focus, which is a real usability failure on the exact device this product is used on.
- The **reference code is monospace**, uppercase, letter-spaced, grouped `7K2M 9QX4 TB`.
  It gets read aloud and typed by hand, so character ambiguity matters more than beauty.

## Spacing

4px base. Six steps, and that is the whole scale.

```css
--space-1: 0.25rem;  /*  4 */
--space-2: 0.5rem;   /*  8 */
--space-3: 0.75rem;  /* 12 */
--space-4: 1rem;     /* 16 — the default gap */
--space-6: 1.5rem;   /* 24 — between blocks */
--space-8: 2rem;     /* 32 — between sections */
--space-12: 3rem;    /* 48 — page top/bottom */
```

## Radius, border, shadow

```css
--radius-sm: 6px;    /* inputs, chips */
--radius-md: 10px;   /* cards, buttons */
--radius-lg: 16px;   /* sheets, the confirmation panel */

--border: 1px solid var(--ink-200);

--shadow-sm: 0 1px 2px rgba(20,24,31,.06);
--shadow-md: 0 4px 12px rgba(20,24,31,.08);   /* raised cards only */
```

No shadow larger than `--shadow-md`. This is a utility product, not a landing page.

## Layout

```css
--page-max: 960px;      /* content never wider */
--tap-min: 44px;        /* every interactive target */
--focus-ring: 0 0 0 3px var(--accent-100), 0 0 0 1px var(--accent-600);
```

Mobile-first. Breakpoint at `640px` and that is the only one — a second breakpoint would
mean the layout is doing too much.

## Component inventory

Everything the seven screens need. Nothing speculative.

| Component | Where | Notes |
|---|---|---|
| `AreaPicker` | S1 | 7 fixed chips, not a `<select>` — one tap, no dropdown on mobile |
| `WindowPicker` | S1, S3 | start time + duration, not two datetimes. People think in "2 hours". |
| `SpotCard` | S2 | name, kind, walk hint, price, free-bay count |
| `SpotMap` | S2 | Leaflet, pins only. Enhancement — never the sole route. |
| `BayChooser` | S3 | bay labels as chips |
| `PriceSummary` | S3, S4 | hours × rate, total. Always shows the rounding rule. |
| `SimulatedPayBanner` | S4, S5 | standing notice that no money moves |
| `ReferenceCode` | S5, S6 | mono, grouped, copy button |
| `StateBlock` | every screen | the four states in one component — empty / loading / error / denied |
| `Field` | S1, S3, S6 | label + input + inline error, wired to `aria-describedby` |

**`StateBlock` is one component on purpose.** Gate 4 requires all four states on every
screen; implementing them as one component with four variants is how they stay consistent
and how none get quietly forgotten.
