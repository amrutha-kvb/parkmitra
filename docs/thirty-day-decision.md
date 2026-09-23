# The thirty-day decision

**Adopt, hand over, or retire.** Due **2026-10-23**, thirty days after v1.0.0 shipped on
2026-09-23.

Written now, before the answer is known, so the criteria cannot be chosen afterwards to
justify whatever happened. A decision framework written on the day of the decision is not a
framework, it is a rationalisation.

---

## The question

parkmitra works. The booking engine is real, the guarantee is enforced by the database, and
it is live. **None of that is evidence that it should continue** — the product's entire bet
is that a building will let strangers park in its empty bays, and no building has been asked.

So the decision is not "is the software good". It is: **has anyone outside this project shown
that they want it?**

## The deciding fact

> **By 2026-10-23, has one real operator listed one real spot, and one real driver parked
> in it?**

That sentence is handover ticket 3's definition of done, and it is deliberately the same
sentence here. Everything else — code quality, test coverage, uptime, how much was learned —
is irrelevant to this decision, and all of it is a reason people keep projects alive that
should not be.

## The three outcomes

### Adopt — if the deciding fact is true

One operator and one driver is not traction, but it is the difference between a hypothesis
and an observation. If it is true:

- The first thing to build is **not** more features. It is whatever the operator asked for
  in the conversation where they said yes, because that is the only real requirement this
  product has ever had.
- Handover tickets 1 (done), 2 (payment and OTP) and 4 (region) become real work with a
  real deadline.
- The runbook's missing deputy owner stops being a note and becomes a blocker.

### Hand over — if it is false but someone else wants it

Plausible outcomes: a parking operator wants the booking engine for their own lots; a
student wants the exclusion-constraint work as a teaching example; someone in the challenge
cohort wants to take it further.

The repository is already built for this — runbook, handover, ADRs naming rejected
alternatives, a security review and a privacy review both stating what is *not* done. If
handing over, the one thing to add is an honest conversation about why the supply side was
never proved, rather than letting the next person rediscover it.

### Retire — if it is false and nobody wants it

**This is the most likely outcome, and it is not a failure.**

The hypothesis was that idle private parking can be allocated by software. What this project
actually established is that **the hard part was never the software**: the booking guarantee,
the pricing, the concurrency safety and the deployment all took about thirteen hours. The
unsolved problem — persuading a building to trust strangers with its bays — was untouched by
all of it.

Retiring means: archive the repository read-only, delete the Neon database after exporting
the schema, leave the live URL up until the free tier reclaims it, and write one page saying
what was learned. The seed data is fictional, so there is nothing to protect and nobody to
notify. The retrospective and this document are the deliverable that outlives the code.

## What would change the answer, and what would not

| Would change it | Would not change it |
|---|---|
| An operator saying yes | More test coverage |
| A driver parking somewhere real | A prettier interface |
| Someone else asking to run it | Sunk cost, or how much was learned building it |
| A regulation or partner making supply easy | The fact that it still works |

## Who decides

Amrutha Korumilli, as the only named owner. There is no deputy — the runbook says so, this
document repeats it, and if the answer is *adopt*, fixing that is the first task rather than
a later one.

## Record of the decision

To be completed on **2026-10-23**. Leaving it blank until then is the point.

| | |
|---|---|
| Deciding fact true? | _unanswered_ |
| Decision | _unanswered_ |
| Reason | _unanswered_ |
| Date | _2026-10-23_ |
