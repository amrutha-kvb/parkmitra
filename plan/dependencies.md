# Dependencies

What this product needs from the outside world, and what happens when each of them is not
there. The **slice-to-slice** dependency graph lives in [`sequence.md`](sequence.md) and is
not repeated here; this document is about everything the team does not control.

The test applied to each one: *if this disappeared on a Tuesday, what would a user see, and
what would we do that afternoon?* A dependency nobody has answered that question about is
an outage waiting to be discovered in production.

---

## Runtime services

| Service | Used for | If it fails | Lock-in |
|---|---|---|---|
| **Neon** (Postgres 16) | Everything. The booking guarantee is a Postgres exclusion constraint (ADR-001) | Total outage. `/api/health` returns 503 and says which check failed | **Low on the database, high on the guarantee.** Plain SQL, no ORM, so any Postgres works — but the product depends on `btree_gist` and `EXCLUDE`, which rules out MySQL and most "Postgres-compatible" layers |
| **Vercel** | Hosting the Next.js app | Site down. Nothing is lost; the database is elsewhere | **Low.** Next.js runs anywhere Node runs. The one Vercel-specific thing is `x-forwarded-for` for rate limiting and `VERCEL_GIT_COMMIT_SHA` in `/api/health`, both with fallbacks |
| **OpenStreetMap tiles** | The map on S2 | **Degraded, not down.** Markers and the spot list still render; the tiles behind them go blank. Every spot is also in a list below the map, deliberately, so the map is never the only route to a booking | **None.** Any XYZ tile provider substitutes |

**Neon is the single point of failure and is accepted as one.** The alternative — a second
database — costs more than the outage would, at this scale, and would not remove the
dependency so much as double it. The free tier also suspends on idle, which is a known
~3-second cold start, surfaced in the interface rather than hidden.

## Libraries

| Package | Pinned | Why it is here | Replaceable |
|---|---|---|---|
| `next` | ^16.3.6 | App Router, route handlers, SSR | Hard. It shapes the file layout |
| `react` / `react-dom` | ^19.3.0 | Comes with Next | Hard |
| `pg` | ^8.23.0 | Postgres driver. **No ORM, deliberately** (ADR-001) — the guarantee is expressed in SQL and an ORM would hide it | Easy. It is a thin driver |
| `leaflet` / `react-leaflet` | ^1.9.4 / ^5.0.0 | The map | Easy, and the product survives without it |

Everything else is a dev dependency: `vitest`, `@playwright/test`, `@axe-core/playwright`,
`typescript`, `vercel`. None ships to a user.

**There is no linter in this list, and that is a gap, not an omission.** Next 16 removed
`next lint`, and ESLint cannot parse this project's TypeScript because typescript-eslint
does not support TS 7. Recorded in the README and the handover rather than papered over.

## Tooling the build depends on

| | Needed for | Failure seen |
|---|---|---|
| **niha CLI** | The challenge's own requirement to build through it (R1) | Two real outages during this build: a 20-hour provider-credit outage (F-03) and a mid-session credential expiry (F-13, F-14). Both are declared in `field/tool-switches.md` with what was done instead |
| **GitHub Actions** | CI: typecheck, 228 tests, Playwright, against a real Postgres service container | Nothing ships unverified; merges block. Branch protection is on, so this is deliberate |
| **psql** | `scripts/db-setup.sh`, the migrations, the rate-limit sweep | Local setup only |

## People

**One.** The runbook names a single owner and no deputy, and says so explicitly rather than
leaving it implied. A service with one name against it is unowned the first week that person
is unavailable. It is the first item in the handover for a reason.

## What is deliberately *not* a dependency

- **No payment provider.** Payment is simulated. Adding one is handover ticket 2 and brings
  PCI scope with it.
- **No email or SMS provider.** There are no accounts and no notifications; the reference
  code is the whole authorisation model (ADR-002).
- **No analytics, no error tracker, no CDN beyond Vercel's.** Each would be a third party
  receiving data about who parked where, which `design/threat-model.md` (T5) treats as
  personal data. The cheapest way to protect it is not to send it anywhere.
- **No model at runtime.** parkmitra calls no LLM. niha was used to build it, not to run it.
  The runtime AI budget is ₹0 and 0 tokens, as `design/nfr.md` sets out.
