# Deploying parkmitra

Written so someone who has never deployed this can do it once, correctly, and know whether
it worked. For what to do when it breaks afterwards, see [`runbook.md`](runbook.md).

| | |
|---|---|
| **Live** | https://parkmitra-nu.vercel.app |
| **App** | Vercel (Hobby) |
| **Database** | Neon Postgres 16 (free tier), `us-east-1` |
| **Cost** | ₹0. No card on either service |

---

## First deployment, from nothing

### 1. The database

Create a Neon project and copy the **pooled** connection string.

```bash
DATABASE_URL="postgres://…neon.tech/parkmitra?sslmode=require" ./scripts/db-setup.sh
```

This applies every migration in `db/migrations/` in order and loads `db/seed.sql`.

**It drops and recreates, and it refuses to do that against a non-local URL** — against a
hosted database it applies migrations only. Read the script before pointing it anywhere you
care about.

Confirm the guarantee actually installed. A migration that ran without error is not the same
as a constraint that exists:

```bash
psql "$DATABASE_URL" -c "\d bookings" | grep no_overlapping
```

No output here means the product will happily double-book. Stop and fix it before deploying.

### 2. The app

```bash
npm i -g vercel
vercel link
vercel env add DATABASE_URL production     # paste the pooled Neon URL
vercel --prod
```

`DATABASE_URL` lives only in Vercel's environment settings. It is never committed; the only
env file in the repo is `.env.example`, holding a localhost placeholder.

### 3. Point the stable alias at it

```bash
vercel alias set <deployment-url> parkmitra-nu.vercel.app
```

**Do not skip this, and do not assume it happened.** Vercel's per-deployment URLs change
every time; the alias is what the README, the runbook, the health alert and the judges all
use. It has silently served a stale build before — including one without the accessibility
fix — which is why step 4 exists.

### 4. Verify, by behaviour and not by the success message

```bash
curl -s https://parkmitra-nu.vercel.app/api/health
```

```json
{"status":"ok","checks":{"database":true,"booking_guarantee":true},
 "version":"1.0.0","commit":"8237424","uptime_seconds":19}
```

Check `commit` against `git rev-parse --short=7 main`. If they differ, the alias is pointing
at an older deployment — go back to step 3. This is the whole reason the endpoint reports a
commit.

Then run the real thing against it:

```bash
PLAYWRIGHT_BASE_URL=https://parkmitra-nu.vercel.app npm run test:e2e
```

Six specs, including a full booking and two accessibility audits. **This is the check that
matters** — everything above can pass while the flow is broken.

---

## Deploying a change

```bash
npm run verify          # typecheck + unit + e2e, locally, BEFORE pushing
git push                # CI runs the same against a real Postgres
vercel --prod
vercel alias set <new-url> parkmitra-nu.vercel.app
```

Then step 4 again, every time.

Main is protected: changes go through a pull request with green CI. CI runs typecheck, 228
unit tests and the Playwright suite against a Postgres 16 service container with the real
migrations applied, and asserts the exclusion constraint exists before any test runs.

## Migrations

Forward-only, applied deliberately, never by the deploy:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/00N_whatever.sql
```

Every migration has a `_down` counterpart, also applied by hand. **A rollback of the app does
not roll back the schema** — roll the app back first, then decide about the schema
separately.

## Scheduled jobs

```
0 * * * * cd /path/to/parkmitra && ./scripts/rate-limit-sweep.sh
```

See the runbook. Not running it does not break anything today; it slowly fills the database.

## Things that bit us, so they do not bite you

- **`.env.example` was excluded from the repo** by a `.env*` rule sitting below the
  negation, which broke step 3 of the README on a fresh clone.
- **`moduleResolution: "Node16"`** and tests being type-checked into the build both failed
  only on Vercel, never locally.
- **`useSearchParams()` without a `<Suspense>` boundary** fails the production build and not
  `next dev`.
- **`export const dynamic` is silently ignored in a client component.**

Every one of these was invisible locally. If a deploy fails and the local build is green,
suspect the difference between the two before suspecting your change.
