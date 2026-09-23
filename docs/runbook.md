# Runbook

What to do when parkmitra misbehaves, written for someone who did not build it.

**Owner:** Amrutha Korumilli
**Deputy:** unassigned — stated plainly rather than left implied. A service with one name
against it is unowned the first week that person is unavailable, and this is the first
thing to fix if the project continues.

| | |
|---|---|
| **Live** | https://parkmitra-nu.vercel.app |
| **Health** | `/api/health` |
| **Hosting** | Vercel (app) · Neon (Postgres) — both free tier |
| **Alert** | `./scripts/health-alert.sh` → opens a GitHub issue labelled `alert` |

---

## The one alert

```bash
./scripts/health-alert.sh          # 0 healthy · 1 degraded · 2 unreachable
```

It does **not** check that the process is up. It asks whether the promise still holds:
`/api/health` queries `pg_constraint` and returns 503 if the exclusion constraint that
prevents double-booking has gone. The app can serve traffic perfectly while quietly
allowing two cars into one bay, and a liveness ping would call that healthy.

To run it on a schedule, add to crontab:

```
*/10 * * * * cd /path/to/parkmitra && ./scripts/health-alert.sh >> /tmp/parkmitra-health.log 2>&1
```

It raises at most one open issue at a time, so a flapping endpoint does not create fifty.

---

## Scheduled jobs

```
0 * * * * cd /path/to/parkmitra && ./scripts/rate-limit-sweep.sh
```

Deletes rate-limit counters older than an hour. The limiter only ever reads the current
minute, so everything older is dead weight — one row per IP per minute, for ever, if nobody
sweeps. It is not urgent on any single day and it is not optional over months.

Not running it does not break the limiter. It slowly fills the database the limiter exists
to protect, which is a worse failure than the one being prevented.

---

## Symptom → cause → fix

### `/api/health` returns 503 with `booking_guarantee: false`

**The serious one.** Double bookings are possible right now.

```bash
psql "$DATABASE_URL" -c "\d bookings" | grep no_overlapping   # confirm it is missing

psql "$DATABASE_URL" -c "ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlapping_active
  EXCLUDE USING gist (bay_id WITH =, window_at WITH &&)
  WHERE (status <> 'cancelled');"
```

If it refuses, overlapping rows already exist. Find them, decide which booking is honoured,
cancel the other — **never delete it**, set `status = 'cancelled'` so the record survives —
then add the constraint.

*Measured: 2 seconds to restore, verified 2026-09-23.*

### `/api/health` returns 503 with `database: false`

Usually Neon's free tier suspending after idle, which is expected and self-recovers on the
next request. If it persists: check the Neon dashboard, confirm `DATABASE_URL` in Vercel's
environment settings, redeploy.

### Health unreachable entirely

Check Vercel status and the deployment list. If a bad deploy is live, roll back — below.

### Bookings return 500 rather than 409 on a collision

The endpoint has stopped translating the Postgres `23P01` exclusion violation. The
guarantee still holds; the error is being mishandled. Check `app/api/bookings/route.ts`,
and `tests/concurrency.test.ts` should be failing.

---

## Rollback

**Practised, not theoretical** — executed on the live deployment 2026-09-23.

```bash
npx vercel ls                                  # find the last known-good URL
npx vercel rollback <deployment-url> --yes
```

*Measured: **7 seconds** to roll back, **6 seconds** to roll forward. Verified by
behaviour — `/api/health` disappeared and returned — not by trusting the success message.*

**A rollback does not undo a migration.** Schema changes are forward-only here; every
migration has a `_down` counterpart in `db/migrations/`, applied by hand and deliberately.
Roll the app back first, then decide about the schema separately.

---

## Restoring data

Seed data is fictional and reproducible:

```bash
DATABASE_URL="<url>" ./scripts/db-setup.sh
```

**This drops and recreates.** It refuses to do so against a non-local URL for exactly that
reason — read the script before pointing it at production.

---

## What breaks at 3am, honestly

- **Neon cold start.** First request after idle is slow. Not a fault; the interface says so
  rather than hiding it behind a spinner.
- **Free-tier limits.** Vercel bandwidth/build minutes, Neon compute-hours. Nothing pages
  you — check the dashboards.
- **Booking spam.** No accounts and no real payment, so nothing makes it cost anything
  (threat model T3). A known, accepted hole rather than an oversight.
- **A lost reference code.** Unrecoverable by design (ADR-002). There is no "look up my
  bookings by phone", because that endpoint would be the enumeration hole the whole
  capability model exists to avoid.

## What is deliberately not monitored

Latency, error rate and cost have budgets in `design/nfr.md` but no automated alert. At
this scale one meaningful alert that someone will act on beats five that get muted — and an
alert nobody reads is worse than none.
