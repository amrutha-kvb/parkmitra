# Spike result — go / pivot / kill

**Assumption under test:** A2 — two drivers cannot be sold the same bay for overlapping
windows, and that guarantee must hold under concurrency without application-level locking.

**Verdict: GO.**

## What was built

Throwaway SQL and a shell runner, in `spike/`. Not the real schema — one table, one
constraint, five checks. Roughly 40 lines.

The mechanism: a Postgres exclusion constraint combining equality on `spot_id` with
range overlap on a `tstzrange` window, which needs the `btree_gist` extension to mix the
two operator classes.

```sql
CONSTRAINT no_double_booking
  EXCLUDE USING gist (spot_id WITH =, window_at WITH &&)
```

## What it proved

Full output in `spike/run-output.txt`. Summary:

| Check | Expected | Result |
|---|---|---|
| Plain booking | accepted | `INSERT 0 1` |
| Overlapping window, same spot | rejected | `ERROR: conflicting key value violates exclusion constraint "no_double_booking"` |
| Adjacent window (12:00 after 10:00-12:00) | accepted | `INSERT 0 1` |
| Same window, different spot | accepted | `INSERT 0 1` |
| **10 concurrent inserts, same spot, same window** | **exactly 1 winner** | **1 winner (`racer-2`)** |

The last row is the one that mattered. Ten parallel `psql` processes raced for the same
bay and the database admitted exactly one. No advisory lock, no `SELECT FOR UPDATE`, no
retry loop, no application code at all.

## What it changed

**1. The stack decision is now made on evidence.** SQLite has no exclusion constraints, so
this rules it out for the booking table regardless of how convenient it would have been for
a three-day build. Recorded in `design/stack.md`.

**2. Half-open ranges are the right model, and that is a product decision, not a technical
one.** `tstzrange` defaults to `[start, end)`. A booking ending at 12:00 and one starting
at 12:00 do not overlap, so back-to-back bookings are allowed automatically. Had ranges
been inclusive at both ends, every handover minute would have been a false conflict. This
is now a rule the product depends on and it will be stated in the data dictionary.

**3. Correctness moves out of the endpoint.** The booking endpoint does not need to check
availability before inserting — it inserts and handles the constraint violation. That is a
smaller, safer endpoint than the read-then-write version, and it cannot be broken by a
future developer forgetting the check.

## What it did not prove

- Nothing about A1 (will a building admit a stranger). Untouched, and untouchable in the
  time available.
- Nothing about behaviour on a hosted free-tier Postgres — this ran against local
  Postgres 18. `btree_gist` is a standard contrib extension and is available on Neon and
  Supabase, but "available" is not "verified here". Carried into phase 3 as a deployment
  check rather than an assumption.
- Nothing about performance at scale. Irrelevant at this size.

## Kill conditions that did not trigger

The spike would have killed the design if: two racers had won; or `btree_gist` had been
unavailable; or adjacent bookings had been rejected as conflicts. None occurred.

Had two racers won, the pivot was already chosen: serialise per spot with an advisory lock
and accept the throughput cost. Not needed.
