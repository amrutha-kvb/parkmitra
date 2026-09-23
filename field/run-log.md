# Run log — phase 9

Gate 7 asks for two things done **on purpose** on the live deployment: a rollback
executed, and an alert fired. Both below, with what they cost.

---

## Rollback — executed 2026-09-23

Chosen deliberately so the result was observable rather than merely reported: the current
production carried `/api/health`, the previous deployment did not.

```
BEFORE
  current  /api/health → HTTP 200
  previous /api/health → HTTP 404

$ npx vercel rollback https://parkmitra-9vqz8xfx7-…vercel.app --yes
> Success! parkmitra was rolled back to parkmitra-9vqz8xfx7-… (dpl_BAdM5481cXJbExzzSpcofHtpG4ia) [2s]
  rollback command took: 7s

ROLL FORWARD
> Success! parkmitra was rolled back to parkmitra-3hjxchudf-… (dpl_BoWfKfx23EJ9x4kg2rGzdb41XAQP) [2s]
  roll-forward took: 6s
  /api/health → HTTP 200
```

**Cost: 7 seconds out, 6 seconds back.** No data loss — a rollback swaps the application,
not the database. That distinction is written into the runbook, because the instinct under
pressure is to assume a rollback undoes everything, and here it does not touch the schema.

---

## Alert — fired 2026-09-23 by breaking production on purpose

The health check does not ask whether the process is alive. It asks whether the promise
still holds, by querying `pg_constraint` for the exclusion constraint. A liveness ping
would have reported everything fine throughout what follows.

```
1. break it — against the PRODUCTION database
$ psql "$DATABASE_URL" -c "ALTER TABLE bookings DROP CONSTRAINT bookings_no_overlapping_active;"
  constraint dropped

2. the live endpoint notices
$ curl .../api/health
{"status":"degraded","checks":{"database":true,"booking_guarantee":false},…}
  [HTTP 503]

3. the alert fires
$ ./scripts/health-alert.sh
ALERT: parkmitra is degraded — a health check is failing
… If booking_guarantee is false the exclusion constraint is missing and DOUBLE BOOKINGS ARE POSSIBLE.
(alert raised: https://github.com/amrutha-kvb/parkmitra/issues/15)
  exit=1

4. restore
$ psql "$DATABASE_URL" -c "ALTER TABLE bookings ADD CONSTRAINT … EXCLUDE USING gist …;"
  time to recover: 2s

5. recovered, and proven rather than assumed
$ curl .../api/health                       → 200 {"status":"ok",…}
$ ./scripts/health-alert.sh                 → healthy, exit=0
   first booking                            → HTTP 201
   overlapping booking on the same bay      → HTTP 409
```

**Cost: 2 seconds to recover.** Alert issue #15 raised and closed with the explanation.

### What this exercise actually caught

The first version of `health-alert.sh` **printed `ALERT:` and exited 1 while creating
nothing**. The `alert` label did not exist on the repository and the failure went to
`/dev/null`.

It was only found by checking whether the issue existed rather than trusting the script's
own output — which is the entire argument for firing the alert on purpose instead of
writing one and assuming it works. An alerting script that reports success while alerting
nobody is worse than having none, because it buys false confidence. The error handling is
fixed and the reason is recorded in the script.

---

## Cost and free-tier watch

| | Measured 2026-09-23 |
|---|---|
| Vercel | 12 production deployments, all within Hobby limits. Build ~15-20s each. |
| Neon | Storage negligible (7 areas, 20 spots, 106 bays). Compute-hours the real constraint. |
| Cold start | Present on the free tier and surfaced in the interface after ~3s rather than hidden. |
| Spend | **₹0.** No card on any service. |
| Model spend | `niha export` reports **$0.2629** across the build sessions. |

## Still outstanding

- **A deputy owner.** Named as missing rather than pretended.
- **Real users.** Phase 9 asks for the first three people and what broke. Not reached
  inside the challenge window; stated rather than fabricated.
- **The thirty-day decision** — adopt, hand over, or retire — falls after submission.
