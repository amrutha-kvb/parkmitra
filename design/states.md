# The four states, per screen

Every screen must account for **empty, loading, error and permission-denied**. This document
is the register: for each screen and each state, either how it is reached and what the user
sees, or **why it cannot occur**.

Both answers are acceptable. "Not applicable" is not — a state nobody has thought about is
the one that ships as a blank page.

Written after auditing the built screens against `design/mockups/index.html` and finding that
the mockups and the implementation disagreed in both directions: states implemented but never
mocked, and one state mocked nowhere and implemented nowhere.

---

## S1 — Home: pick an area and a window

| State | Reached by | What the user sees |
|---|---|---|
| **Loading** | `/api/areas` in flight | Skeleton chips. `aria-busy="true"` on the page root; time controls stay usable |
| **Empty** | The fetch succeeds and returns `[]` — a **migrated but unseeded database**, which is exactly what a fresh deploy has before `db-setup.sh` runs | "No areas are available yet… Nothing is broken — there is simply nothing to book here yet." `role="status"` |
| **Error** | `/api/areas` fails or returns non-2xx | "Couldn't load areas", with a **Retry** that re-runs the fetch rather than reloading the page |
| **Permission-denied** | **Cannot occur.** There is nothing to be denied: no accounts, no authorisation on this screen, and `/api/areas` is public by design (ADR-002) | — |

The empty state was missing until this audit. `areas.map()` ran on an empty array and rendered
nothing, leaving a form with no chips, a disabled button and no explanation — which reads as a
broken page rather than an empty one.

## S2 — Results

| State | Reached by | What the user sees |
|---|---|---|
| **Loading** | Availability query in flight | Skeleton result rows |
| **Empty** | Query succeeds, no bay is free in that window. **The most common non-happy path in the product** | "No bays free in this window", with the window restated and a route back to change it |
| **Error** | Query fails | Message plus retry. The map degrades separately: tile failures show a degraded notice while markers and the list keep working |
| **Permission-denied** | **Cannot occur.** Searching requires no authorisation | — |

## S3 — Book

| State | Reached by | What the user sees |
|---|---|---|
| **Loading** | Submitting the booking | Button enters a pending state; the form is locked so a double-tap cannot double-book |
| **Empty** | **Cannot occur.** The screen is reached with a chosen bay and window; there is no list to be empty | — |
| **Error** | Validation failure, or **409 when the bay was taken between choosing and confirming** | Field-level messages for validation. The 409 is its own case: "Someone booked that bay first" with a route back to results — this is the exclusion constraint doing its job and the user must not see a generic failure |
| **Permission-denied** | Reached with a bay that no longer exists or is not bookable | Treated as "not available", never as a permissions message, so nothing is leaked about what exists |

## S4 — Pay (simulated)

| State | Reached by | What the user sees |
|---|---|---|
| **Loading** | Payment in flight | Pending button; the amount stays visible so it is never ambiguous what is being paid |
| **Empty** | **Cannot occur.** Always reached with exactly one booking | — |
| **Error** | Simulated payment declines, or the booking has expired | Declined is recoverable and says so; expired routes back to search |
| **Permission-denied** | The reference code in the URL does not match a payable booking | The same response as an unknown code — indistinguishable by design (threat model T1) |

## S5 — Confirmed

| State | Reached by | What the user sees |
|---|---|---|
| **Loading** | Fetching the confirmed booking | Skeleton |
| **Empty** | **Cannot occur.** There is always exactly one booking to confirm | — |
| **Error** | Fetch fails after a successful payment. **The worst error in the product** — money taken, nothing shown | The reference code is displayed from the payment response *before* any fetch, so the user always leaves with the code even if the screen fails |
| **Permission-denied** | Code does not resolve | Identical 404 body to an unknown code |

## S6 — Lookup

| State | Reached by | What the user sees |
|---|---|---|
| **Loading** | Lookup in flight | Pending button |
| **Empty** | Field untouched — the screen's resting state | The form, with an explanation of where to find a reference code |
| **Error** | Network or server failure, as distinct from a code that does not resolve | Retryable message |
| **Permission-denied** | An unknown or malformed code | **Byte-identical responses**, verified by an e2e test. This is the whole enumeration defence: a distinguishable "malformed" and "not found" would let an attacker learn the code format is right |

---

## Reachability, which the four states do not cover

A state can be perfectly implemented and still be unreachable. **S6 was.** It had unit
tests, end-to-end coverage and an accessibility pass, and nothing in the product linked to
it — the only way in was to type `/lookup`, which is what every test did, so every test
passed.

For a product whose whole authorisation model is "keep this code and come back with it",
having no visible way to come back is not a missing nicety. It is the model not working.

It was found by a person reading the demo script and asking where the Look up screen was.
There are now links from the home screen and from the confirmation screen, and
`e2e/states.spec.ts` asserts both by **clicking**, never by `goto`.

**The lesson generalises past this screen:** a test that navigates by URL proves the screen
renders, not that anyone can get to it.

## What this audit changed

1. **S1's empty state now exists**, in the mockups and in the code.
2. **Fourteen "cannot occur" claims are now written down** rather than assumed. Each is a
   claim someone can challenge — which is the point. If any becomes reachable later, the
   screen has a gap and this table says so.
3. The mockups and the implementation were reconciled; they had drifted in both directions.

## The rule

A state that cannot occur is **documented here, not implemented**. A state that can occur is
implemented and mocked. Adding an unreachable empty state to a screen that always has exactly
one record is not thoroughness, it is dead code that makes the real gaps harder to see.
