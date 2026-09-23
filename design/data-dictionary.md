# Data dictionary

Every field, its type, its meaning, and whether it holds personal data.

**PD** = personal data. It lives in two tables: three fields on `bookings` (driver side)
and two fields on `owners` (supply side). Keeping that list short is deliberate: the fewer
places it lives, the fewer places it can leak.

---

## areas

| Field | Type | Meaning | PD |
|---|---|---|---|
| `id` | `smallserial` PK | Surrogate key | no |
| `slug` | `text` UNIQUE | URL segment, e.g. `gachibowli` | no |
| `name` | `text` | Display name, e.g. "Gachibowli" | no |
| `centre_lat` | `double precision` | Map centring only — not a spot location | no |
| `centre_lng` | `double precision` | as above | no |

Seven rows, fixed: HITEC City, Gachibowli, Madhapur, Kondapur, Hafeezpet, Financial
District, Manikonda.

## spots

| Field | Type | Meaning | PD |
|---|---|---|---|
| `id` | `bigserial` PK | | no |
| `area_id` | `smallint` FK → areas | Which area it is searched under | no |
| `name` | `text` | Venue name. **Fictional in v1** — no real business is named. | no |
| `kind` | `text` CHECK | `mall` \| `apartment` \| `office` \| `gym` \| `commercial` | no |
| `address_line` | `text` | Human-readable location. Fictional. | no |
| `lat`, `lng` | `double precision` | Map pin | no |
| `price_per_hour_paise` | `integer` CHECK ≥ 0 | **Paise, not rupees.** 4000 = ₹40.00. ADR-003. | no |
| `opens_at` | `time` | Earliest bookable local time | no |
| `closes_at` | `time` | Latest bookable local time | no |
| `is_active` | `boolean` | Soft delete — never hard-delete a spot with bookings | no |

## bays

| Field | Type | Meaning | PD |
|---|---|---|---|
| `id` | `bigserial` PK | The unit that gets booked | no |
| `spot_id` | `bigint` FK → spots | | no |
| `label` | `text` | e.g. `B-12`. Shown on the confirmation so the driver knows where to go. | no |
| `is_active` | `boolean` | Soft delete | no |

## bookings

| Field | Type | Meaning | PD |
|---|---|---|---|
| `id` | `bigserial` PK | Internal only. **Never in a URL** — ADR-002. | no |
| `bay_id` | `bigint` FK → bays | | no |
| `window_at` | `tstzrange` | **Half-open `[start, end)`.** A booking ending 12:00 and one starting 12:00 do not conflict. This is a product rule, not a technicality. | no |
| `driver_phone` | `text` | Contact. **The primary PD field.** | **yes** |
| `driver_name` | `text` NULL | Optional. | **yes** |
| `vehicle_reg` | `text` | Registration plate — identifies a vehicle and by extension a person. | **yes** |
| `reference_code` | `text` UNIQUE | 10 chars, Crockford base32, CSPRNG, ≈50 bits. **This is the authorisation** — treat as a secret. | no, but **secret** |
| `amount_paise` | `integer` CHECK ≥ 0 | Server-computed. Never accepted from the client. ADR-003. | no |
| `status` | `text` CHECK | `pending` \| `confirmed` \| `cancelled` \| `expired` | no |
| `arrived_at` | `timestamptz` NULL | Driver-reported arrival. North-star signal. | no |
| `created_at` | `timestamptz` | | no |

**Billing rule:** whole hours, rounded **up**. A 90-minute window bills 2 hours. Written
down because integer division would otherwise decide it silently.

**`expired` is computed, not swept.** A `pending` booking whose window has passed is
treated as expired at read time — there is no worker.

## payments

| Field | Type | Meaning | PD |
|---|---|---|---|
| `id` | `bigserial` PK | | no |
| `booking_id` | `bigint` FK → bookings | One payment per booking in v1 | no |
| `amount_paise` | `integer` | Mirrors the booking amount | no |
| `provider` | `text` | Always `'simulated'` in v1. The column exists so adding a real gateway is a value change, not a migration. | no |
| `status` | `text` CHECK | `pending` \| `paid` \| `failed` | no |
| `created_at` | `timestamptz` | | no |

**No card data, ever.** No PAN, no CVV, no token. If a real gateway is added it is
redirect/SDK based and card data never touches this database. Stated now so it cannot be
walked back casually.

## search_events

| Field | Type | Meaning | PD |
|---|---|---|---|
| `id` | `bigserial` PK | | no |
| `session_id` | `text` | Random per-visit value. **Not a user id**, not stable across visits, not derived from IP or phone. | no |
| `area_id` | `smallint` FK → areas | | no |
| `window_start`, `window_end` | `timestamptz` | What was searched for | no |
| `result_count` | `integer` | 0 = the empty-result metric | no |
| `created_at` | `timestamptz` | | no |

Deliberately contains **no** personal data and no IP address. It exists to answer "which
areas have no supply", which needs none.

## owners

| Field | Type | Meaning | PD |
|---|---|---|---|
| `id` | `bigserial` PK | Surrogate key | no |
| `spot_id` | `bigint` FK → spots | Which spot this token controls. Unique among active rows — enforced by a partial unique index, not a table-level constraint, so a revoked row does not block its replacement. | no |
| `owner_token` | `text` UNIQUE | CSPRNG-generated, 10+ chars Crockford base32, ≈50 bits. **This is the authorisation** — treat as a secret (ADR-004). Same rules as `reference_code`: never in logs, page titles, analytics events, or referrer headers. | no, but **secret** |
| `owner_phone` | `text` NULL | Contact phone for the person who was handed the token. Operational field for the team — **not** a lookup key. No endpoint accepts a phone number to find an owner. | **yes** |
| `owner_name` | `text` NULL | Name of the person who was handed the token. Same operational purpose as `owner_phone`. | **yes** |
| `is_active` | `boolean` | Revocation flag. Set `false` to revoke; insert a new row with a fresh token. Never hard-delete — the row is the audit trail. | no |
| `created_at` | `timestamptz` | | no |

Created at onboarding, which is manual in v1 (the team generates the token and hands it
over out of band). A spot with no row in `owners` is unowned — unreachable from the owner
surface but fully functional on the driver side.

---

## Summary: where personal data lives

Five columns, in two tables:

- `bookings.driver_phone`, `bookings.driver_name`, `bookings.vehicle_reg`
- `owners.owner_phone`, `owners.owner_name`

**Driver PD** (bookings) — carried into `design/threat-model.md`:
- Readable only by presenting the `reference_code`
- Must never appear in logs, error messages, URLs, page titles, or map tile requests
- Nulled 12 months after the booking window ends (documented; not implemented in v1 —
  no sweeper)

**Owner PD** (owners):
- Readable only by presenting the `owner_token` (ADR-004)
- Same log/URL/page-title rules as driver PD
- Nulled when the owner relationship ends; the row is kept for revocation history
