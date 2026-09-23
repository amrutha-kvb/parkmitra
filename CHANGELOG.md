# Changelog

Notable changes to parkmitra. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-24

A hardening release. No new user-facing feature — every change closes a gap between what a
document claimed and what the code actually did.

### Added

**Rate limiting on every endpoint that needs it**, with per-scope budgets. `/api/availability`,
`/api/bays` and `POST /api/bookings` previously had none, while `design/threat-model.md`
already listed "rate limit booking creation per IP" as a control — the threat model claimed
something that did not exist. Booking creation is the T3 surface and was the least protected
thing in the product; it now has the tightest budget of any scope, at 10/minute.

Buckets are per scope because one shared bucket would have been worse than none: an ordinary
visitor would have exhausted a single 20/minute allowance across searching, browsing and
booking, and been locked out of the product by its own defence.

**Contract tests.** `e2e/contract.spec.ts` validates real API responses against
`design/openapi.yaml` with ajv. The contract has been described throughout this project as
binding and written before the implementation; nothing enforced that until now. It exercises
failure paths as well as 200s, because error shapes are what clients get wrong most often.

**`prefers-reduced-motion`.** Required by `design/a11y.md` since the baseline was written and
never implemented, while the loading skeleton carried an *infinite* pulse animation.

**The four-states register** (`design/states.md`), the endpoint audit
(`docs/endpoint-audit.md`) and the gate evidence index (`docs/gates.md`).

**An empty state on the home screen.** A migrated-but-unseeded database — which is what every
fresh deployment is before `db-setup.sh` runs — previously showed a form with no options, a
disabled button and no explanation.

### Fixed

- **`/bays` was missing from the API contract entirely**, and four operations returned a 429
  documented nowhere.
- **`docs/endpoint-audit.md` claimed two rate limits that were not wired.** Mine, and the same
  mistake that document criticises the threat model for two sections above.
- **The README said the contract "validates clean"**; it validates with two warnings. Both are
  `operation-4xx-response` on endpoints that have no 4xx to return. Recorded rather than
  silenced — a suppressed warning is one nobody re-examines.
- **Column padding in `scripts/db-setup.sh`** ran the longest migration filename into its own
  "ok". Found by following the README literally, on the local database it tells you to use,
  rather than the hosted one every previous check had used.
- The origin date in the discovery artifacts disagreed with the README.

### Changed

- **The accessibility baseline now describes the map as it is** — a labelled `role="region"`
  rather than `aria-hidden`. The specified approach was implemented in phase 7 and produced
  an `aria-hidden-focus` violation, so the document was corrected rather than the code. The
  direction matters: a baseline quietly edited to match whatever was built is not a baseline.

### Known gaps, unchanged

Rate limiting mitigates **T3 without closing it** — ten a minute is a speed bump, and the real
fix is payment plus phone verification (handover ticket 2). Payment is still simulated, supply
is still seeded, and there is still no linter because typescript-eslint does not support
TypeScript 7.

[1.1.0]: https://github.com/amrutha-kvb/parkmitra/releases/tag/v1.1.0

## [1.0.0] — 2026-09-23

First release. The primary flow runs end to end against a real database, with no mocked
steps between searching and a confirmed booking.

### Added

**The booking guarantee.** A bay cannot be double-booked. This is enforced by a Postgres
exclusion constraint over `(bay_id, window_at)` using `btree_gist`, not by application code
(ADR-001), and windows are half-open `[start, end)` so a booking may begin exactly when the
previous one ends. `tests/concurrency.test.ts` fires ten simultaneous inserts for the same
bay and window and asserts that exactly one succeeds and nine fail with `23P01`.

**Six screens.** Search (S1), results with a map (S2), spot detail (S3), booking (S4),
simulated payment (S5), confirmation (S6). Every screen has its failure path drawn and
implemented, not just the happy path.

