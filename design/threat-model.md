# Threat model

What an attacker would try, and what the authorisation rules are.

The shape of this system makes the threat list short and specific: there are no accounts,
no admin surface, no file uploads, and no real payments (the provider seam exists but only
the simulated implementation ships — ADR-005). Personal data now lives in four places:
`driver_phone`, `driver_name`, and `vehicle_reg` on bookings, and `code_hash` (a SHA-256
of the 6-digit OTP) plus `attempts` on `phone_otp`. Most of the usual list does not apply.
The things that *do* apply are sharper as a result, because the reference code carries all
the authorisation in the product.

## Authorisation rules, stated completely

| Operation | Who may | Enforced by |
|---|---|---|
| List areas | anyone | public by design |
| Search availability | anyone | public by design |
| Create a booking | anyone | public by design |
| **Read a booking** | whoever holds its `reference_code` | code is a ~50-bit CSPRNG value; no other read path exists |
| **Send verification OTP** | whoever holds its code | as above; phone is read server-side, never an input |
| **Check verification OTP** | whoever holds its code | as above; OTP keyed by booking_id, not phone |
| **Pay a booking** | whoever holds its code **and** has verified their phone | code + `phone_verified = true` on the booking |
| **Mark arrival** | whoever holds its code | as above |
| Read another driver's booking | **nobody** | there is no endpoint that takes a phone number, a bay, or a booking id |
| Admin anything | **nobody** | there is no admin surface; seeding is a migration run by the operator |

This is a capability model. Possession of the code *is* the authorisation. It is a real
trade-off, taken deliberately in ADR-002, and the threats below are its price.

---

## T1 — Enumerating reference codes to read strangers' data

**The main threat in this system.** A successful guess exposes a phone number, a name and a
vehicle registration.

*Attack:* walk `/api/bookings/{code}` at volume.

*Why it is hard:* 10 characters of Crockford base32 ≈ 50 bits, CSPRNG-generated, never
sequential and never derived from the row id. Guessing is not feasible at any rate the free
tier could serve.

*Controls*
- High entropy, independent of any other identifier — the real control
- **Rate limit on the lookup endpoint** by IP: the contract already specifies `429`
- `404` is returned identically for "never existed" and "not yours", so failures leak no
  information about which codes are valid
- No listing endpoint exists — there is nothing to page through
- **The verify endpoints return 200 with identical bodies for known and unknown codes.** A
  malformed code, an unknown code, a valid booking, and a cancelled booking all produce the
  same `{ message }` response. Tested with byte-identical assertions in the route tests.
  The phone-number oracle attack (submitting phone numbers to learn which have bookings) is
  structurally impossible: no endpoint accepts a phone number

*Residual:* a shared or shoulder-surfed code gives full access to that one booking. That is
inherent to capabilities and is why the code must never appear in a page title, a referrer
header, an analytics event, or a tile request.

## T2 — Price tampering

*Attack:* post `amount_paise: 0`, or a negative amount, with the booking.

*Control:* structural — **there is no amount field in `BookingRequest`.** The server
computes the price from `spots.price_per_hour_paise` and the window (ADR-003). There is
nothing to tamper with, rather than a validation that could be forgotten.

*Residual:* none for the client path. An error in the server-side calculation is a bug, not
a threat, and is covered by unit tests on the billing rule (whole hours, rounded up).

## T3 — Booking denial of service: reserving every bay

*Attack:* no accounts means anyone can book. Someone scripts bookings across every bay for
every window and the product shows "nothing available" to real drivers. Free to do, and
effective.

*Controls — updated 2026-09-24*

**Phone OTP verification is now required before payment.** The pay route returns
`422 phone_not_verified` unless `bookings.phone_verified = true`, which is set only
by a successful OTP check (`POST /api/bookings/{code}/verify/check`). This means a
scripted attacker must receive and enter a valid SMS code for every booking they
create. At scale, that costs money (one SMS per booking) and requires control of
real phone numbers, which is qualitatively harder than scripting anonymous HTTP
requests.

**However, v1 ships with the simulated provider — no SMS is actually sent.** The OTP
is generated and stored, the verify flow is wired end-to-end, but the code is
delivered to the browser (via `_dev_code` in non-production) rather than by SMS.
Until a real SMS provider is integrated, a bot that calls `verify/start` and reads
the dev response can still auto-verify. **The gate exists; the cost does not.**

*Other controls*
- **Rate limit booking creation per IP — 10/minute** (`lib/rate-limit.ts`, scope `booking`,
  the tightest budget in the product). Implemented 2026-09-24.
- **Rate limit OTP endpoints per IP — 10/minute** (scope `verify`). Limits brute-force
  guessing of the 6-digit code.
- **OTP attempt limit — 5 per code.** After 5 wrong guesses the OTP is burned; the driver
  must request a new one. The counter is protected against concurrency by `SELECT … FOR
  UPDATE` on the `phone_otp` row, proven by a test that fires 10 simultaneous wrong
  guesses and asserts the counter cannot be raced past 5.
