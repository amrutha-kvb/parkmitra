# Data model

Six tables. Availability is derived, never stored (see `design/options.md`).

## ERD

```
┌──────────────┐
│    areas     │  the 7 fixed Hyderabad areas
│──────────────│
│ id      PK   │
│ slug    UQ   │
│ name         │
│ centre_lat   │
│ centre_lng   │
└──────┬───────┘
       │ 1
       │
       │ n
┌──────▼───────┐
│    spots     │  a venue: mall, apartment complex, gym (FICTIONAL in v1)
│──────────────│
│ id       PK  │
│ area_id  FK ─┘
│ name         │
│ kind         │  mall | apartment | office | gym | commercial
│ address_line │
│ lat, lng     │
│ price_per_hour_paise  ← integer paise, ADR-003
│ opens_at, closes_at   ← local time-of-day bookable window
│ is_active    │
└──────┬───────┘
       │ 1
       │
       │ n
┌──────▼───────┐
│     bays     │  ONE physical parking space. The unit that gets booked.
│──────────────│
│ id       PK  │
│ spot_id  FK ─┘
│ label        │  "B-12"
│ is_active    │
└──────┬───────┘
       │ 1
       │
       │ n
┌──────▼────────────────────────────────────────────┐
│                   bookings                        │
│───────────────────────────────────────────────────│
│ id              PK                                │
│ bay_id          FK ───────────────────────────────┘
│ window_at       tstzrange   ← half-open [start,end)
│ driver_phone    ← PERSONAL DATA
│ driver_name     ← PERSONAL DATA, optional
│ vehicle_reg     ← PERSONAL DATA
│ reference_code  UQ  ← the capability, ADR-002
│ amount_paise    ← server-computed, ADR-003
│ status          pending | confirmed | cancelled | expired
│ arrived_at      ← north-star signal
│ created_at                                        │
│                                                   │
│ ⭐ EXCLUDE USING gist (bay_id WITH =,             │
│                       window_at WITH &&)          │
│    WHERE (status <> 'cancelled')       ← ADR-001  │
│ CHECK (upper(window_at) > lower(window_at))       │
│ CHECK (amount_paise >= 0)                         │
└──────┬────────────────────────────────────────────┘
       │ 1
       │
       │ 1
┌──────▼───────┐        ┌──────────────────┐
│   payments   │        │  search_events   │  (no FK — analytics only)
│──────────────│        │──────────────────│
│ id       PK  │        │ id          PK   │
│ booking_id FK┘        │ session_id       │
│ amount_paise │        │ area_id     FK   │
│ provider     │        │ window_start     │
│  = 'simulated'│       │ window_end       │
│ status       │        │ result_count     │
│ created_at   │        │ created_at       │
└──────────────┘        └──────────────────┘
```

## Why `bays` exists as its own table

A spot is a venue; a bay is a space. The exclusion constraint has to key on the thing that
can physically hold one car at a time. Keying it on `spot_id` would mean a mall with 40 free
bays could only ever be booked once — the constraint would be correct and the product
useless. This looked like unnecessary normalisation for about a minute and is in fact
load-bearing.

## Keys and indexes

| Table | Index | Why |
|---|---|---|
| `areas` | `UNIQUE (slug)` | URLs use the slug |
| `spots` | `(area_id) WHERE is_active` | every search filters by area |
| `bays` | `(spot_id) WHERE is_active` | join to spots on search |
| `bookings` | `UNIQUE (reference_code)` | the lookup path, and it must be unique |
| `bookings` | GiST `(bay_id, window_at)` | **created by the exclusion constraint itself** — it is also the index the availability query uses, so the guarantee and the query share one structure |
| `bookings` | `(status, upper(window_at))` | expiring `pending` rows at read time |
| `search_events` | `(created_at)` | retention sweep + metrics |

## Retention

| Data | Kept | Why |
|---|---|---|
| `bookings` incl. personal data | 12 months after the window ends | Dispute window. Then `driver_phone`, `driver_name`, `vehicle_reg` are nulled, the row is kept for metrics. |
| `payments` | with the booking | Simulated in v1, but the retention rule is written for when it is not. |
| `search_events` | 90 days | Only needed for the empty-result metric. Contains no personal data by design — `session_id` is a random per-visit value, not a user id. |
| `areas`, `spots`, `bays` | indefinitely | Reference data, fictional in v1. |

Retention is documented here and **not implemented in v1** — there is no sweeper job (see
architecture: no background workers). Stated as a known gap rather than implied.

## The one derived query

Availability, in plain terms: bays belonging to active spots in the requested area, minus
bays that already have a non-cancelled booking overlapping the requested window. The `&&`
operator against the GiST index does the exclusion.

No `is_available` column exists anywhere, deliberately — two sources of truth for
"is this bay free" is how booking systems quietly start lying.
