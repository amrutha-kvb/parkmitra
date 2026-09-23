# Epics

Four epics. Each maps to a slice of the one flow in `plan/scope.md`; none of them is a
layer. "All the backend, then all the frontend" is how a project ends with nothing to
demonstrate, so every epic below crosses the whole stack.

---

## E1 — Foundation: schema, seed, and the booking guarantee

The database, the migrations, the seed data, and the exclusion constraint that makes the
product's one promise true. Includes the money helpers, because getting paise wrong later
is a migration rather than an edit.

**Done when:** migrations run on a clean database, seed data loads, and a test proves two
concurrent overlapping bookings produce exactly one winner.

**Why first:** everything else reads from it, and ADR-001 is the thing the product sells.

## E2 — Find: area, window, availability

S1 and S2. The area picker, the window picker, the availability query, the results list,
the map, and — the part that actually matters — the empty state.

**Done when:** a driver can pick Gachibowli and a two-hour window and see real spots with
real free-bay counts and real prices, computed from the database, and sees a useful empty
state when there are none.

## E3 — Book: bay, details, price, confirmation

S3, S4, S5. Bay selection, driver details, server-computed price, the booking insert, the
simulated payment, and the reference code.

**Done when:** a booking exists in the database with a reference code, the price was
computed server-side, and a losing race returns 409 rather than a double booking.

## E4 — Return: lookup and arrival

S6 plus the arrival action on S5. The capability model in practice.

**Done when:** a driver can return with only the reference code, see their booking, and
mark arrival — and a wrong code is indistinguishable from an unknown one.

---

## Not epics

**Hardening** is phase 7, not an epic — it applies across all four rather than sitting
after them.

**Deployment** is phase 8. It is deliberately *not* last-minute: the deploy path is proved
during E1 so that "it works on my laptop" is never discovered on the final day.

**Supply-side onboarding, enforcement, real payments, accounts** — out of scope
(`plan/scope.md`). Listed here only so their absence is a decision rather than a gap
somebody notices at review.
