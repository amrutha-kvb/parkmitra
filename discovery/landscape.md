# Competitive scan and build-versus-buy

Scanned 2026-09-22. A deliberate limitation stated up front: this is a desk scan done
inside a ten-day window without user interviews or a market study. It is enough to decide
*whether to build*, and it is not enough to size a market. Claims below are marked as
observed, inferred, or unverified so a reader can tell which is which.

## What exists

**International marketplaces — JustPark (UK), SpotHero / ParkWhiz (US), Parkopedia.**
*Observed.* The model is proven elsewhere: private owners and commercial lots list bays,
drivers book by the hour. They are not operating in Hyderabad in any meaningful way, and
their supply model assumes an owner willing to transact with strangers — the assumption
that is least certain here.

**Indian parking apps — Park+, ParkMate and similar.**
*Observed, shallow.* Park+ is the visible player. Its centre of gravity has moved toward
being a broad car-services app (FASTag recharge, challan checks, fuel, insurance) with
parking as one surface among many, and its parking supply skews toward *commercial*
operators and gated societies it has signed. *Inferred:* the hard commercial work is
signing buildings, and that is a field-sales motion, not a software one.

**Mall and airport operators.** *Observed.* Own their own systems, sell their own bays.
Closed. They are not a competitor so much as a category of supply that will never list
with a third party.

**The actual incumbent: the informal system.** *Observed, first-hand.* Guards, attendants,
"₹50 and park behind the shop", and knowing someone. This is what people use, it works
tolerably, it costs nothing to start, and it is instant. Any product here is competing
with it, not with an app.

## Where the gap is

The gap is not "a parking app for India" — that exists. The gap is **short-stay, visitor
parking against idle private capacity in dense residential and mixed-use pockets**, where:

- the demand is a visitor, not a commuter or a resident of that building
- the supply is capacity that is idle *at that hour* rather than a commercial lot
- the distance that matters is a two-minute walk, not "somewhere in the area"

*Unverified:* whether that gap is large enough to be a business. This project does not
attempt to answer that inside ten days, and it should not pretend to.

## Build versus buy

**Buy / integrate?** There is nothing to buy. The marketplaces are not licensable as
infrastructure, and the incumbents are competitors, not vendors. An integration play
(listing on Park+) would mean not owning the supply relationship, which is the only part
that is defensible.

**Build.** Chosen. The domain is simple enough that the software is not the risk — the risk
is entirely in supply-side trust and cold start, which no vendor removes.

**What we deliberately will not match**

- **FASTag, challans, fuel, insurance, car services.** The super-app surface area. Out
  permanently, not just out of v1 — it is a different product.
- **Real-time bay sensors, ANPR, boom-barrier integration.** The hardware path. It is how
  the mature version enforces bookings, and it is unbuildable in ten days.
- **Monthly and residential leasing.** A different transaction with different economics.
- **Nationwide coverage.** The first release is seven areas of one city, by choice —
  see `plan/scope.md`. Density in a small area beats thin coverage everywhere, because the
  empty-result rate in `discovery/metrics.md` is what kills adoption.

## What this scan does not tell us

Whether a building manager will actually say yes. That is the riskiest assumption in the
project and no amount of desk research settles it — it is ranked in
`discovery/assumptions.md` and it is what the phase 2 spike is pointed at.
