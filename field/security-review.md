# Security review

Phase 7, against `design/threat-model.md`. Reviewed 2026-09-23 on the live deployment and
the merged code. Each control was **tested**, not read — a control that has only been
described is an intention.

---

## Verified

| Threat | Control | How it was checked | Result |
|---|---|---|---|
| **T2** price tampering | No `amount` is accepted from the client; the server computes it | `POST /api/bookings` with `amount_paise: 0`, against production | **PASS** — charged 5000 paise (2h × ₹25) |
| **T4** SQL injection | Parameterised queries only | Searched every query for template interpolation | **PASS** — no `${}` inside a query string anywhere |
| **T7** secrets in the repo | `DATABASE_URL` only in host settings | `git ls-files` for env files; grep for connection strings in source | **PASS** — only `.env.example`, containing a localhost placeholder |
| **T5** personal data leaking | Never logged, never in a URL | grep for `driver_phone` / `vehicle_reg` / `driver_name` / `reference_code` in console output | **PASS** — none |
| **T1** enumeration, entropy | ~50-bit CSPRNG reference code | Read the generator: `randomBytes(8)` → Crockford base32, 10 chars | **PASS** |
| **T1** enumeration, disclosure | Unknown and malformed codes indistinguishable | Requested a well-formed unknown code and a malformed one | **PASS** — byte-identical 404 bodies |
| XSS | React escaping, no raw HTML | grep for `dangerouslySetInnerHTML` | **PASS** — none |
| **T6** trust | A booking is a promise, not enforced | Read the live landing copy | **PASS** — stated on the product, not buried |

---

## Implemented since the original review

### Rate limiting on the booking lookup (T1)

`GET /api/bookings/{reference_code}` is now rate-limited at 20 requests per minute
per client IP. The 21st request in a window returns `429` with a `Retry-After` header.
`design/openapi.yaml` documents the `429` response and header.

**Implementation.** A Postgres-backed fixed-window counter (`rate_limit_hits` table,
migration `004_rate_limits.sql`). The count is incremented and read in a single atomic
`INSERT … ON CONFLICT … DO UPDATE SET hits = hits + 1 RETURNING hits` statement, so
concurrent requests cannot both read the pre-increment value. The client IP is read
from the `x-forwarded-for` header set by Vercel's edge.

**Why an in-memory limiter was refused.** On Vercel's serverless runtime, invocations
do not reliably share process state. An in-memory counter would throttle
inconsistently while *looking* like a control. A limiter that works sometimes is worse
than a documented gap, because it invites the belief that the surface is protected.
Shared state was required; Postgres was chosen over Upstash Redis because Neon is
already available and adding a vendor for defence-in-depth is not justified.

**Failure mode: fail open.** If the rate-limit query fails (table missing, connection
error), the lookup proceeds without throttling rather than returning 500. The rate
limiter is defence in depth — a limiter outage must not take down the booking lookup.
This is explicit in the route handler (`try/catch` with an empty `catch`) and tested.

**Residual risk: low.** The primary defence is entropy (~50 bits), not the rate
limiter. The fixed-window design allows up to 2× the limit (40 requests) across a
window boundary; this is inherent and irrelevant at this keyspace size. IP-based
limiting does not stop distributed attacks, but even a million IPs × 20 requests/min
cannot feasibly guess a valid code.

### Booking spam (T3) — now mitigated, still not closed

`POST /api/bookings` had **no rate limiting at all** until 2026-09-24, which made the one
endpoint that costs something real the least protected in the product. It is now limited to
**10 per minute per IP**, the tightest budget of any scope.

That is a speed bump, not a barrier. With no accounts and no real payment, nothing makes a
booking *cost* anything, and an attacker with a handful of addresses still reserves bays
faster than anyone releases them. The real fix is payment plus phone verification — the pair
named in ADR-002 as the first thing to add, and handover ticket 2.

**Mitigated, not closed**, and the threat model now says so in those words.

Full endpoint-by-endpoint evidence is in [`docs/endpoint-audit.md`](../docs/endpoint-audit.md).

### Phone OTP verification — now wired, simulated SMS

Phone verification is now required before payment. The pay route returns
`422 phone_not_verified` unless the booking has `phone_verified = true`.

**What was verified:**

| Control | How checked | Result |
|---|---|---|
| Pay rejects unverified booking | Unit test: `PENDING_ROW` with `phone_verified: false` → 422 | **PASS** |
| No endpoint accepts a phone number | Read every route handler in `app/api/` | **PASS** — phone is always read from the booking row server-side |
| Verify responses are indistinguishable | Unit tests: byte-identical `{ message }` for malformed, unknown, known, and cancelled bookings | **PASS** |
| OTP stored as SHA-256 hash | Read `createOtp` in `lib/otp.ts`: `createHash("sha256")` | **PASS** |
| Attempt limit enforced under concurrency | `tests/otp-attempt-limit.test.ts`: 10 simultaneous wrong guesses, counter = 5, not 6 or 10 | **PASS** |
| Attempt limit enforced by `FOR UPDATE` | Broke the lock (removed `FOR UPDATE`), re-ran: CHECK constraint violation. Restored: green | **PASS** — proven by red/green cycle |
| Concurrent resend does not throw UNIQUE violation | `tests/otp-concurrent-resend.test.ts`: 10 simultaneous `createOtp`, 0 failures, 1 row survives | **PASS** |
| OTP expires after 5 minutes | Read `OTP_TTL_MINUTES = 5` and `expires_at <= new Date()` guard in `verifyOtp` | **PASS** — structural |
| Rate limit on verify endpoints | 10/min/IP, scope `verify`. Route tests assert guard is called | **PASS** |
| `_dev_code` absent in production | `IS_DEV = process.env.NODE_ENV !== "production"` — field only added when truthy | **PASS** — structural |
| `_dev_code` present for ALL responses in dev (no oracle) | Known and unknown bookings both get a `_dev_code`; unknown gets a random one | **PASS** — structural |

**What is not verified:**

- No real SMS provider is integrated. The OTP code is delivered via `_dev_code` in
  non-production. Until a real provider ships, the verification gate exists but does not
  cost an attacker anything. This is stated in the threat model under T3.
- The timing side-channel on `verify/start` (known bookings take longer than unknown ones)
  is documented in the threat model but not mitigated. The residual risk is low because an
  attacker who can measure the timing already holds a candidate reference code (~50 bits),
  but it is a real side channel.

### Payment provider seam (ADR-005)

The pay route now calls a `PaymentProvider` interface rather than hardcoding `'simulated'`
in SQL. The provider name is a query parameter, not a SQL literal.

**What was verified:**

| Control | How checked | Result |
|---|---|---|
| Provider name is parameterised ($2), not a literal | Pay route test 10: `expect(params).toContain("simulated")` | **PASS** |
| Simulated provider idempotency | `tests/payments/simulated.test.ts`: 10 concurrent `authorise` calls → 1 `provider_reference` | **PASS** |
| Provider resolved from env var | `lib/payments/resolve.ts`: `PAYMENT_PROVIDER` env var, default `"simulated"` | **PASS** — structural |
| Unknown provider throws | Switch default in `resolve.ts` | **PASS** — structural |

---

## What this review changed

1. `design/openapi.yaml` documents the `429` response with a `Retry-After` header on
   the lookup endpoint, matching the implementation.
2. Rate limiting was the first item in the handover and is now implemented.

## Honest limits of this review

Static inspection plus live testing by one person, who also wrote the code. No third-party
review, no dependency CVE audit beyond `npm audit` defaults, no penetration testing. The
controls verified above are genuinely verified; the absence of other findings is not
evidence of their absence.
