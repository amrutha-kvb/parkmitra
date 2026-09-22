# Architecture

One deployable, one database, no background workers. The smallest shape that runs the flow
in `plan/scope.md` honestly.

## Components

```
                        ┌───────────────────────────────────────────┐
                        │              BROWSER (public)             │
                        │   Next.js pages · Leaflet map · forms     │
                        └────────────────────┬──────────────────────┘
                                             │ HTTPS
══════════════════════════ trust boundary 1 ═╪═══════════════════════════
                                             │
                        ┌────────────────────▼──────────────────────┐
                        │        VERCEL — Next.js (App Router)      │
                        │                                           │
                        │  Server components: areas, availability   │
                        │  Route handlers (/api/*): the contract    │
                        │  ── validation at every entry point ──    │
                        └────────────────────┬──────────────────────┘
                                             │ TLS, pooled, secret from
                                             │ host env — never in repo
══════════════════════════ trust boundary 2 ═╪═══════════════════════════
                                             │
                        ┌────────────────────▼──────────────────────┐
                        │            NEON — PostgreSQL              │
                        │                                           │
                        │  areas · spots · bays · bookings          │
                        │  payments · search_events                 │
                        │                                           │
                        │  ⭐ EXCLUDE USING gist (bay_id, window)   │
                        │     the booking guarantee lives HERE      │
                        └───────────────────────────────────────────┘

        ┌───────────────────────────────────────────────────────────┐
        │  OpenStreetMap tiles — third party, read-only, keyless.   │
        │  Fetched by the BROWSER, never by the server.             │
        │  Carries no booking data. See threat model.               │
        └───────────────────────────────────────────────────────────┘
```

## Boundaries, and what crosses them

**Boundary 1 — browser to server.** Everything from the browser is untrusted, including
the time window, the bay id and the amount. The amount especially: price is never taken
from the client, it is recomputed server-side from `spots.price_per_hour_paise` and the
window length. A client that posts `amount_paise: 0` gets charged the real price.

**Boundary 2 — server to database.** Parameterised queries only, no string-built SQL. The
connection string lives in Vercel's environment settings, never in the repository, per the
programme's hosting rule.

**Third party — OSM tiles.** The browser fetches map tiles directly. No booking data, phone
number or reference code is ever in a tile request. Noted explicitly because "we put a map
on it" is how location data leaks to a third party without anyone deciding to.

## Data flow — the one flow

1. **Browse** — server component reads `areas`. Static-ish, cacheable.
2. **Search** — browser posts area + window → server derives availability with one query
   (bays whose spot is in the area, minus bays with an overlapping non-cancelled booking) →
   returns spots with free-bay counts and price. Writes a `search_events` row for the
   empty-result metric.
3. **Book** — browser posts bay + window + phone + vehicle → server **recomputes the
   price**, generates a high-entropy reference code, inserts the booking. If the exclusion
   constraint fires, that is a `409 Conflict`, not a 500.
4. **Pay (simulated)** — a `payments` row is created and moved to paid. Labelled in the UI.
   No gateway, no money.
5. **Confirm** — the reference code is the driver's proof. Looking it up is the only way to
   read that booking.
6. **Arrive** — the driver marks arrival with the reference code; this is the north-star
   signal in `discovery/metrics.md`.

## Where correctness lives

Deliberately, in the database:

- **No double-booking** — exclusion constraint, proven under concurrency at the spike.
- **No negative or zero-length windows** — `CHECK` on the range.
- **No orphan bookings** — foreign keys.
- **Money is integer paise** — `integer` column type makes a float impossible to store.

The application layer is responsible for validation, price computation and translating
database errors into HTTP status codes. It is *not* responsible for the booking guarantee,
which is the point of ADR-001.

## What is deliberately absent

**No background jobs, no queue, no cron.** Expiring unpaid bookings is handled by treating
`pending` bookings older than their window as expired *at read time*, rather than by a
worker that the free tier would not reliably run.

**No cache layer.** At this size Postgres is the cache.

**No auth service.** v1 has no accounts (`plan/scope.md`). The reference code is a
capability: holding it is the authorisation to read or modify that one booking. The
security consequences of that choice are worked through in `design/threat-model.md` — it
is a real trade-off, not a free one.

**No separate API service.** Route handlers inside the same deployable. A split would double
the deploy surface and add CORS for no benefit at seven screens.
