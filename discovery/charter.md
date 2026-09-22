# Project charter — parkmitra

**Date:** 2026-09-22
**Author / owner:** Amrutha Korumilli
**Gate:** this document is the Gate 1 artifact. Gate 1 passes when the charter exists *and
names what this is not* — the non-goals section below is the part that matters.

---

## What this is

A way to find and book short-stay parking, by the hour, against private capacity that is
idle at that hour, in dense parts of Hyderabad.

*mitra* — friend. The premise is that the bay you need already exists a two-minute walk
away; somebody just has to introduce you to it.

## Why it exists

Because on 2026-09-21 there was a car, a lane too narrow to park in without blocking it,
a building with no parking, and — three minutes away — a gym with an empty lot. The space
was there the whole time. There was no way to find it or ask for it.

Full reasoning in `discovery/problem.md`; the unedited first framing is in
`discovery/first-read.md`.

## Who it is for

Primary: the driver who plans parking before leaving, and who will trade a longer walk for
certainty. Named person in `discovery/personas.md`.
Secondary: the driver who decides on arrival, circles, and gives up.

Not for commuters — they have parking at their own office. That was an early wrong turn
and correcting it changed the product.

## What success looks like

North star: **confirmed arrivals** — bookings that were made and turned up to. Not
signups, not sessions, not revenue. Definitions and data sources in
`discovery/metrics.md`.

## The one flow

The first release proves exactly one path end to end, with no mocks in it:

> pick an area → see spots that are actually free for the window you need, with an hourly
> price → choose the window → pay → arrive holding a confirmation.

If that is not convincing, nothing behind it matters. Everything else is out.

---

## What this is **not**

The section Gate 1 exists for. Each of these is a deliberate decision, not an omission.

**Not a supply-side onboarding product.** There is no flow for a building to sign up, list
bays, set prices or manage availability. Supply in v1 is seeded by hand. The real product
lives or dies on supply-side trust, and ten days cannot solve trust — pretending otherwise
with a half-built listing form would be worse than leaving it out.

**Not real listings.** Every spot is fictional. No real gym, mall, apartment complex or
business is named, contacted or listed. A demo is not consent, and listing a real venue
without its owner's agreement would be both wrong and a liability.

**Not enforcement.** No barrier integration, no ANPR, no sensors, no guard app, no
overstay penalty. A booking is a promise, not a guarantee of a physical bay. Stated plainly
in the product, not buried.

**Not a car super-app.** No FASTag, challans, fuel, insurance, servicing or washing. That
is Park+'s product and it is a different company. Out permanently, not just out of v1.

**Not monthly or residential leasing.** A different transaction with different economics.

**Not nationwide, or even city-wide.** Seven areas of Hyderabad, chosen for density. Thin
coverage everywhere produces empty results, and empty results are what make people stop
opening the app.

**Not a live payment processor.** v1 uses a clearly-labelled simulated payment. Taking real
money needs KYC, a settlement account and a refund policy, none of which exist. Money is
still modelled properly — integer paise, never floats — so the seam is real even though
the gateway is not.

**Not a native app.** Web only.

**Not multi-city, multi-language, or multi-currency.**

---

## Constraints

- **Ten working days**, reduced in practice — registration was late and roughly three days
  remain. Scope is cut accordingly at Gate 2 and the reduction is stated, not hidden.
- **Free-tier hosting only.** Cost budget in `design/nfr.md`.
- **Solo.** One person, no reviewer but the process itself.
- **niha's model layer is unavailable** for the whole build (finding F-03, escalated
  2026-09-22). Every switch to another tool is declared in `field/tool-switches.md`.

## Risks accepted up front

- The riskiest assumption is supply-side willingness, and v1 does not test it — seeded
  supply deliberately sidesteps it. That is a known hole, ranked in
  `discovery/assumptions.md`.
- Self-reported arrival is a weak north-star signal. Accepted; improving it needs hardware.
- A seeded marketplace can look convincing while proving nothing about demand. The demo
  will say so rather than imply traction.

## Definition of done for v1

The flow above runs database to screen with no mocks, on a hosted URL a stranger can open,
from a clean clone following the README, with empty / loading / error / permission-denied
states behaving on every screen.
