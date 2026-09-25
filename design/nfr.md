# Non-functional requirements

Budgets, not aspirations. Each is measured in phase 7 against the number written here, and
the measured figure is reported even when it misses.

## Latency budget

Measured server-side, p95, warm.

| Path | Budget | Why this number |
|---|---|---|
| `GET /api/areas` | 100 ms | Seven rows, effectively static. Anything slower means a connection problem, not a query problem. |
| `GET /api/availability` | **400 ms** | The one that matters. It is the product's actual answer and it runs while someone waits with a decision to make. |
| `POST /api/bookings` | 500 ms | One insert. The exclusion constraint does the work. |
| `GET /api/bookings/{ref}` | 250 ms | Single indexed lookup. |
| First contentful paint, search page | 2.5 s on 4G | Indian mobile reality, not desk wifi. |

**Cold start is excluded from these figures and reported separately.** Neon's free tier
suspends an idle database and the first query after suspension pays several seconds. That
is a property of the free tier, not of the query, and hiding it inside a p95 would be
dishonest in both directions. Phase 7 reports warm p95 *and* a measured cold-start number.

### Measured, 2026-09-25

Server-side, via `Server-Timing`, on the live deployment. 25 warm requests each.

| Path | Budget | p95 measured | |
|---|---|---|---|
| `GET /api/areas` | 100 ms | **7.1 ms** | PASS |
| `GET /api/availability` | 400 ms | **24.2 ms** | PASS |

Full method, the end-to-end figures, and the trap that nearly produced the opposite verdict
are in [`docs/performance.md`](../docs/performance.md).

## Cost budget

Hard constraint: **₹0 / month.** Free tiers only. Anything requiring a card is out of scope
by definition, which is why there is no Google Maps, no SMS and no payment gateway.

| Service | Tier | Ceiling that matters | Headroom |
|---|---|---|---|
| Vercel | Hobby | 100 GB bandwidth/mo, 100 h build | Enormous at demo scale |
| Neon | Free | 0.5 GB storage, ~191 compute-hours/mo, auto-suspend | Storage is the non-issue; compute-hours are the real limit |
| OpenStreetMap tiles | Public | Fair-use policy, no key | Must not hammer — tiles are cached by the browser and the map loads at a fixed zoom |

**Tracked in phase 7 and reported in the field report:** bandwidth used, Neon
compute-hours, database rows, build minutes. The programme asks for the real number, so the
real number goes in even if it is embarrassing.

**Token/AI budget: ₹0 and 0 tokens.** parkmitra calls no model at runtime. It is not an AI
product; niha was the tool used to build it, not a dependency of it. Worth stating because
"AI challenge" invites the assumption that the product must contain a model, and this one
deliberately does not.

## Expected scale

Demo and pilot scale, stated plainly so the design is not over-built:

- 7 areas, ~20 spots, ~60 bays seeded
- Tens of bookings, not thousands
- A handful of concurrent users; a judge, and perhaps a few friends

The design is nonetheless correct under concurrency (ADR-001) because correctness is not a
scale question — two people racing for one bay happens at any volume, and it is the thing
the product sells.

**What would break first at 100×:** the availability query does a scan across bays per area
per search. At real scale it needs the window predicate pushed into a partial index and
probably per-area partitioning. Named now so it is a known ceiling, not a surprise.

## Data classification

| Class | Data | Handling |
|---|---|---|
| **Personal** | `driver_phone`, `driver_name`, `vehicle_reg` | Three columns, one table. Readable only with the reference code. Never logged, never in a URL, never in an error message. |
| **Secret** | `reference_code`, `DATABASE_URL` | The code is a capability (ADR-002). The connection string lives in the host's environment settings, never in the repo. |
| **Public** | areas, spots, bays, prices | Fictional in v1 anyway. |
| **Analytics, non-personal** | `search_events` | Deliberately contains no IP and no user id. |

## Accessibility

Baseline set now rather than retrofitted, so it is a requirement and not a phase-7 apology:

- Contrast ≥ 4.5:1 for text
- Every interactive control reachable and operable by keyboard, visible focus ring
- Form errors announced, not only coloured
- Map is an enhancement, never the only route — every spot reachable from the list alone
- `prefers-reduced-motion` respected

Audited in phase 7 against this list.

## Reliability

No uptime SLO is claimed. It is a free tier and a pilot. What *is* required:

- No data loss on a failed booking — the constraint either admits it or refuses it, never
  half-writes it
- A refused booking (409) leaves no orphan `payments` row
- The app renders a usable error state when the database is unreachable, rather than a
  stack trace
