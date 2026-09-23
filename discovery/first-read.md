# First read — the problem in my own words, unaided

Written 2026-09-22, before any research, any competitor scan, and any code.
Deliberately not tidied afterwards: this is the record of what I thought at the start,
and it is worth being able to compare it with what I believed by Gate 2.

## Where this came from

This is not a problem I went looking for. On the night of 2026-09-11 we had a car and
nowhere to put it. The lane we live on is narrow enough that a parked car blocks it for
everyone else, and the building has no parking of its own. We ended up leaving the car at
the gym I go to, because the gym has a lot and at that hour it was empty.

That is the whole idea. The space existed the entire time, three minutes away, doing
nothing. There was simply no way to know it was there or to ask for it.

## The problem, restated

In dense parts of Hyderabad, parking is not actually scarce. It is **unevenly idle**.

A mall lot is full at 7pm and empty at 11am. An apartment complex has visitor bays that
sit unused all working day. An office basement is dead from Friday evening to Monday
morning. Meanwhile, fifty metres away, someone is circling, or double-parking, or
blocking a lane, or giving up on the trip.

The mismatch is not supply. It is that idle capacity is invisible and unsellable, and
demand has no way to reach it.

## Who this is not for

Worth stating early because my first instinct was wrong. I initially framed this around
the IT corridor as a commuter problem — HITEC City, Gachibowli, people driving to work.
That framing is wrong: people driving to their own office already have parking at their
office. It is provided.

The people who actually suffer are **visitors** to crowded places. Someone going to a
mall, a restaurant, a clinic, a friend's apartment, a gym. They have no claim on any
lot, and the street has no room.

## What I think is hard about it

Not the software. The software is a list and a booking.

The hard parts, guessed at now and to be tested at Gate 2:
1. **Supply-side trust.** Will a building actually let a stranger in? Security, liability,
   "who is this car". This is probably the real product, not the search screen.
2. **Cold start.** A parking app with four spots is not useful. A parking app with no
   drivers is not worth listing on. Classic two-sided problem.
3. **Enforcement.** What happens when someone overstays, or parks in the wrong bay, or
   the gate guard has never heard of any of this.
4. **Payment trust in both directions**, and what a refund looks like when the spot
   turns out to be blocked.

## What I would need to believe for this to work

- That at least some buildings in a dense area have genuinely idle, bookable capacity
- That the person who controls that capacity (manager, secretary, guard) can say yes
- That a driver will pre-book rather than chance the street
- That an hourly price exists that is worth it to both sides

I do not know any of these yet. Assumption map at phase 2 is where they get ranked.

## Ten-day framing

Ten days cannot solve trust, cold start and enforcement. It can build and prove **one
flow**: a person finds a nearby spot that is free for the window they need, books it, and
turns up with a confirmation. If that flow is not convincing, nothing behind it matters.

*(Note on process: R1 asks for this stage to be driven through the Niha CLI and exported.
That was not possible — every model call fails with a provider usage-limit error, filed
as F-03 and escalated. The switch is declared in `field/tool-switches.md`.)*
