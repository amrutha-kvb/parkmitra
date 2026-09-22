# ADR-003 — Money is integer paise, and the price is computed server-side

**Status:** accepted
**Date:** 2026-09-22
**Phase:** 3

## Context

Two separate money mistakes are easy to make and expensive to unwind later, and both are
cheap to prevent before any code exists.

The first is representation: storing `₹40.50` as a floating-point `40.5`. Floats do not
represent decimal fractions exactly, so sums drift. It is invisible at one booking and
obvious at a thousand, by which time it is in the database.

The second is trust: letting the client tell the server what the booking costs. A price
that arrives in a request body is a price an attacker chooses.

v1 uses a simulated payment (`plan/scope.md`) — no money actually moves. That makes this
the cheapest possible moment to get both right, and the easiest moment to get them wrong,
because nothing breaks visibly if we don't.

## Decision

**Representation.** Every monetary amount is an `integer` number of **paise**, everywhere:
database columns, API fields, application logic. Field names carry the unit
(`price_per_hour_paise`, `amount_paise`) so a bare `price` can never be ambiguous.
Conversion to `₹` happens exactly once, at render time, at the edge.

No floats, no decimals, no strings-holding-numbers anywhere in the money path.

**Authority.** The server computes the price. The booking request carries the bay and the
window; it does **not** carry an amount. The server reads
`spots.price_per_hour_paise`, derives the billable hours from the window, and writes the
result. Any `amount` field in an inbound request body is ignored.

## Alternatives rejected

**Float / double for rupees** (`40.50`)
*Rejected:* inexact by construction. This is the classic and it is not worth re-learning.

**Postgres `numeric`/`decimal`**
*Rejected, though defensible.* It is exact and would work. Integer paise is chosen because
it makes a wrong value *unstorable* rather than merely discouraged — a column typed
`integer` cannot hold `40.5` at all, so the database rejects the mistake instead of
faithfully recording it. It also removes any question of rounding at API boundaries, since
JSON has no decimal type and `numeric` arrives as a string or a float depending on the
driver.

**Storing rupees as integers** (`41` for ₹40.50)
*Rejected:* loses the paise, and Indian pricing uses them.

**Client sends the amount, server validates it**
*Rejected:* validation means recomputing the correct price anyway, so the client's number
is redundant at best. Accepting it as a default and only checking "roughly right" is how
price-tampering bugs ship.

**Client sends the amount, server trusts it**
*Rejected, obviously,* but stated so the threat is on the record: it is a one-line change
that turns every booking into whatever the attacker wants to pay, and it is exactly the
shortcut a rushed build reaches for.

## Consequences

**Good**
- Arithmetic is exact. Sums, totals and future refunds cannot drift.
- Price tampering is not possible: there is no inbound field to tamper with.
- The unit is visible in every identifier, so a reviewer sees a bug at the call site.
- When real payments arrive, gateway integration is a seam change, not a money-model
  rewrite — Razorpay and Stripe both take integer minor units.

**Bad / accepted**
- Every read path must format. A raw `4050` leaking to a screen is a real, if cosmetic,
  bug class. Mitigated with a single formatting helper and a test.
- Partial-hour pricing needs an explicit rounding rule rather than falling out of the
  arithmetic. Decided here: **bill in whole hours, rounding up**, so a 90-minute booking is
  charged 2 hours. Stated in the data dictionary so it is a product rule rather than an
  accident of integer division.
