# Assumption map

Everything the idea depends on, ranked by **how wrong it could be × what it costs if it
is**. Ranked before the spike, not after, so the ranking is a prediction rather than a
justification.

| # | Assumption | How wrong it could be | Cost if wrong | Rank |
|---|---|---|---|---|
| A1 | A building will let a booked stranger through the gate | Very — nothing tested | Fatal. No supply, no product. | **1** |
| A2 | Two drivers cannot be sold the same bay for overlapping windows | Unknown until proven | Fatal to trust. One double-booking ends a user. | **2** |
| A3 | Drivers will pre-book rather than chance the street | High — habit is strong | Product is unused, though it still works | 3 |
| A4 | Idle capacity genuinely exists at the hours demand appears | Moderate — observable | Wrong areas, thin supply | 4 |
| A5 | An hourly price exists that suits both sides | Moderate | Listings but no bookings | 5 |
| A6 | Map + area search is buildable free-tier with no API key | Low | Cost, or a key we cannot afford | 6 |
| A7 | Free-tier Postgres is adequate for the demo | Low | Slow demo | 7 |

## The riskiest assumption overall is A1, and v1 does not test it

A1 is non-technical and unfixable in three days. Trust between a building and a stranger
is a field-sales and liability problem. The honest response is not to pretend otherwise:
v1 **seeds supply with fictional spots** and states so. That sidesteps A1 rather than
answering it, and that limitation is recorded in the charter, the scope cut and the README.

A ten-day project that claimed to have solved A1 with a listing form would be lying.

## The riskiest *technical* assumption is A2 — and that is what the spike tested

The process asks for the riskiest **technical** assumption, spiked with running code. That
is A2, double-booking.

It matters more than it looks. Every other failure in this product is recoverable — a bad
price, a thin list, a slow map. Being sold a bay that someone else is already in is not
recoverable: the driver is standing in a car park with a confirmation that is worthless,
which is precisely the situation the product claims to remove. It is also the classic place
where a booking system is quietly broken, because it only fails under concurrency and
therefore never fails in manual testing.

Naive implementations fail it: `SELECT ... WHERE NOT EXISTS (overlap)` followed by
`INSERT` is a race, and it passes every hand test.

**Result: proven.** See `discovery/spike-result.md` and `spike/run-output.txt`.

## Assumptions deliberately left untested

- **A3 (will drivers pre-book)** — needs real users, not code. Stated as the main open
  commercial risk.
- **A5 (price)** — seeded prices are plausible, not researched.
- **A1** — see above.

Leaving these untested is a decision, not an oversight. What ten days can buy is
certainty about A2, and that is where the spike went.
