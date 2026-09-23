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

---

# Second pass — clause by clause against the baseline (2026-09-24)

The first pass was automated: axe across three screens plus keyboard reachability. That
catches a real subset and it is the subset that catches itself. This pass reads
[`design/a11y.md`](../design/a11y.md) **clause by clause** and checks each one against the
code, which is what the quality bar means by *"accessibility audited against the baseline"*.

It found two things automation could not, and one thing wrong with my own testing.

## The clauses

| Clause | Verdict | Evidence |
|---|---|---|
| Contrast ≥ 4.5:1, ≥ 3:1 for borders | **pass** | axe contrast rules across S1/S2/S6 |
| Colour never the only carrier of meaning | **pass** | every status carries a word; error states pair `⚠` with text |
| Full keyboard reach, logical order | **pass** | `the whole booking form is reachable by keyboard alone` |
| No positive `tabindex` | **pass** | none in `app/` |
| Visible focus ring, never bare `outline: none` | **pass, wording corrected** | three `outline: none` rules, each paired with `box-shadow: var(--focus-ring)` on the same rule. The baseline's absolute wording was wrong, not the code |
| Map is not a keyboard trap | **pass, baseline corrected** | see below |
| One `<main>`, `<h1>` per screen | **pass** | axe landmark rules |
| Real `<label>`, never placeholder-as-label | **pass** | no placeholder-only inputs |
| Errors tied by `aria-describedby` + live region | **pass** | 5 files use `aria-describedby`, 6 carry a live region |
| Loading announces via `aria-busy` | **pass** | 6 screens |
| 44×44px targets | **pass** | `--tap-min` used in 8 rules |
| Inputs ≥ 16px, correct `inputmode`/`autocomplete` | **pass** | `tel` on the phone field |
| `lang="en"` | **pass** | `app/layout.tsx` |
| **`prefers-reduced-motion` removes transitions and the shimmer** | **FAIL → fixed** | see below |
| Nothing auto-plays or moves without user action | **pass** | the shimmer was the only motion |

## The gap: reduced motion was specified and never built

`design/a11y.md` has required this since the baseline was written:

> `prefers-reduced-motion: reduce` removes all transitions and any skeleton shimmer.

**There was no `prefers-reduced-motion` rule anywhere in the codebase.** Meanwhile
`.skeleton` carried `animation: skeleton-pulse 1.4s ease-in-out infinite` — an *infinite*
animation, which is precisely what triggers discomfort for people with vestibular disorders,
and the animation most likely to be on screen while someone is waiting.

Automated checks did not catch it and could not have: nothing is wrong with the rendered
page. The media query is simply absent, and axe does not emulate user preferences. Only
reading the baseline against the code finds this class of defect.

Now implemented in `app/globals.css`, with `animation: none` on the skeleton rather than a
near-zero duration — a 0.01ms infinite animation still fires events forever and still
repaints.

## The baseline was wrong about the map, and the baseline was changed

The document specified the map as `aria-hidden`. In practice Leaflet renders markers as
focusable `role="button"` images *and* makes the container focusable, so `aria-hidden`
produced an `aria-hidden-focus` violation — focusable content inside hidden content. The
phase 7 fix made it a labelled `role="region"` with `keyboard: false` on the markers.

**The code was right and the document was stale**, so the document changed. Recording the
direction matters: a baseline that is quietly edited to match whatever was built is not a
baseline. This one was edited because the specified approach was tested and found to be
worse.

## What I got wrong, and it is the most useful thing here

The first version of the reduced-motion test was **behavioural**: open a context with
`reducedMotion: "reduce"`, find the skeleton, assert its computed `animationName` is `none`.
It passed. It looked like exactly the right test.

It was worthless. Playwright's `reducedMotion` emulation makes **Chromium itself** suppress
animations, at the browser level, regardless of the page's CSS. Verified by deleting the
media query, confirming the built stylesheet contained zero `prefers-reduced-motion` rules,
and watching both assertions stay green.

```console
$ # built CSS with the media query deleted
reduced-motion rules in built css: 0
  ✓ the skeleton shimmer stops when the user asks for reduced motion
  ✓ transitions are suppressed when the user asks for reduced motion
```

**A test that cannot fail is worse than no test, because it is counted.**

The replacement asserts the served stylesheet instead: that it contains a
`prefers-reduced-motion` rule and that the rule reaches `.skeleton`. It is weaker evidence —
it proves the rule exists, not that a browser honours it — and it is written down as weaker.
It does fail when the rule is removed, which the first one never would have.

I also nearly missed all of this: an earlier falsification attempt ran against a **stale
build**, because `npm run build > /dev/null 2>&1` swallowed the output and I restarted the
server without checking the build had succeeded. Same family as the measurement errors in
`field/report.md` — redirecting output and then trusting what came back.

## Still not done

- **No screen-reader testing on a real device.** Unchanged from the first pass, and still the
  largest gap. VoiceOver and NVDA disagree with each other and with axe.
- **The map is still not usable without sight.** It is labelled and out of the tab order, and
  every spot it shows is in the list beneath it, which is the mitigation rather than a fix.
- **English only.**
