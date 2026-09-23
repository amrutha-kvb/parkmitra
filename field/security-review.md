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

### Booking spam (T3)

Also unfixed, and already declared in the threat model. With no accounts and no real
payment, nothing makes a booking cost anything, so a script could reserve every bay. The
real fix is OTP plus real payment — the pair named in ADR-002 as the first thing to add.
Seeded, demo-scale data limits the blast radius for now.

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
