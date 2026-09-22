# Success metrics

One north-star and three supporting. Each has a written definition and a named data
source, so the number can be produced from the system rather than asserted in a review.

A deliberate constraint: every metric below must be computable from the parkmitra
database alone. A metric that needs an analytics vendor we have not integrated is a metric
that will not exist on the day, and the free-tier budget in `design/nfr.md` does not
include one.

---

## North star

### Confirmed arrivals

**Definition:** the count of bookings that reach state `confirmed` and whose time window
has started, where the driver marked arrival. One per booking. Cancelled, expired and
no-show bookings are excluded.

**Why this one:** it is the only number that means the product did its actual job — a car
that had nowhere to go now has somewhere, and the driver got there. Searches, signups and
page views can all rise while the product fails. An arrival cannot.

**Data source:** `bookings` table — rows where `status = 'confirmed'` and
`arrived_at IS NOT NULL`, grouped by day.

**Honest caveat:** arrival is self-reported in v1 (the driver taps "I'm here"). That is a
weaker signal than a gate sensor, and it will under-count people who forget. Recorded as a
known measurement limitation rather than presented as ground truth. Improving it needs
supply-side hardware, which is out of scope.

---

## Supporting metrics

### 1. Search-to-booking conversion

**Definition:** of search sessions that returned at least one available spot, the
percentage that resulted in a confirmed booking, within the same session.

**Why:** separates a supply problem from a product problem. If searches return results and
nobody books, the price, the walk distance or the trust is wrong. If searches return
nothing, we have a coverage problem instead. The two need opposite responses, and without
this metric they look identical.

**Data source:** `search_events` joined to `bookings` on `session_id`.

### 2. Empty-result rate

**Definition:** the percentage of searches that returned zero available spots for the area
and time window requested, broken down by area.

**Why:** this is the cold-start metric, and the leading indicator of abandonment — the
secondary persona stops opening the app after roughly two empty looks. Per-area breakdown
tells us *where* to add supply, which is the only lever we have in the first release.

**Target direction:** down. An area sitting above 50% is a candidate for either more seeded
supply or removal from the area list, because showing an area that never has anything is
worse than not offering it.

**Data source:** `search_events` where `result_count = 0`.

### 3. Idle-hours converted

**Definition:** total booked hours as a percentage of total listed-available hours, per
spot, per week.

**Why:** the supply side's only reason to participate. It is the number that would appear
in a pitch to a building manager, and if it stays near zero the product has no
supply-side story even if drivers are happy. It also exposes spots that are listed but
never booked — usually a price or walk-distance problem, not a demand problem.

**Data source:** `bookings` summed against `spots.available_hours`.

---

## Metrics deliberately not used

**Signups.** A vanity number here. The product's value is per-trip, and someone can sign up
and never park.

**Sessions / DAU.** Actively misleading for this product: a driver opening the app *more*
often may mean they are failing to find anything. Frequency is not engagement when the job
is a one-shot errand.

**Revenue.** v1 uses a simulated payment flow (`plan/scope.md`), so any revenue figure
would be fictional. Excluded rather than reported as zero, which would be read as failure
instead of as "not implemented".
