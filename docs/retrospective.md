# Retrospective

parkmitra v1.0.0, 22-23 September 2026. Written at the end of the build, about the build.

---

## What the project was

A booking system for short-stay parking against idle private capacity in Hyderabad. It
started from an ordinary evening: a car, and nowhere safe to put it, while a hundred metres
of gated apartment parking sat empty overnight. The product bets that the shortage is
allocation, not construction.

One promise defines it: **a booked bay is yours.** Everything below is about how that
promise was kept, and what nearly broke it.

---

## What went well

### Putting the guarantee in the database

The single best decision was ADR-001: enforce no-double-booking with a Postgres exclusion
constraint rather than in application code. A check-then-insert in TypeScript looks correct
in review and fails under concurrency, which is the only condition that matters. The
constraint cannot be bypassed by a new endpoint, a background job, or a `psql` session.

It also produced the project's best test. `tests/concurrency.test.ts` fires ten simultaneous
inserts and asserts exactly one wins and nine fail with `23P01`. I verified the test by
**dropping the constraint and watching it go red** — "expected length 1 but got 10". A test
that has never failed has not been tested.

### The spike came before the plan

Phase 2 proved the constraint worked before anything was designed around it. If the spike
had failed, the architecture would have changed on day one rather than during the build.

### Verification caught what tests could not

Seven real defects were found by reading generated code and probing the live deployment, not
by the suite. The money bug is the one to remember: **the generated test asserted the bug.**
A suite written by whatever wrote the implementation shares its assumptions, and a green run
proves only that they agree with each other.

### Stating gaps instead of faking them

Rate limiting is documented in the threat model and is not implemented. On serverless, an
in-memory counter would throttle inconsistently while *looking* like a control — worse than
a documented gap, because it invites the belief that the surface is protected. So the
OpenAPI contract was amended to stop promising a `429`, and the gap went into the handover.
The same applied to the landing copy: "Real booking engine, seeded supply. Spots are
invented — listing a real business without its consent isn't ours to do."

---

## What went badly

### I built a test harness instead of testing

Roughly fifty minutes went into a session driver that inferred turn completion from terminal
silence, dropped half its prompts, and was then rewritten to poll a file that never appeared.
I abandoned it for `niha ask --permission-mode auto`, which worked immediately and should
have been the first thing tried.

The lesson is not "don't build tools". It is that I built the fragile thing *first*, before
establishing that the simple thing was insufficient.

### I filed a finding that was wrong

I grepped `niha whoami` through `grep -E 'Email|Role|Token'` and reasoned from what came
back. The filter removed the line saying the credential had been rejected. I then criticised
a correct error message, publicly, on a real issue.

I withdrew it the same day and filed the actual cause separately. But the mechanism is worth
naming precisely, because it is not carelessness and it will happen again to someone: **I
summarised real output, lost the decisive line, and reasoned confidently from the remainder.**
Every individual step felt rigorous. This is exactly what the programme's verbatim-output
rule exists to prevent, and I broke it while believing I was being careful.

### I did it again, in the last hour, immediately after writing this down

While preparing the release I found that two concurrent `npm test` runs corrupt each
other — several suites truncate `bookings`, so one wipes the other's rows and the
concurrency test falsely reports that two bookings won the same bay. Alarming symptom, real
cause, worth fixing.

So I built an advisory-lock global setup to serialise runs. It worked, printed a nice
"waiting for the other run" message — and then hung indefinitely, because `DATABASE_URL`
points at a **pooled** Neon endpoint where session-level advisory locks are not reliable. I
had replaced a rare, loud, correctly-diagnosed race with a silent infinite hang.

I reverted it and wrote four sentences in the README instead: one run at a time per
database, and if you want parallel runs, use a second database — which is exactly what CI
already does with its own service container.

This is the same mistake as the session harness, made maybe forty minutes after I wrote
"try the simple mechanism before building the clever one" in this document. Leaving both in
here, because a retrospective that only contains lessons I have already absorbed is not
describing anything that happened.

### The long-session protocol was not completed

Scenarios B1-B3 required three sessions over two hours, one over four, and one resumed after
a day's gap. One qualifying session exists. The provider outage took 22 September and the
credential expired mid-session on the 23rd — but the honest reading is that I front-loaded
product work and left the long-session evidence until there was no runway for it. External
circumstances made it hard; sequencing made it impossible.

### Generated code failed at the seams

Individual files were consistently good. The joins between separately generated files were
consistently not: a `bigint` arriving as a string and compared with `parseInt`, a link
sending `?spot=` to a page reading `?spot_id=`, a query taking one parameter called with two.
Every one failed silently, and none was caught by a test. I did not adjust my review strategy
after the second occurrence, and paid for the same class of bug five more times.

---

## What surprised me

**Constraints held or evaporated depending on how they were found.** Asked to write
`lib/money.ts`, the tool kept ADR-003's integer-paise rule perfectly across every turn — no
float ever entered the money path — while violating the microcopy rule in
`design/terminology.md` at the first opportunity. The difference seems to be that ADR-003 was
named in the prompt and the terminology file had to be discovered. Constraints you state
survive; constraints you merely write down do not.

**The user found the bug that mattered most.** The timezone shift — an 11 pm selection
arriving as 5:30 pm — survived 217 passing tests, my review, and a deployment. It took one
person using the thing for real, once. Every test in the suite ran in the same timezone as
the code, so none of them could see it.

**Fixing a tool taught me more about it than using it.** F-15 exists because I asked why
parkmitra had no CI runs and read the generated workflow before pushing it. Had I committed
it unexamined on the day it was generated, it would have shown up later as a confusing red
check rather than as a diagnosis.

---

## What I would do differently

1. **Schedule the evidence that cannot be compressed.** Product work expands to fill the
   time; a four-hour session cannot be manufactured on the last afternoon. It should have
   been booked on day one, around the outage rather than after it.
2. **Adjust review strategy after the second instance of a pattern**, not the seventh. Once
   seams were identified as the failure mode, every seam should have been checked
   deliberately.
3. **Never reason from filtered output.** Read it whole, then quote the part that matters.
4. **Try the simple mechanism before building the clever one.** Twice now. The tell is
   that I reach for the clever one before I have written down what the simple one fails at.
5. **Test in a timezone that is not mine.** The one bug that reached a user was invisible to
   every test because they all shared the code's assumptions.

---

## What I would keep, without hesitation

Putting correctness in the schema. Proving the guarantee with a test I watched fail. Writing
down what is not implemented instead of implementing something that looks like it. Withdrawing
the finding that was wrong, in public, the same day.

That last one cost the most and is the least negotiable.
