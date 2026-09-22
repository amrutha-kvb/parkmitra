# ADR-002 — No user accounts; the reference code is the capability

**Status:** accepted
**Date:** 2026-09-22
**Phase:** 3

## Context

The flow needs to know *whose* booking a booking is — to show a confirmation, and to let
the driver mark arrival. The obvious answer is user accounts. The scope cut
(`plan/scope.md`) removed them, and this ADR records why, and what the product owes in
exchange.

A driver booking parking is doing a one-shot errand. They are often on a phone, often in a
hurry, sometimes about to drive. A signup wall sits directly between them and finding out
whether a bay even exists, and the secondary persona in `discovery/personas.md` abandons at
exactly that point.

## Decision

No accounts, no passwords, no sessions in v1.

A booking is created with a phone number and a vehicle registration, and returns a
**high-entropy reference code**. That code is the authorisation: holding it is what permits
reading or modifying that one booking. Nothing else in the system is addressable by a
guessable identifier.

- Code space: 10 characters, Crockford base32 (no I/L/O/U), ≈ 50 bits
- Generated with a CSPRNG, never sequential, never derived from the booking id
- Looking up `/api/bookings/{reference}` is the only read path for a booking

## Alternatives rejected

**Full accounts (email + password, or an auth provider like Clerk/NextAuth)**
*Rejected:* roughly a day of build for zero additional proof of the thing being tested, plus
password reset, session handling and a user table to secure. It would also put a wall
before the product's first useful moment.

**OTP on the phone number** — the pattern most Indian apps actually use, and the right
long-term answer.
*Rejected for v1 only:* every SMS costs money and needs a provider account with KYC. It is
the first thing to add when the product takes real money, and it is named as such here so
the decision is revisited rather than forgotten.

**Booking id in the URL** — `/bookings/1234`.
*Rejected:* sequential ids are enumerable. Anyone could walk the range and read every
driver's phone number and vehicle registration. This is the cheap mistake this ADR exists
to prevent.

**Phone number as the lookup key** — `/bookings?phone=98...`
*Rejected:* worse. A phone number is low-entropy, frequently known to others, and is itself
the personal data being protected.

## Consequences

**Good**
- The fastest possible path from arriving to booked. No wall.
- Nothing to breach: no password store, no session store.
- The capability model is honest about what it is — a URL you must not share.

**Bad / accepted**
- **Lose the code, lose the booking.** There is no "log in and see my bookings". Mitigated
  only by showing the code prominently and telling the driver to keep it. A real product
  would send it by SMS.
- **Anyone with the code has full access to that booking**, including the phone number and
  vehicle registration on it. That is the definition of a capability, and it is why the code
  must never appear in a page title, an analytics event, or a map tile request.
- **Enumeration is a live threat, not a theoretical one.** ~50 bits makes guessing
  impractical, but the endpoint still needs rate limiting so nobody can try at volume. That
  requirement is carried into `design/threat-model.md` as a control, not an aspiration.
- No booking history, no "book this again". Accepted for v1.
