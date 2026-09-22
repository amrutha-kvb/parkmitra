# Terminology

Every concept named once, and that name used everywhere — in the interface, in the
database, in the API, in the code, and in these documents. Where the product name differs
from the database name, both are given, because a mismatch between the two is how a team
ends up with `spot`, `location`, `venue` and `place` all meaning the same thing.

| Concept | The word we use | Never say | Database | API |
|---|---|---|---|---|
| A venue with parking — a mall, apartment complex, gym | **spot** | location, venue, place, property, lot | `spots` | `spot_id`, `spot_name` |
| One physical space that holds one car | **bay** | slot, space, spot (!), parking, berth | `bays` | `bay_id`, `bay_label` |
| The period a bay is reserved for | **window** | slot, booking time, period, duration | `window_at` (`tstzrange`) | `window { start, end }` |
| A reserved bay for a window | **booking** | reservation, order, ticket | `bookings` | `/api/bookings` |
| The code the driver arrives holding | **reference code** | booking id, ticket number, PNR, token | `reference_code` | `reference_code` |
| One of the seven searchable neighbourhoods | **area** | zone, locality, region, neighbourhood | `areas` | `area` (slug) |
| The person parking | **driver** | user, customer, member, rider | `driver_*` | `driver_phone` |
| Money | **paise**, always integer | rupees (in code), amount, price (bare) | `*_paise` | `*_paise` |

## The two that cause real bugs

**spot vs bay.** The single most confusable pair in this product, and the distinction is
load-bearing: the exclusion constraint keys on **bay**, because a bay is what physically
holds one car. Saying "spot" when you mean "bay" is how you end up booking a whole mall.
If a sentence is ambiguous, it is about a bay.

**window is half-open.** `[start, end)` — the end is *exclusive*. A booking ending 12:00 and
one starting 12:00 do not overlap. Say "window", not "slot", because "slot" implies a fixed
grid and these are arbitrary.

## Words deliberately not in this product

- **"Reserve"** — we say *book*. One verb, everywhere.
- **"Available"** as a stored property — availability is always *derived*. There is no
  `is_available` field, and saying "mark it available" would imply one exists.
- **"Cancel"** — v1 has no cancellation (`plan/scope.md`). The status value exists in the
  schema for later; no UI says it.
- **"Guaranteed"** — a booking is a *promise*. There is no enforcement in v1 and the
  product must not imply otherwise (threat model T6).
- **"Free"** — ambiguous between "no cost" and "unoccupied". Say **unbooked** for the
  latter. Prices are never zero, so "free parking" would be a lie.

## Microcopy conventions

- **₹ with no decimals** when paise are zero: `₹40`, not `₹40.00`. Show paise only when
  non-zero.
- **Times in 12-hour with am/pm** — `2:30 pm`. Indian users read this faster than 14:30.
- **Dates as `Tue 23 Sep`** — no year unless it is not this year.
- **Duration as `2 hours`**, never `120 min`.
- The reference code is always shown **uppercase, grouped**: `7K2M 9QX4 TB`.
