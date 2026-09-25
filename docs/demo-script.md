# Demo script — parkmitra (crisp version)

Live from https://parkmitra-nu.vercel.app, product on screen before anything else, ten
minutes max.

**Before recording:** `curl -s https://parkmitra-nu.vercel.app/api/health` to wake the
database. **Open two browser tabs** on the site before you start — you'll need both later,
no time to open one mid-demo.

Read once, then talk naturally.

---

## Intro — 60-75 seconds

*"This is parkmitra, and it's live right now, not running on my laptop.*

*Here's the problem I set out to solve. In busy parts of Hyderabad — going to a mall, a
clinic, a friend's place — you genuinely can't find parking nearby. Not because there
isn't any. Because you can't see it, and you can't ask for it. So the goal wasn't to build
more parking. It was to help people find the parking that already exists.*

*And I know it's real because it happened to me. One night I had a car, a lane too narrow
to park in without blocking someone, and my own building has no parking. Three minutes
away, there's a gym with a car park that's basically empty by that hour. The space was
right there. I just had no way to find it or ask to use it.*

*Once I looked at it properly, the pattern's everywhere. A mall's lot is packed at 7pm and
empty at 11am. An office basement is dead the entire weekend. So this isn't really a
shortage of parking — it's a mismatch. Space that's idle at exactly the hours someone else
needs it, with nothing connecting the two.*

*So that's what I built — parkmitra lets you book one specific bay, for one specific
window of time, at a price you see up front, before you leave home. And the one thing the
whole system is built around is a promise — once you've booked a bay, it's actually yours,
nobody else can take it from under you. Let me walk you through it, and then prove that
promise a few different ways."*

---

## The flow, end to end — 2 minutes

Pick an area, pick a time, search. Click a spot — bay and price already shown. Fill phone
(+91) and vehicle number, book. Pay (it'll say simulated). Land on confirmation with a
reference code.

*"Search, pick a bay, price is worked out by the server, not the app — I can't fake a
lower price from my end. Phone and vehicle number, no account needed. Pay — simulated,
I'll come back to that. And there's my code — that's what proves this booking is mine."*

Scroll down, click "Find your booking", paste the code — it comes up.

*"And I can always come back and find it again with just that code."*

---

## Test cases, one after another — 5 minutes

Say once before starting: *"Now let me show you a few things this has to get right, and
prove each one actually works, not just that it looks fine."*

**1 — wrong code**
Type a made-up 10-character code, look it up.
*"Not found."*

**2 — malformed code**
Type something short or broken, look it up.
*"Same message. Not found. That's deliberate — if a broken code gave a different error
than a wrong-but-valid-shaped one, someone could use that difference to guess a real code.
So both look identical."*

**3 — the double-booking conflict (the important one)**
Both tabs already on the same spot, same bay, same time window, ready to book, from
earlier setup.

*"Now the real test. Two tabs, same bay, same exact time — like two people going for the
same spot at once."*

Book in tab 1 — confirmed, code shown.

*"Tab one — booked."*

Switch to tab 2, submit.

*"Tab two, same bay, same time, never refreshed — let's see."*

**It fails on screen** — point at the message.

*"Rejected. Both tabs thought that bay was free a second ago. Only one actually got it.
That's not the app being polite — that's enforced in the database itself, one level below
the app, so it can't be tricked by two people clicking at the same instant."*

**4 — bad phone number**
On a fresh booking form, type an invalid number, try to submit.
*"Rejected, and it hasn't wiped what I typed — I don't have to retype everything because
of one mistake."*

---

## What's real, what's not — 30 seconds, don't rush

*"Quick and honest — three things. Payment is simulated, nothing real is charged. The
parking spots themselves are made up — the booking system and the no-double-booking rule
are completely real, I just didn't have permission to list actual businesses. And a
booking is a promise, not a locked gate — there's no barrier or sensor stopping someone
physically. That's the real risk here, and it's not something more code fixes."*

---

## Closing — 30 seconds

*"If I kept going, the next big thing isn't code, it's getting one real parking lot owner
to actually list a real spot — everything technical already works, that part hasn't been
proven yet. And one honest miss — a real timezone bug got past every single automated
test I had, because all my tests happened to run in the same timezone as the code. Took
one actual person clicking around to catch it."*

Stop.

---

## If something breaks live

| What happens | Say this |
|---|---|
| Slow first load | "Free database waking up, it's honest about it instead of hanging." |
| Map tiles missing | "Every spot's in the list too, not just the map." |
| Unexpected 409 elsewhere | Good luck — "that's the same protection working again." |

## Don't

- Start with a slide before the product's on screen
- Go past ten minutes
- Demo from your laptop instead of the live URL
