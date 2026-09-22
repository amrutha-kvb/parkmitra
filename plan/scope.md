# Scope cut — Gate 2

**Date:** 2026-09-22
**Signed:** Amrutha Korumilli (solo build; there is no second signatory, and the programme's
live 30-minute Gate 2 review is not available to a participant working alone — noted rather
than skipped)
**Status:** binding. Anything not listed under "In" is out, and adding to "In" after this
point requires editing this file and saying why.

---

## The one flow

> **Pick an area → see spots that are genuinely free for the window you want, with an
> hourly price → choose the window → pay → arrive holding a confirmation.**

Database to screen, no mocks anywhere in that path.

---

## In

| # | Capability | Why it is in |
|---|---|---|
| 1 | Browse the 7 seeded areas | Entry point. Fixed list, not free-text — no geocoding key exists. |
| 2 | See available spots for an area + time window | The product's actual answer. Availability is computed against real bookings, not faked. |
| 3 | Map with pins for those spots (Leaflet/OSM) | "Is it near where I'm going" is the question a list cannot answer. |
| 4 | Pick a start time and duration | The window is the unit of the whole product. |
| 5 | Book, with double-booking refused by the database | The guarantee. Proven at the spike. Without it nothing else is trustworthy. |
| 6 | Simulated payment, labelled as such, amounts in integer paise | Proves the seam without lying about taking money. |
| 7 | Confirmation with a reference code | What the driver actually arrives holding. |
| 8 | Empty / loading / error / permission-denied states on every screen | Graded explicitly, and it is where products are judged. |
| 9 | Seeded spots across the 7 areas, fictional | Supply has to exist for the flow to be real. |

## Out

Each with the reason, because "out" without a reason becomes "forgotten".

| Capability | Why out |
|---|---|
| **Supply-side onboarding** — a building listing its own bays | The real product and the real risk (A1). Cannot be built or validated in the time. Seeded instead, and said so. |
| **Real listings of real venues** | No consent. A demo is not permission, and naming a real gym or complex would be a liability. All spots fictional. |
| **User accounts / login** | The flow works without identity: a booking needs a phone number and a reference code, not a password. Auth would be a day for zero added proof. |
| **Real payments** (incl. Razorpay test mode) | Was planned, cut here. Needs KYC and a refund policy; adds webhook verification to the critical path for a flow that still cannot take money. |
| **Cancellation and refunds** | Follows real payments. Without money there is nothing to refund. |
| **Enforcement** — barriers, ANPR, sensors, guard app, overstay penalties | Hardware and agreements. A booking is a promise; the product says so. |
| **Reviews and ratings** | Needs volume that does not exist. |
| **Notifications** (SMS / WhatsApp / push) | Costs money per message and needs a provider account. Confirmation is on screen. |
| **Free-text address search / geocoding** | No free keyless geocoder with usable rate limits. Fixed areas instead. |
| **Native apps** | Web only. |
| **Multi-city, multi-language, multi-currency** | Seven areas, English, ₹. |
| **Monthly / residential leasing** | Different transaction, different economics. |
| **Car super-app surface** (FASTag, challans, fuel, insurance) | Permanently out. Different company. |

## Cut *during* this gate, and why

Worth recording separately — these were in the plan an hour ago:

1. **Razorpay test-mode payments → simulated.** The gateway round-trip and webhook
   signature verification sit directly on the critical path and buy no additional truth,
   because the flow cannot accept real money either way. The honest version is cheaper and
   equally demonstrable.
2. **The lister flow (Option B)** — someone with a spot listing it. Agreed earlier as a
   stretch "if there is time". There is not. Removed rather than left as a half-screen.
3. **Accounts.** Removed once it was clear the flow does not need identity to be real.

## Time reality, stated plainly

The programme is ten working days. Registration was late and roughly **three days**
remain. On top of that, niha's model layer has been unavailable for the entire build
(F-03, #1013 — an organisation-wide credit outage, confirmed by the team, reset dated after
submissions close).

The programme's own rule covers this: *"fix time does not count against scope — an engineer
who loses a day to a T1 has their scope reduced by a day, not their score."* This cut is
that reduction, made explicitly and in advance rather than discovered as a shortfall at the
end.

## What "done" means

- The one flow runs end to end against a real Postgres, no mocks in the path
- Deployed to a hosted URL a stranger can open
- A clean clone comes up by following the README, timed
- All four states behave on every screen
- Double-booking is refused, with a test that proves it under concurrency

## What this release deliberately does not prove

That a building will admit a stranger (A1). That drivers will pre-book rather than chance
the street (A3). That the prices are right (A5). A seeded marketplace can look convincing
while proving nothing about demand, and the demo will say so.
