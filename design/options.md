# Solution approaches considered

Three shapes for the same flow, compared at phase 3 before anything was built. The flow is
fixed by `plan/scope.md`; what varies is where availability is decided and where correctness
lives.

---

## Option A — Read-then-write availability in the application

Search endpoint queries free bays. Booking endpoint re-checks availability, then inserts.

**For:** obvious, portable to any database, easy to read.

**Against:** it is a race, and a quiet one. Between the check and the insert, another
request can take the bay. It passes every manual test and fails in production under exactly
the conditions that matter — two people booking the popular bay at the same moment. The
spike was pointed at this precise failure.

**Rejected.** The one guarantee this product sells is that your bay is yours.

---

## Option B — Serialise per spot with an advisory lock

Take a Postgres advisory lock keyed on the bay, check, insert, release.

**For:** correct. Works on any relational database. Explicit and easy to reason about.

**Against:** correctness depends on every future write path remembering to take the lock.
The guarantee lives in application code and can be forgotten by the next person, or by me
on day three. Also serialises bookings per bay, which is fine at this size and would not be
later.

**Rejected**, but it was the fallback if the spike had failed — recorded in
`discovery/spike-result.md`.

---

## Option C — Let the database refuse it *(chosen)*

A Postgres exclusion constraint on `(bay_id, window)` makes an overlapping booking
impossible to insert. The booking endpoint does not check availability at all: it inserts
and handles the violation.

**For:**
- The guarantee is structural. It cannot be forgotten, bypassed, or broken by a new code
  path, because it is not in code.
- The endpoint gets *smaller* — no check, no lock, no retry loop.
- Proven under concurrency at the spike: ten racers, one winner.
- Half-open ranges make back-to-back bookings work without special-casing handover minutes.

**Against:**
- Ties the booking table to Postgres. Accepted, and recorded in ADR-001.
- Needs the `btree_gist` extension, which must exist on the hosted database. Carried as a
  deployment check, not an assumption.
- The failure arrives as a constraint-violation error code that the endpoint must
  translate into a clean 409, rather than as a tidy boolean. Minor.

**Chosen.** The argument is not that it is clever — it is that correctness stops depending
on discipline.

---

## Where availability is computed

Separate from the above, and worth stating because it is the other real choice.

Availability is **derived, never stored**. There is no `is_available` column and no
materialised free/busy table. A bay is free for a window if no non-cancelled booking
overlaps it, computed at query time.

The alternative — a stored availability table kept in sync — was rejected because two
sources of truth for the same fact is how booking systems drift, and the sync bug is
invisible until a driver is standing in an occupied bay. At this scale the query is cheap.
