# Demo script — parkmitra

**Ten minutes. The product runs before any slides.** There are no slides.

Live instance: **https://parkmitra-nu.vercel.app** — opened from the hosted URL, not a
laptop. Everything below is done live; nothing is pre-recorded and nothing is mocked.

**Before starting:** hit the URL once to wake the free-tier database. Neon suspends after
idle and the first request pays a ~3 second cold start. The product surfaces that honestly
rather than hiding it, but it is a poor first ten seconds.

---

## 0:00-0:45 · Why this exists

> "On the night of 11 September there was a car, a lane too narrow to park in without
> blocking it, and a building with no parking of its own. Three minutes away, a gym had an
> empty lot.
>
> The space existed the whole time. There was no way to find it or ask for it. Parking in
> dense areas is not scarce so much as **unevenly idle** — a mall lot is full at 7pm and
> empty at 11am, an office basement is dead all weekend."

No slide. Say it while the home screen is loading.

## 0:45-3:30 · Book a bay, end to end

Do it for real, on the live site.

1. Pick **Gachibowli**, this evening, **2 hours**.
2. Results: the map, and the same spots listed beneath it.
3. Pick a spot → pick a bay → the price appears.
4. Enter a phone number and a vehicle registration.
5. Pay — **say out loud that this is simulated**, and that the landing page says so too.
6. The confirmation screen shows a **reference code**.

**Point at the price.** "The client never sends an amount. The server computes it from a
locked row at insert time. I posted `amount_paise: 0` to production and was charged the
correct ₹50."

## 3:30-4:30 · The reference code is the whole authorisation

1. Go to **Look up**, paste the code — the booking appears.
2. Now type a wrong code of the right shape.
3. Now type a malformed one.

> "Both give byte-identical responses. If they differed, someone could learn the code format
> is right and start guessing. There are no accounts here — a 50-bit code **is** the
> authorisation, and there is deliberately no 'find my booking by phone number', because
> that endpoint would be the enumeration hole the whole model avoids."

## 4:30-6:30 · The promise, and how it is enforced

This is the part that matters. Terminal, live:

```bash
curl -s https://parkmitra-nu.vercel.app/api/health
```

> "It checks the **promise**, not the process. It queries `pg_constraint` for the exclusion
> constraint that prevents double-booking. The app can serve traffic perfectly while quietly
> letting two cars into one bay, and an ordinary liveness ping would call that healthy."

Then show the constraint itself:

```sql
EXCLUDE USING gist (bay_id WITH =, window_at WITH &&) WHERE (status <> 'cancelled')
```

> "No-double-booking is enforced by Postgres, not by application code. A check-then-insert
> in TypeScript reads correctly in review and fails under concurrency, which is the only
> condition that matters."

Then run the test that proves it:

```bash
npx vitest run tests/concurrency.test.ts
```

> "Ten simultaneous inserts for the same bay and window. Exactly one wins, nine fail with
> `23P01`. I verified this test by **dropping the constraint and watching it go red** —
> 'expected 1, got 10'. A test that has never failed has not been tested."

## 6:30-7:30 · What is not real

Do not skip this and do not apologise for it.

> "Three things are not real, and the product says so on its own landing page rather than
> only in a document.
>
> **Payment is simulated.** No money moves.
> **Supply is seeded.** The booking engine, the pricing and the one-car-per-bay guarantee
> are real and enforced by the database. The spots are invented — listing a real business
> without its consent isn't ours to do.
> **A booking is a promise, not a barrier.** There is no gate, no sensor, no guard app."

## 7:30-9:00 · Someone else can run this tomorrow

```bash
git clone … && npm install && cp .env.example .env.local && npm run db:setup && npm run verify
```

> "Twenty-four seconds from clone to serving, timed. 237 unit tests and 17 end-to-end specs,
> including contract tests that validate live responses against the OpenAPI document."

Then open `docs/runbook.md`:

> "A rollback was **executed** on the live deployment — 7 seconds back, 6 forward, verified
> by health disappearing and returning rather than by trusting a success message. The alert
> **fired** and opened a real issue. Its first version printed ALERT and created nothing,
> which I only found by checking whether the issue existed."

## 9:00-10:00 · What I would do next, and what I got wrong

> "Handover has four tickets. The first is rate limiting — done since. The real one is
> ticket 3: **one operator listing one real spot**. That is not an engineering problem, and
> it is the thing this project has not proved.
>
> The most useful thing I learned: **the one bug that reached a real user was a timezone
> shift that 237 passing tests could not catch**, because every test ran in the same
> timezone as the code. It took one person using it once."

**Stop at ten minutes.** If there is time, the questions are better than more demo.

---

## If something breaks live

| Symptom | Say this, then carry on |
|---|---|
| First load slow | "Free-tier database waking up — the interface says so rather than hiding it behind a spinner." |
| Map tiles blank | "OpenStreetMap. The spots are listed below the map too, deliberately — the map is never the only route to a booking." |
| A booking 409s | **This is the best thing that can happen.** "That bay was taken between choosing and confirming. That is the exclusion constraint doing exactly its job, live." |
| Health returns 503 | Open the runbook at "booking_guarantee: false". Two seconds to restore, and it is written down. |

## What not to do

- **No slides before the product.** The anchor is explicit.
- **Do not run over ten minutes.** Over-running scores as a0.
- **Do not demo from localhost.** From the hosted instance, or it does not count.
- **Do not skip the "what is not real" section** to make it look stronger. It is the part that makes the rest believable.
