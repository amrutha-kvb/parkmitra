# Threat model

What an attacker would try, and what the authorisation rules are.

The shape of this system makes the threat list short and specific: there are no accounts,
no admin surface, no file uploads, no payments, and exactly three columns of personal data.
Most of the usual list does not apply. The things that *do* apply are sharper as a result,
because the reference code carries all the authorisation in the product.

## Authorisation rules, stated completely

| Operation | Who may | Enforced by |
|---|---|---|
| List areas | anyone | public by design |
| Search availability | anyone | public by design |
| Create a booking | anyone | public by design |
| **Read a booking** | whoever holds its `reference_code` | code is a ~50-bit CSPRNG value; no other read path exists |
| **Pay a booking** | whoever holds its code | as above |
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

*Honest position: v1 does not solve this.* It cannot, without either identity or payment —
the two things that make spam cost something, and both are out of scope.

*Partial controls*
- Rate limit booking creation per IP
- `pending` bookings expire at read time, so an unpaid flood decays rather than persisting
- Seeded, demo-scale data limits the blast radius

*Recorded as a known, accepted hole.* The real fix is OTP on the phone number plus real
payment, which is exactly the pair named as "first thing to add" in ADR-002.

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
- **Card data** — never touches this system, in v1 or later (redirect/SDK only).
- **Prompt injection / tool permissions** — parkmitra calls no model at runtime. The
  programme's phase-7 checklist asks about this for AI products; this one is not one, and
  that is the honest answer rather than an omission.
