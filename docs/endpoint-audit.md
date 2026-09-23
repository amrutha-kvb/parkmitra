# Endpoint audit

Every HTTP endpoint, its inputs, how they are validated, what authorises the call, and what
throttles it. The quality bar this project is held to asks for *"authorisation on every
endpoint, inputs validated at trust boundaries"* — this is the evidence, endpoint by
endpoint, including the ones where the honest answer is "public by design".

Audited 2026-09-24 against the code, not the design documents.

---

| Endpoint | Input | Validated | Authorisation | Rate limit |
|---|---|---|---|---|
| `GET /api/areas` | none | n/a — takes no input | **Public by design.** Seven rows of city areas. Nothing here is private and nothing is per-user | none — see note |
| `GET /api/availability` | `area`, `start`, `end` | slug pattern, both timestamps parsed and ordered, window bounded | **Public by design.** Searching requires no identity (ADR-002) | `search`, 60/min |
| `GET /api/bays` | `spot_id`, `start`, `end` | `parseInt` + positivity, timestamps parsed, opening hours enforced | **Public by design.** Same reasoning as search | `bays`, 60/min |
| `POST /api/bookings` | JSON body: bay, window, phone, vehicle reg | every field type-checked; **`amount_paise` is never read from the client** — the server computes it from a locked CTE (ADR-003) | **Public by design**, and this is the deliberate trade in ADR-002: no accounts means anyone can book | `booking`, **10/min** |
| `GET /api/bookings/{code}` | reference code in path | 10-char Crockford base32 pattern | **The code IS the authorisation.** ~50 bits of CSPRNG entropy. Unknown and malformed return byte-identical 404s | `lookup`, 20/min |
| `POST /api/bookings/{code}/pay` | reference code in path | same pattern | Same capability model | `mutate`, 20/min |
| `POST /api/bookings/{code}/arrive` | reference code in path | same pattern | Same capability model | `mutate`, 20/min |
| `GET /api/health` | none | n/a | **Public by design.** Returns booleans, a version and a short commit — no connection string, no stack trace, nothing about bookings | **none, deliberately** |

## Why some endpoints have no authorisation

Because parkmitra has no accounts. That is ADR-002, and it is the product's central design
decision rather than an omission: a ~50-bit reference code is the capability, and there is
deliberately no way to find a booking by phone number, because that endpoint would be the
enumeration hole the whole model exists to avoid.

So "authorisation on every endpoint" is answered three ways here, and each is a decision:

1. **The code is the authorisation** — every endpoint that touches one booking.
2. **Public by design** — reading areas, searching, listing bays. These expose seeded supply
   data and nothing about any person.
3. **Deliberately unauthenticated writes** — `POST /api/bookings`. Named in the threat model
   as T3 and mitigated only by the rate limit below, not solved.

## Why `/api/health` is not rate limited

It is the endpoint a monitor calls every ten minutes, and throttling the thing that tells you
the product is broken is how you find out late. It returns no personal data and no
infrastructure detail. The cost of leaving it open is a cheap query; the cost of closing it
is silence during an incident.

## Why `/api/areas` is not rate limited

It takes no input, returns seven effectively static rows, and is the first call the home
screen makes. Throttling it would throttle the front door. It is the one endpoint where the
limiter would cost more than it protects — recorded here so the omission is a decision rather
than an oversight.

## Scopes, and why they are not one number

Before 2026-09-24 the limiter keyed on IP alone, so every endpoint using it shared **one**
bucket. With only the lookup wired up that was invisible; extending it would have made an
ordinary visitor exhaust a single 20/minute allowance across searching, browsing and booking,
and be locked out of the product by its own defence.

Each scope now has its own bucket and its own budget (`lib/rate-limit.ts`):

```ts
search: 60,   // normal browsing — throttling this throttles the product
bays:   60,
lookup: 20,   // enumeration defence (T1)
mutate: 20,
booking: 10,  // a write that reserves a bay (T3)
```

The tightest budget is on the only endpoint that costs something real.

## What this audit changed

1. **`/api/availability`, `/api/bays` and `POST /api/bookings` had no rate limiting at all.**
   Only the booking lookup did. Booking creation is the T3 surface and was the least
   protected.
2. **Per-scope buckets**, because applying one shared bucket to all of them would have been
   worse than none.
3. **`lib/rate-limit-guard.ts`**, one function rather than the same fifteen lines copied into
   five handlers — three details in it are easy to get subtly wrong and all three fail
   silently: which IP to trust, failing open rather than closed, and not logging the pg error
   object (SEC-001).
4. **A wiring test per guarded route.** The guard is mocked in the route suites, so without
   these nothing would notice a route quietly losing its limiter — the mock would make an
   unprotected endpoint look tested. Verified by removing the guard and watching them fail.

## Still open

`POST /api/bookings` remains unauthenticated, so T3 is **mitigated, not closed**. Ten
bookings a minute per IP is a speed bump, not a barrier; the real fix is payment plus phone
verification, which is handover ticket 2.
