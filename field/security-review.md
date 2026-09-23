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

## Not implemented — stated rather than quietly dropped

### Rate limiting on the booking lookup (T1)

`design/threat-model.md` lists it as a control and `design/openapi.yaml` documents a `429`
response. **Neither exists.**

```
$ for i in $(seq 1 25); do curl -o /dev/null -w "%{http_code} " \
    https://…/api/bookings/ZZZZZZZZZ$i ; done
404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404 404
```

Twenty-five rapid attempts, no throttling.

**Why it is not there, and why nothing fake was added instead.** On Vercel's serverless
runtime an in-memory counter is close to useless — invocations do not reliably share
process state, so a limiter would throttle inconsistently while *looking* like a control.
Doing it properly needs shared state (Upstash Redis is on the approved free-tier list), and
that was not reached in the time available. A limiter that works sometimes is worse than a
documented gap, because it invites the belief that the surface is protected.

**Residual risk: low but real.** The primary defence is entropy, and it is doing the work:
at ~50 bits, guessing a code is not feasible at any rate this free tier could serve. Rate
limiting is defence in depth, not the barrier.

**Action taken now:** the contract is annotated so it stops promising a `429` that the
implementation does not return. The gap is carried into the handover as the first security
task.

### Booking spam (T3)

Also unfixed, and already declared in the threat model. With no accounts and no real
payment, nothing makes a booking cost anything, so a script could reserve every bay. The
real fix is OTP plus real payment — the pair named in ADR-002 as the first thing to add.
Seeded, demo-scale data limits the blast radius for now.

---

## What this review changed

1. `design/openapi.yaml` no longer advertises a `429` on the lookup endpoint; it says
   plainly that rate limiting is not yet implemented.
2. Rate limiting is the first item in the handover.

## Honest limits of this review

Static inspection plus live testing by one person, who also wrote the code. No third-party
review, no dependency CVE audit beyond `npm audit` defaults, no penetration testing. The
controls verified above are genuinely verified; the absence of other findings is not
evidence of their absence.
