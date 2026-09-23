# First users

Phase 9 asks for the first three people to use the product, and what broke.

## There have not been three

**One person has used parkmitra who did not build it**, and that is the honest number. It is
written here rather than padded to three, because the alternative is inventing two people,
and a fabricated user report would be worth less than an empty page — it would make every
other observation in this repository harder to believe.

Getting real drivers in front of it needs a real spot, and a real spot needs an operator's
consent. That is handover ticket 3, and it is a trust problem rather than an engineering one.
It was not solvable inside the challenge window and pretending otherwise would be exactly the
kind of claim this project has avoided everywhere else.

---

## User 1 — the product owner, testing the deployed build by hand

**2026-09-23, on a phone, against the live deployment.** Not a developer walkthrough: they
opened the URL, chose a time, and tried to book a bay.

### What broke

**A booking made for 11:00 pm came back as 5:30 pm to 8:30 pm.**

In their words:

> "I currently have selected eleven p.m. and I've selected three hours. And it gave me
> automatically 5:30 to 8:30 p.m."

The cause was in `lib/home-validation.ts`. The code built the search window with
`toISOString()` and sliced off the trailing `Z`, which converts to UTC and then presents the
result as if it were local — so in IST every time silently moved back by 5 hours 30 minutes.

```ts
// before
const iso = d.toISOString().slice(0, 16);   // 18:00 IST → "…T12:30"
```

Fixed by constructing the string with the local offset preserved, and the offset arithmetic
is now the thing under test rather than an implementation detail.

### Why this one matters more than the fix

**It survived the entire passing test suite, a code review, and a deployment.** Not one test
caught it, and not because the tests were bad — because every one of them ran in the same
timezone as the code, so they all shared the bug's assumption. There was no test that could
have failed.

It took one person, using it for real, once.

That is the single most useful thing this project learned about testing, and it is now
handover work: a CI matrix entry with `TZ` set to something other than IST.

### What did not break

Everything else in the flow. Search, results, the map, bay selection, the price, the
confirmation screen and the reference-code lookup all behaved. The accessibility and
concurrency guarantees held. The bug was in presenting a time, not in the booking engine.

---

## What one user cannot tell us

Stated so the gap is not mistaken for a clean bill of health:

- **Nothing about whether anyone wants this.** One user, who already believed in the idea
  because they had the problem that started it, is not signal about demand.
- **Nothing about the supply side.** No operator has listed a spot, so the whole
  owner-facing half of the product is untested by anyone.
- **Nothing about trust at the gate.** A booking is a promise, not an enforced barrier. What
  happens when a driver arrives and a guard has never heard of parkmitra is the central
  unanswered question, and no amount of software testing answers it.
- **Nothing about the 3-second cold start** mattering to someone circling a block.

## Next

Handover ticket 3 is done when *one real operator has listed one real spot through an
interface they used themselves, and one real driver has parked in it.* Until that sentence is
true, this document stays at one user.
