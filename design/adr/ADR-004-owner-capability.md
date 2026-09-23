# ADR-004 — Owner authentication is a spot-scoped capability token

**Status:** accepted
**Date:** 2026-09-23
**Phase:** 3

## Context

Handover ticket 2 asks for an owner-facing surface: list a spot, set bay counts and
pricing, and see the bookings that drivers have made. All of that requires knowing which
spots belong to which owner — and right now there is no concept of an owner in the system
at all. Supply is seeded SQL.

A driver's relationship with the system is transactional: one booking, one code, done.
An owner's relationship is ongoing: they come back day after day to see an accumulating
set of bookings across their bays. "Here are your twelve reference codes, keep all of
them" is not a workable answer.

The obvious solution is accounts, but ADR-002 rejected accounts for v1 and the reasons
have not changed. OTP requires an SMS provider with KYC and per-message cost; a password
system adds a breach surface; both put infrastructure between the owner and a product
that has not yet proven it has real supply. Ticket 2 says explicitly that the first owner
is onboarded by the team in person, not through a self-serve flow.

## Decision

Apply ADR-002's capability model to the owner surface: one long-lived, high-entropy
**owner token** per spot, generated at onboarding and handed to the owner out of band.

- Token space: same as the driver code — 10+ characters of Crockford base32, CSPRNG-
  generated, ≈ 50 bits, never sequential, never derived from the spot id.
- The token is the sole lookup key. No endpoint accepts a spot name, a phone number, an
  email or an owner's name as a path to owner data.
- Owner endpoints live under `/api/spots/{owner_token}/…` — bookings, bays, pricing.
  There is no other read or write path to these resources.
- The same rate-limiting that protects `/api/bookings/{reference}` (threat model T1)
  applies to owner-token endpoints identically.
- Tokens are generated once during onboarding, which in v1 is a manual process performed
  by the team. When OTP arrives (handover ticket 1), the token can be issued *after*
  phone verification rather than *instead of* it; the URL shape and the authorisation
  check do not change.

## Alternatives rejected

**Full accounts for owners (email + password, or an auth provider)**
*Rejected:* the same reasons ADR-002 gave for drivers apply here with less force but still
apply. There is one owner to onboard, perhaps two. A password system adds a user table, a
reset flow, session handling and a breach surface — all for a count of users that fits in
a text message. Revisit when self-serve owner registration is needed; it is not needed
now.

**OTP on the owner's phone number**
*Rejected for v1 only:* the right long-term answer, as ADR-002 already says. It requires
an SMS provider, KYC, and per-message cost. It is the first thing to add alongside real
payment (handover ticket 1), and when it arrives it should cover owners and drivers both.
Named here so the decision is revisited rather than forgotten.

**Reuse driver reference codes — give the owner every code for bookings at their spot**
*Rejected:* this is the "here are your twelve codes" non-answer. An owner with twenty
bookings a week must track twenty tokens. Worse, each driver code also authorises
*modifying* that booking (cancellation, marking arrival), which is the driver's action,
not the owner's. Mixing the two capabilities leaks control in both directions.

**Spot id in the URL** — `/api/spots/3/bookings`
*Rejected:* the same mistake ADR-002 rejected for bookings. Spot ids are sequential
integers. Anyone who guesses `/spots/1`, `/spots/2`, `/spots/3` reads every driver's
phone number and vehicle registration at every spot. This is enumeration with a larger
blast radius than the driver case, because a single correct guess exposes many drivers
rather than one.

**A shared password per spot** — owner sets a password at onboarding, enters it to log in.
*Rejected:* passwords chosen by a person are low-entropy compared with a CSPRNG token.
They get reused across services, written on sticky notes, and shared by telling someone
the word. A capability token is longer, random, and lives in a bookmark rather than in
someone's memory. It is strictly better for a system that already has no password
infrastructure and does not want to build any.

## Consequences

**Good**
- No new auth infrastructure. The same CSPRNG function that generates driver codes
  generates owner tokens. No session store, no password table, no SMS provider.
- Consistent with ADR-002: the system has one authorisation model, not two. Anyone
  reading the code or the threat model learns one pattern, not a driver pattern and a
  separate owner pattern.
- Does not block the OTP migration. When phone verification arrives, the owner token
  becomes something issued after verification rather than instead of it. The endpoints,
  the URL shape and the authorisation logic stay the same.
- Matches the owner count. Handing a token to one operator in person is natural; it
  would not be natural for five hundred operators, but that is not this release.

**Bad / accepted**
- **Lose the token, lose the dashboard.** There is no recovery path except the team
  generating a new token out of band. This is worse for an owner than for a driver:
  a driver loses one booking, an owner loses ongoing access to all their bookings and
  management controls.
- **Larger blast radius than a driver code.** A leaked driver code exposes one person's
  phone number and vehicle registration. A leaked owner token exposes the phone number
  and vehicle registration of *every driver who has booked at that spot*. The controls
  are the same (entropy, rate limiting); the stakes are not.
- **No audit trail of who used the token.** Because there are no accounts, logs show
  that the token was used but not *who* used it. If two people in a building office
  share the link, access cannot be attributed. Accepted because the alternative is
  accounts, and accounts are rejected above.
- **No revocation without disruption.** If a token is compromised, the only option is
  to invalidate it and issue a new one. Between compromise and discovery, the attacker
  has read access to all booking data for that spot.
- **Does not scale to self-serve onboarding.** The moment an owner must list a spot
  without the team being involved, identity is required before issuing a token, which
  means OTP or accounts. This scheme is deliberately scoped to the manual-onboarding
  world of v1 and is not pretending otherwise.
