# User flows — including the failure paths

The happy path is four screens. Most of this document is the other paths, deliberately:
the programme's own note is that *"most designs cover the happy path only, which is exactly
where they fail."*

Screens are numbered S1-S6 and referenced by those numbers in the wireframes, mockups and
backlog.

---

## The happy path

```
S1 Home            S2 Results           S3 Book            S4 Pay          S5 Confirmed
┌─────────┐        ┌──────────┐        ┌─────────┐       ┌────────┐      ┌──────────┐
│ pick    │  ───►  │ list+map │  ───►  │ window  │  ───► │ pay    │ ───► │ 7K2M9QX4 │
│ area +  │        │ of spots │        │ + phone │       │ (sim)  │      │ + bay    │
│ window  │        │ + price  │        │ + reg   │       │        │      │ + where  │
└─────────┘        └──────────┘        └─────────┘       └────────┘      └──────────┘
                                                                              │
                                                                              ▼
                                                                        S6 Lookup
                                                                     (return later with
                                                                      the code, mark
                                                                      arrival)
```

---

## Failure paths, by screen

### S1 — Home / pick area and window

| What goes wrong | What the driver sees | Why this and not something else |
|---|---|---|
| End time before start time | Inline: *"The end time needs to be after the start."* Submit stays disabled. | Caught before a request. A 400 round-trip to learn this is rude. |
| Window in the past | Inline: *"Pick a time from now onwards."* | |
| Window longer than 12 hours | Inline: *"Bookings are up to 12 hours."* | v1 is short-stay. Stated as a rule, not a mysterious rejection. |
| Areas fail to load | S1 renders with the area list replaced by an error block and a **Retry**. Date/time inputs still usable. | Partial failure should not blank the page. |

### S2 — Results

| What goes wrong | What the driver sees |
|---|---|
| **No spots free** (the common one) | Empty state, not an error: *"Nothing unbooked in Gachibowli for that window."* Plus the two things that actually help — **try a different area**, **try a different time** — as controls, not prose. |
| Some spots exist but none in this area | Same as above. Suggest the nearest area with availability if one exists. |
| Map tiles fail (OSM down / offline) | **List still works.** Map area shows a quiet placeholder: *"Map unavailable."* The map is an enhancement and never the only route to a spot — this is also the accessibility rule in `design/a11y.md`. |
| Availability request fails | Error state with **Retry**. The chosen area and window are preserved — never make someone re-enter what they just typed. |
| Slow response (cold start) | Skeleton rows after 300 ms, and after ~3 s a line saying *"Still looking — the database is waking up."* Honest about the free tier rather than pretending. |

### S3 — Book

| What goes wrong | What the driver sees |
|---|---|
| Invalid phone | Inline on blur. Accept `+91` and bare 10-digit. |
| Invalid vehicle registration | Inline, permissive — formats vary and a rejected valid plate is worse than a loose one. |
| **Bay taken while they were typing** (409) | The real one. *"That bay was just taken for part of your window."* Return to S2 **with the search re-run**, so they see the current truth rather than a stale list. Never a generic failure. |
| Window outside the spot's hours (422) | *"This spot is open 7 am to 11 pm."* Sent back to the window picker with it prefilled. |
| Network drops mid-submit | Error with **Try again**. Form contents preserved. |
| **Double submit** | Button disables on first submit. If two bookings are created anyway, that is a bug — and the exclusion constraint means the second one fails rather than silently double-booking. |

### S4 — Pay (simulated)

| What goes wrong | What the driver sees |
|---|---|
| Already paid (409) | Forward to S5 rather than erroring — the outcome they wanted already happened. |
| Booking expired before paying | *"This booking expired before payment."* With a **search again** action. |
| Payment "fails" | Simulated, so it does not spontaneously fail; a failure here means the server is down → error state with retry, booking stays `pending`. |

Every state on this screen carries the standing banner: **no real payment is taken.**

### S5 — Confirmed

| What goes wrong | What the driver sees |
|---|---|
| Driver closes the page and loses the code | The unfixable one, by design (ADR-002). Mitigations: the code is the largest thing on the screen, there is a **copy** button, and the page says plainly *"Save this — it is the only way back to this booking."* A real product sends an SMS. |
| Opened later, booking expired | Shown as expired with the window it was for. Not an error — a fact. |

### S6 — Lookup / arrive

| What goes wrong | What the driver sees |
|---|---|
| Code not found | *"No booking with that code."* **Identical response whether the code never existed or belongs to someone else** — distinguishing them would confirm valid codes to someone guessing (threat model T1). |
| Too many attempts (429) | *"Too many tries. Wait a minute."* This is the enumeration control, and it is user-visible by necessity. |
| Marking arrival twice | Idempotent from the driver's view — shows arrival already recorded rather than an error. |

---

## The four states, per screen

Required by Gate 4. Full table so nothing is assumed:

| | Empty | Loading | Error | Permission denied |
|---|---|---|---|---|
| **S1 Home** | n/a (always has 7 areas) | area list skeleton | areas failed + retry | n/a — public |
| **S2 Results** | **no unbooked bays** — the important one | skeleton rows + cold-start note | search failed + retry, inputs kept | n/a — public |
| **S3 Book** | n/a (arrives with a bay) | submitting, button disabled | 409 taken / 422 hours / network | n/a — public |
| **S4 Pay** | n/a | processing | failed + retry | n/a — public |
| **S5 Confirmed** | n/a | fetching booking | fetch failed + retry | **wrong/unknown code → same 404 as not-found** |
| **S6 Lookup** | no code entered yet | looking up | not found / 429 rate limited | **same as above, deliberately indistinguishable** |

**On "permission denied":** this product has no accounts, so there is no logged-out state.
The equivalent is *holding the wrong reference code*, and the deliberate design decision is
that it looks exactly like "not found". That is the permission-denied state, and making it
indistinguishable is the security control, not an oversight.
