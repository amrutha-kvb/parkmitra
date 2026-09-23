# Changelog

Notable changes to parkmitra. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semantic versioning](https://semver.org/spec/v2.0.0.html).

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

**Continuous integration.** Typecheck, lint, 219 unit tests and the Playwright suite run on
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
