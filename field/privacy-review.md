# Privacy review

Phase 7, alongside [`security-review.md`](security-review.md). Security asks whether someone
can take the data; privacy asks whether we should be holding it at all.

Reviewed 2026-09-23 against the live deployment and the schema. Every claim below was
checked against the code or the database, not against the design documents — a document
saying "we do not log personal data" is an intention.

---

## What is actually collected

| Field | Where | Why it exists | Could we do without it? |
|---|---|---|---|
| `driver_phone` | `bookings` | The only way an operator can reach a driver about a bay that is blocked, and the only recovery route if a code is lost | **No, not for v1.** It is the single contact point in a product with no accounts |
| `vehicle_reg` | `bookings` | How a guard identifies the car that is entitled to the bay | **No.** Without it the booking cannot be enforced at the gate |
| `driver_name` | `bookings` | Optional, for the operator's convenience | **Yes** — and it is already nullable, never required by any form, and never displayed |
| `reference_code` | `bookings` | The authorisation itself (ADR-002) | No — it replaces an account |
| `session_id` | `search_events` | Distinguishes one visit's searches from another's | It is ephemeral and random per visit, not a user identifier |
| `code_hash` | `phone_otp` | SHA-256 of the 6-digit OTP sent to the driver's phone | **No.** Needed to verify the code without storing it in cleartext. Derived PD: it confirms a specific phone was asked to verify. Contains no phone number itself |
| `attempts` | `phone_otp` | How many wrong guesses have been made against this OTP | Behavioural data in context: records how many times a specific person tried to verify. Not PD alone, but linked to a booking via `booking_id` FK |
| `phone_verified` | `bookings` | Whether the driver completed OTP verification | A boolean flag, not PD by itself, but it records that a specific phone number was successfully verified for a specific booking |

**No IP address is stored against a person.** The rate limiter keeps IPs in
`rate_limit_hits`, which is a separate table, joined to nothing, never linked to a booking,
and swept hourly by `scripts/rate-limit-sweep.sh`. That separation is deliberate: an IP
beside a booking would turn a throttling counter into a location history.

**OTP records are personal data.** The `phone_otp` table contains `code_hash` (SHA-256 of
the OTP — derived PD) and `attempts` (behavioural data linked to a booking via FK). The
table contains NO phone number column — the phone lives on `bookings` only, and duplicating
it would create a second PD surface serving no query. `phone_otp` rows are not swept or
expired by any scheduled job. They accumulate one row per booking that ever requested an OTP.
This is covered by the retention gap below — the same anonymisation sweep that nulls PD
columns on old bookings should also delete the corresponding `phone_otp` rows.

**No cookies, no analytics, no third-party scripts, no error tracker.** Verified:

```console
$ grep -rnE "gtag|googletagmanager|sentry|posthog|mixpanel|segment\.com|document\.cookie|<script src=" app/ lib/
(no matches)
```

### One third party was found, and removed

The same sweep, widened to every outbound host rather than a list of known trackers, caught
something the tracker list would have missed:

```console
$ grep -rhoE "https?://[a-zA-Z0-9.-]+" app/ lib/ | sort -u
http://localhost
https://unpkg.com            ← this
https://www.openstreetmap.org
```

Leaflet's default marker images were being loaded from `unpkg.com`. Nothing tracked anyone
deliberately — but **every visitor's browser was telling a third party its IP address and,
through the `Referer` header, which page it was on.** For a product whose threat model calls
"who parked where" personal data (T5), that is a real leak through a decorative asset, and a
supply-chain dependency on a host nobody here controls.

Leaflet is already an npm dependency, so the images were sitting in `node_modules` the whole
time. They now come from `/public/leaflet/`:

```console
$ grep -rhoE "https?://[a-zA-Z0-9.-]+" app/ lib/ | sort -u
http://localhost
https://www.openstreetmap.org
```

The remaining host is the OSM tile server, which is the map itself and cannot be removed
without removing the map. It is disclosed here rather than treated as invisible.

**The lesson is about the method, not the finding.** Grepping for a list of known tracker
names returns nothing and feels like a pass. Grepping for *every outbound host* and reading
the list is what actually answers the question.

## Verified

| Question | How it was checked | Result |
|---|---|---|
| Is personal data ever logged? | grep for every PD column name across `app/` and `lib/` console output | **PASS** — none |
| Is it ever in a URL? | Read every route and link; lookup is by reference code only | **PASS** |
| Is it sent to any third party? | Dependency list is Neon and Vercel only; no analytics | **PASS** |
| Can a stranger enumerate bookings? | ~50-bit CSPRNG code; malformed and unknown return byte-identical 404s | **PASS** |
| Does the schema mark what is personal? | `-- PD` comments on the three columns in `001_init.sql`; `-- PD (derived)` on `code_hash` in `007_phone_verification.sql` | **PASS** |
| Is `driver_name` ever required or shown? | Read the form and every render path | **PASS** — optional, unused |
| Does `phone_otp` contain a phone number? | Read `007_phone_verification.sql` and `lib/otp.ts` | **PASS** — no phone column; keyed by `booking_id` only |
| Can a verify endpoint be used as a phone oracle? | Route tests assert byte-identical responses for known/unknown bookings | **PASS** |
| Is the OTP stored in cleartext? | `lib/otp.ts`: `createHash("sha256").update(code).digest("hex")` | **PASS** — SHA-256 hash only |
| Are `phone_otp` rows swept? | Read `scripts/`, checked for cron/schedule | **FAIL** — no sweep exists. Covered by the retention gap above |

## Gaps, stated rather than quietly dropped

### There is no retention policy in force for bookings

`search_events` documents a 90-day rule in the migration and has the index to support it,
**and nothing runs the sweep.** `bookings` has no stated retention at all, so a phone number
and a vehicle registration from a two-hour parking session stay in the database for ever.

That is the most serious finding in this review. It is not a breach and it is not a leak —
it is data being kept long past any purpose it had, which is exactly what a retention policy
exists to prevent.

**Why it is not fixed today:** deleting bookings would destroy the audit trail that the
runbook depends on ("never delete a booking; set `status = 'cancelled'`"). The right fix is
*anonymisation*, not deletion — null the three PD columns on bookings whose window ended
more than N days ago, keeping the row, the price and the timing. The same sweep must also
`DELETE FROM phone_otp WHERE booking_id IN (...)` for the anonymised bookings — the
`code_hash` and `attempts` are derived PD and have no purpose after the booking is
anonymised. That is a migration plus a scheduled job, and it needs a number for N that is a
policy decision rather than an engineering one. Carried into the handover.

### There is no way for a person to ask what is held about them

With no accounts there is also no subject-access route: a driver with their reference code
can see their own booking, and a driver who has lost it cannot. Deliberate — a "find my
bookings by phone" endpoint is the enumeration hole ADR-002 exists to avoid — but the
consequence should be named rather than presented as pure upside.

### No privacy notice on the product

The landing page states what is real and what is simulated. It does not say what is stored,
for how long, or who can see it. For a product handling phone numbers and vehicle
registrations that is a gap, and it is a writing task rather than an engineering one.

## Honest limits of this review

One person, who also wrote the code and the schema, reviewing both. No DPO, no legal review,
and no assessment against India's DPDP Act — which, for a product that would process
personal data of Indian residents at any real scale, is the review that would actually
matter. The controls verified above are genuinely verified; the absence of other findings is
not evidence of their absence.