- `pending` bookings expire at read time, so an unpaid flood decays rather than persisting
- Seeded, demo-scale data limits the blast radius

*Status: **mitigated, not closed**.* The OTP gate is the structural fix ADR-002 named as
"the first thing to add". The structure is in place: schema, routes, UI, concurrency
proofs, and the pay route rejects unverified bookings. What remains is a real SMS
provider — without one, the gate is enforced but the cost is zero, so the attack is
slowed (rate limits, attempt limits) but not priced. Closing T3 requires:

1. Integrate an SMS provider (MSG91, Twilio, or similar) behind the OTP send path.
2. Remove `_dev_code` from the verify/start response in production.
3. Confirm the e2e suite still passes with a test-mode SMS provider or a mock.

Until then, mitigated — honestly — not closed.

## T4 — SQL injection

*Attack:* inject through the area slug, the window, or the vehicle registration.

*Controls:* parameterised queries only, everywhere — no string-built SQL, no dynamic
identifiers from user input. Inputs are validated at the route handler against the contract
(area must be a known slug; window must parse as two timestamps; reference code must match
`^[0-9A-HJKMNP-TV-Z]{10}$`).

## T5 — Personal data leaking through the side doors

The under-rated one, because nobody attacks it — it is simply given away.

*Vectors and controls*
- **Logs** — never log request bodies on booking paths. Log the reference code's absence,
  not its value.
- **Error messages** — the contract requires `Error.message` to contain no personal data,
  no SQL, no stack trace. A raw Postgres error reaching the client would leak schema.
- **URLs** — personal data is never a query parameter, so it cannot reach server logs or a
  `Referer` header.
- **Map tiles** — tiles are fetched by the browser from OpenStreetMap and carry only
  coordinates of *spots*, which are fictional and public. No booking data, no code, ever
  goes to a third party.
- **`search_events`** — deliberately stores no IP and no user id.
- **`phone_otp`** — contains `code_hash` (SHA-256 of the 6-digit OTP) and `attempts`.
  The hash is derived personal data: it confirms that a specific phone was asked to verify.
  The table contains no phone number column — the phone lives on the booking, and
  duplicating it would create a second PD index that serves no query. `attempts` is an
  integer count, not PD by itself, but in context it records how many times a specific
  person tried to verify, which is behavioural data. Both are covered by the retention
  gap noted in `field/privacy-review.md`.
- **`_dev_code` in verify/start responses** — present only when `NODE_ENV !== 'production'`.
  In production the field is absent. In dev, it is present in ALL responses (known and
  unknown bookings alike, with a random value for unknown bookings), so it does not create
  an oracle. It is a development convenience, not a production surface.

## T6 — Someone turns up and the bay is occupied anyway

Not a security threat; the trust threat, and the one that actually kills the product.

*Causes:* a car without a booking parks there; the building does not honour it; the bay
does not exist because the listing is wrong.

*v1 position:* unsolved and **stated in the product** rather than implied away. A booking is
a promise, not an enforced guarantee — no barrier, no sensor, no guard integration
(`plan/scope.md`). In v1 the spots are fictional, so no driver can be sent to a real place
and let down.

## T7 — Secrets in the repository

*Control:* `DATABASE_URL` lives only in Vercel's environment settings, per the programme's
hosting rule. `.env*` is gitignored, `.env.example` carries placeholders only. The repo is
public, so this is checked before every push rather than assumed.

---

## Deliberately out of scope, and why

- **CSRF** — no cookies, no ambient authority. Authorisation is an explicit path parameter,
  so a cross-site request gains nothing the attacker did not already hold.
- **XSS** — React escapes by default; no `dangerouslySetInnerHTML` anywhere. Revisit if
  that ever changes.
- **Account takeover, password breach, session fixation** — no accounts, no passwords, no
  sessions.
- **Card data** — never touches this system, in v1 or later (redirect/SDK only, ADR-005).
- **OTP brute-force** — 6 digits = ~20 bits. Mitigated by: 5-attempt limit per OTP
  (concurrency-proven), 10 req/min/IP rate limit on the verify scope, OTP expiry after
  5 minutes. An attacker who holds the reference code can try 5 codes per OTP × unlimited
  resends; the rate limit caps resends to 10/min/IP, so the effective throughput is
  ~50 guesses per minute per IP against a 1-in-1,000,000 target. Not feasible.
- **Timing oracle on verify/start** — known and unknown bookings take different code paths
  (unknown: one DB query; known: one query + OTP create = three queries). The response
  body is indistinguishable, but the latency is not. An attacker measuring response times
  can distinguish “never existed” from “exists and got an OTP.” This is a real side channel.
  Mitigation: the reference code is ~50 bits, so timing confirmation only helps an attacker
  who already has a candidate code — and at that point they already hold the capability.
  Stated rather than dismissed.
- **Prompt injection / tool permissions** — parkmitra calls no model at runtime. The
  programme's phase-7 checklist asks about this for AI products; this one is not one, and
  that is the honest answer rather than an omission.