**Server-computed pricing.** Money is stored and calculated as integer paise (ADR-003). No
amount is ever accepted from the client; `POST /api/bookings` derives it from a locked CTE
at insert time. Verified against production by posting `amount_paise: 0` and being charged
the correct 5000.

**Booking references instead of accounts.** A 10-character Crockford base32 code from a
CSPRNG (~50 bits) is the authorisation to view and cancel a booking (ADR-002). There is no
sign-up, and deliberately no "look up my bookings by phone" — that endpoint would be the
enumeration hole the capability model exists to avoid.

**Health that checks the promise, not the process.** `/api/health` queries `pg_constraint`
for the exclusion constraint and returns 503 if it is missing. The app can serve traffic
perfectly while quietly allowing two cars into one bay, and a liveness ping would call that
healthy. `scripts/health-alert.sh` polls it and opens a GitHub issue.

**Continuous integration.** Typecheck, 237 unit tests and the Playwright suite run on
every pull request against a real Postgres 16 service container with the real migrations
applied, plus an explicit assertion that the exclusion constraint exists before any test
runs.

### Fixed

- **Search windows lost the local timezone.** `toISOString()` converted to UTC, and slicing
  the trailing `Z` left a naive string, so in IST a 6:00 pm selection travelled as 12:30.
  Found by the user, testing the deployed build by hand.
- **`.env.example` was silently excluded** by a `.env*` rule below the negation, breaking
  step 3 of the README on a fresh clone.
- **The test suite only passed because of an exported shell variable.** Caught at Gate 6 on
  a clean checkout; `tests/setup-env.ts` now loads `.env.local` and fails with instructions
  when `DATABASE_URL` is absent.
- **Money display violated the project's own terminology rule** (`₹40`, not `₹40.00`) — and
  the generated test asserted the bug.
- **Two serious accessibility violations on the results map.** Leaflet renders markers as
  focusable `role="button"` images inside a container that claimed `role="img"`, producing
  `nested-interactive`; `aria-hidden` then produced `aria-hidden-focus`. Fixed by making the
  markup honest: a pannable map is a labelled `role="region"`, with every spot also in the
  list below it.
- **`npm run lint` had never worked.** Next 16 removed `next lint`, so the script resolved
  to `next <dir>` and failed with "Invalid project directory". ESLint cannot replace it yet
  either — typescript-eslint does not support TypeScript 7 — so the script was removed and
  the gap recorded rather than left as a command that looks like it lints and does not.
- **`tests/availability.test.ts` cleaned up with `DELETE FROM bookings`**, which fails as
  soon as any booking has a payment row. It passed against a database that had only ever run
  that suite and failed against one where anyone had paid through the app. Now truncates
  with `CASCADE`, verified against a deliberately created paid booking.
- **A stray `dist/tsconfig.tsbuildinfo` was committed** and `tsconfig.tsbuildinfo` was
  tracked. Both untracked; `dist/` is not a build output of this project at all.
- Several defects at the seams between separately generated files — a `bigint` arriving as a
  string and compared with `parseInt`, a link sending `?spot=` to a page reading `?spot_id=`,
  a query taking one parameter called with two. Each failed silently.

### Known gaps

Stated rather than quietly dropped; see `field/security-review.md`.

- **No rate limiting** on the booking lookup. `design/openapi.yaml` has been amended to stop
  advertising a `429` it does not return. Entropy is the real defence and is doing the work;
  this is defence in depth, and it is the first item in the handover.
- **No real payment.** Payment is simulated end to end.
- **Booking spam is possible** (threat model T3). With no accounts and no real payment,
  nothing makes a booking cost anything.
- **Supply is seeded.** The booking engine, pricing and the one-car-per-bay guarantee are
  real and enforced by the database. The spots are invented — listing a real business
  without its consent isn't ours to do.

[1.0.0]: https://github.com/amrutha-kvb/parkmitra/releases/tag/v1.0.0
