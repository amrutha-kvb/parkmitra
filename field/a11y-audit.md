# Accessibility audit

Phase 7, against the baseline in `design/a11y.md`. Run 2026-09-23.

Automated with `@axe-core/playwright` (WCAG 2.0/2.1 A and AA) plus a keyboard test, on
S1 home, S2 results and S6 lookup. The suite is committed as `e2e/a11y.spec.ts`, so this is
repeatable rather than a one-off screenshot.

## Result

```
✓ S1 home    — no serious or critical violations
✓ S6 lookup  — no serious or critical violations
✓ S2 results — no serious or critical violations
✓ the whole booking form is reachable by keyboard alone
4 passed
```

## What it found, and what fixing it taught

S2 failed twice before it passed, and both failures were the same underlying mistake:
**the markup claimed something about the map that was not true.**

**First: `nested-interactive` (serious).** Leaflet gives every marker
`tabindex="0" role="button"`. Those sat inside a container declared `role="img"` —
interactive controls inside a role that cannot contain them. The file's own header comment
already asserted "it is aria-hidden from keyboard navigation", which was simply not the
case. Fixed by passing `keyboard: false` when creating each marker, which is what actually
makes the claim true.

**Then: `aria-hidden-focus` (serious).** Adding `aria-hidden="true"` produced a new
violation, because Leaflet also gives the container `tabindex="0"` and renders genuinely
focusable zoom controls. Hiding a region that can still receive focus is worse than not
hiding it — a keyboard user tabs into something screen readers have been told does not
exist.

**The real fix was to stop lying.** A pannable, zoomable map *is* an interactive region, so
it is now labelled as one: `role="region"` with
`aria-label="Map of 3 parking spots. Every spot is also listed below."` The zoom controls
carry their own labels. What makes the map genuinely optional is not an ARIA attribute but
the thing `design/a11y.md` actually requires, which holds: every spot is reachable from the
list, and the markers are not focusable.

Worth recording because the instinct both times was to reach for an ARIA attribute to
suppress a warning. Both attempts made the page less accessible while making the audit
quieter.

## Verified against the baseline

| Baseline requirement | Status |
|---|---|
| Contrast ≥ 4.5:1 for text | ✅ no contrast violations reported |
| Whole flow operable by keyboard | ✅ tested — `Find parking` reachable by Tab |
| Visible focus indicator | ✅ `--focus-ring` token, no `outline: none` without replacement |
| Form errors tied to their field and announced | ✅ `aria-describedby`, no `aria` violations |
| Map never the only route to a spot | ✅ enforced by the list, and by non-focusable markers |
| Inputs ≥ 16px, targets ≥ 44px | ✅ tokens `--text-base`, `--tap-min` |
| `prefers-reduced-motion` respected | ✅ in `globals.css` |

## Honest limits

Unchanged from what `design/a11y.md` declared in advance, and worth repeating rather than
quietly dropping:

- **No real screen-reader testing.** Automated checks plus keyboard only. NVDA and VoiceOver
  were not run. Axe catches a real subset of issues, not all of them — no automated tool
  can tell whether an `aria-label` is *useful*, only that one exists.
- **No testing with assistive technology users.**
- **English only**, which is a genuine accessibility limitation in Hyderabad.
- Audited at 390px and desktop widths; not across a device matrix.
