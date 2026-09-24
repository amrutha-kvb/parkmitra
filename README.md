# parkmitra

**Short-stay parking against idle private capacity, in Hyderabad.**

Malls, apartment blocks and gyms have bays sitting empty for hours. parkmitra finds one
near where you are going and holds it by the hour.

🔗 **Live:** https://parkmitra-nu.vercel.app  ·  **v1.0.0**  ·  [changelog](CHANGELOG.md)

[![CI](https://github.com/amrutha-kvb/parkmitra/actions/workflows/ci.yml/badge.svg)](https://github.com/amrutha-kvb/parkmitra/actions/workflows/ci.yml)

---

## Why this exists

On the night of 11 September 2026 there was a car, a lane too narrow to park in without
blocking it, and a building with no parking of its own. Three minutes away, a gym had an
empty lot.

The space existed the whole time. There was simply no way to find it or ask for it.

Parking in dense areas is not scarce so much as **unevenly idle**: a mall lot is full at
7pm and empty at 11am, an office basement is dead all weekend, an apartment's visitor bays
go unused every working day. Meanwhile someone fifty metres away is circling, or blocking a
lane, or abandoning the trip.

---

## What is real, and what is not

Stated plainly, because a live URL with invented data and no disclosure is a false claim.

| | |
|---|---|
| ✅ **Real** | The booking engine. Availability is derived from actual bookings, prices are computed server-side, and **one bay cannot be held by two cars at once** — enforced by a database constraint, proven under concurrency. |
| ⚠️ **Seeded** | Every parking spot is invented. No real business is named, because listing somewhere without its owner's consent is not ours to do. |
| ⚠️ **Simulated** | Payment. A `payments` row is written and the booking confirms, but no money moves — taking money needs KYC and a settlement account that do not exist yet. |

---

## The one flow

```
Pick an area and a window  →  See bays actually free  →  Choose a bay
        →  Book  →  Pay (simulated)  →  Arrive with a reference code
```

There are no accounts. A booking is addressed by a ~50-bit reference code, and holding that
code *is* the authorisation to read or change it. Losing it means losing the booking — a
deliberate trade recorded in [ADR-002](design/adr/ADR-002-no-accounts-reference-code-as-capability.md).

---

## Quick start

**Requires:** Node ≥ 20.9 · PostgreSQL ≥ 14 running locally (with the `btree_gist`
extension available — it ships with a standard install)

```bash
git clone https://github.com/amrutha-kvb/parkmitra.git
cd parkmitra

npm install
cp .env.example .env.local      # defaults to postgres://localhost:5432/parkmitra_dev
npm run db:setup                # creates the database, migrates, seeds
npm run dev                     # → http://localhost:3000
```

`npm run db:setup` is idempotent — run it any time to reset to clean seed data.

### Verify it works

```bash
npm run verify        # typecheck + unit/integration tests + end-to-end
```

| Command | What it runs |
|---|---|
| `npm test` | Unit and integration suites, against a real database |
| `npm run test:e2e` | Playwright through the whole flow in a browser |
| `npm run typecheck` | `tsc --noEmit` |

The e2e suite can be pointed at any deployment:

```bash
PLAYWRIGHT_BASE_URL=https://parkmitra-nu.vercel.app npm run test:e2e
```

**One run at a time per database.** The suites talk to a real Postgres and several of them
truncate `bookings`, so two concurrent runs against the same `DATABASE_URL` will wipe each
other's rows mid-assertion. The symptom is alarming and misleading — the concurrency test
reports that more than one booking won the same bay, which is the one thing this product
guarantees. The constraint is fine; the two runs are not.

If you need genuine parallel runs, give each one its own database. CI does exactly that: a
dedicated Postgres service container per job.

---

## How it is built

**Next.js (App Router) · TypeScript · PostgreSQL · Leaflet + OpenStreetMap · Vercel + Neon**

One deployable, one database, no background workers. Stack reasoning, including what was
rejected, is in [`design/stack.md`](design/stack.md).

### The decision that matters

A booking system that hands the same bay to two drivers is worthless, and that failure only
appears under concurrency — so it passes every manual test and ships broken.

Rather than check-then-insert (a race) or an advisory lock (correct, but a convention every
future code path must remember), the guarantee lives in the schema:

```sql
CONSTRAINT bookings_no_overlapping_active
  EXCLUDE USING gist (bay_id WITH =, window_at WITH &&)
  WHERE (status <> 'cancelled')
```

The booking endpoint does not check availability. It inserts, and translates a `23P01`
violation into `409 Conflict`. Correctness stops depending on discipline.

`tests/concurrency.test.ts` fires ten genuinely parallel bookings for the same bay and
asserts exactly one survives. Drop the constraint and it fails with *"expected length 1 but
got 10"* — which is how we know it tests something.

Full reasoning: [ADR-001](design/adr/ADR-001-booking-guarantee-in-the-database.md).

### Other rules worth knowing

- **Money is integer paise, everywhere.** Never floats, never rupees in code. The client
  never sends an amount — the server computes it, so price tampering is not possible.
  ([ADR-003](design/adr/ADR-003-money-as-integer-paise-server-computed.md))
- **Windows are half-open** `[start, end)`. A bay booked 10:00–12:00 is free at 12:00.
- **An unknown reference code and a wrong one return identical responses**, so failures
  leak nothing to someone guessing.

---

## Project layout

```
app/              screens (S1–S6) and API route handlers
lib/              availability query, money, database pool, validation
db/migrations/    schema, in order, each with a down migration
db/seed.sql       7 areas, 20 invented spots, 106 bays
tests/  e2e/      integration suites and the browser flow
scripts/          db-setup.sh

discovery/        problem, personas, metrics, landscape, charter, assumptions
design/           architecture, ADRs, data model, OpenAPI contract, threat model,
                  wireframes, mockups, accessibility baseline
plan/             scope cut, backlog, sequence, Definition of Done, test strategy, risks
docs/             runbook, handover, retrospective, measured performance, effort
field/            findings, session logs, tool switches — the build's field report
```

The API contract in [`design/openapi.yaml`](design/openapi.yaml) was written **before** any
implementation and is binding. It **validates** under `redocly lint`, with two warnings —
both `operation-4xx-response` on `/areas` and `/health`, which take no input and have no
authorisation, so neither has a 4xx to return. Recorded rather than silenced: the rule is
right in general and wrong for these two, and a suppressed warning is a warning nobody
re-examines.

---

## Deployment

Hosted on Vercel with a Neon Postgres database. `DATABASE_URL` lives in the host's
environment settings and is never committed.

```bash
npm i -g vercel
vercel link
vercel deploy --prod
DATABASE_URL="<neon-url>" ./scripts/db-setup.sh   # migrate + seed the hosted database
```

---

## Deliberately not built

Each of these is a decision, recorded with its reason in
[`plan/scope.md`](plan/scope.md) — not an oversight.

- **Supply-side onboarding.** No flow for a building to list its own bays. This is the real
  product and the real risk, and it is a trust problem rather than a software one.
- **Enforcement.** No barriers, sensors or guard app. A booking is a promise, and the
  product says so rather than implying otherwise.
- **Real payments, accounts, cancellations, notifications.**
- **Multi-day parking.** v1 is 1–12 hours. Days need different pricing and probably a
  deposit; the core of this is a quick nearby spot, not storage.

## Known limitations

- Arrival is self-reported, so the north-star metric under-counts.
- Free-tier Postgres suspends when idle; the first request after a pause is slow, and the
  interface says so rather than hiding it behind a spinner.
- English only — a real limitation in Hyderabad.
- Accessibility is audited by keyboard and automated checks, not on a screen reader.
- **No linter.** Next 16 removed `next lint` and ESLint cannot parse this project's
  TypeScript — typescript-eslint does not support TS 7 yet. `npm run typecheck` runs in CI
  and is stricter about types, but the react-hooks and Next-specific rules are unchecked.
  Recorded rather than papered over with a lint that only reads config files.

---

## If you are picking this up

Read in this order. Each is short and none repeats another.

| | |
|---|---|
| [`docs/handover.md`](docs/handover.md) | What to do next, and what not to do. Start here. |
| [`docs/demo-script.md`](docs/demo-script.md) | Ten minutes, from the hosted instance, product before slides |
| [`design/adr/ADR-001…`](design/adr/) | Why the booking guarantee lives in the database |
| [`docs/runbook.md`](docs/runbook.md) | What to do when it breaks, with measured recovery times |
| [`field/security-review.md`](field/security-review.md) | Eight controls tested; two gaps stated |
| [`docs/performance.md`](docs/performance.md) | What was measured, and the one number that is not proven |
| [`docs/retrospective.md`](docs/retrospective.md) | What went wrong, including the parts that are mine |

The one thing to know before changing anything: **no-double-booking is enforced by a
Postgres exclusion constraint, not by application code.** If you find yourself checking
availability in TypeScript and then inserting, stop — that reads correctly and fails under
concurrency, which is the only condition that matters.

---

## Licence

MIT
