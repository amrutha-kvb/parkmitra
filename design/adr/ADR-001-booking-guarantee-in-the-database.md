# ADR-001 — The no-double-booking guarantee lives in the database

**Status:** accepted
**Date:** 2026-09-22
**Phase:** 3, decided on evidence from the phase 2 spike

## Context

The product's single promise is that a booked bay is yours. Breaking it is not a degraded
experience, it is a driver standing in an occupied car park holding a worthless
confirmation — the exact situation parkmitra claims to remove.

The failure mode is specific: it only appears when two requests race. It passes every
manual test, every demo, and most test suites, because nobody clicks twice in the same
millisecond by hand.

## Decision

The guarantee is enforced by a Postgres exclusion constraint, not by application code:

```sql
CONSTRAINT no_double_booking
  EXCLUDE USING gist (bay_id WITH =, window_at WITH &&)
  WHERE (status <> 'cancelled')
```

The booking endpoint does **not** check availability before inserting. It inserts, and
translates a `23P01` exclusion violation into `409 Conflict`.

## Alternatives rejected

**Read-then-write in the application** — query for a free bay, then insert.
*Rejected:* it is a race between the check and the insert. It is also the version that
looks most obviously correct while being wrong, which makes it the most dangerous of the
three.

**Advisory lock per bay** — `pg_advisory_xact_lock(bay_id)`, check, insert, release.
*Rejected:* correct, but correctness becomes a convention. Every future write path must
remember the lock; the day someone adds an admin "force book" endpoint without it, the
guarantee is gone silently. It was kept as the fallback had the spike failed.

**Application-level mutex / queue** — serialise bookings through a single worker.
*Rejected:* needs infrastructure the free tier will not run reliably, and moves a database
problem into a distributed-systems problem.

**Unique constraint on (bay_id, start_time)** — the cheap approximation.
*Rejected:* it only stops two bookings starting at the same instant. A 10:00-12:00 and a
11:00-13:00 booking have different start times and would both be accepted. It is a
constraint that looks like a guarantee and is not one.

## Consequences

**Good**
- Cannot be forgotten, bypassed, or broken by a new code path — it is not in code.
- The booking endpoint is smaller: no check, no lock, no retry.
- Proven under concurrency: ten parallel inserts for the same bay produced exactly one
  winner (`spike/run-output.txt`).
- Half-open `tstzrange` semantics mean back-to-back bookings are allowed with no
  special-casing of handover minutes.

**Bad / accepted**
- The booking table is now Postgres-specific. Moving databases means reimplementing the
  guarantee. Accepted deliberately — portability is worth less than this.
- Requires the `btree_gist` extension on the hosted instance. Verified at deploy, not
  assumed.
- Failures arrive as a driver-level error code that must be translated. A `409` that leaks
  as a `500` would be a bug in the endpoint, and there is a test for it.
