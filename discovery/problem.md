# Problem statement

## The problem in one line

In dense Hyderabad neighbourhoods, drivers cannot find short-stay parking within walking
distance of where they are going, while nearby private lots sit measurably idle at
exactly those hours.

## Who hurts

**The driver going somewhere crowded.** Not a commuter — a commuter parks at their own
office. This is the person visiting a mall, a restaurant, a clinic, a gym, a friend's
flat. They arrive at a place that has more visitors than bays, and the street outside is
either full, too narrow to park on without blocking it, or actively policed.

**The resident of a narrow lane.** A secondary and sharper version: someone who owns a car
and has no allocated parking at all. For them this is not a trip-level annoyance, it is a
nightly problem. This is the case that started the project.

**The building sitting on idle capacity.** Hurts differently — as unearned revenue rather
than as pain. A lot that is empty from 10am to 5pm is a fixed cost producing nothing for
seven hours a day.

## How often

Per driver, every trip into a dense area — realistically several times a week. For the
narrow-lane resident, nightly.

Rather than assert a market number I cannot verify inside ten days, the honest position is
that the frequency is high enough that a single person hit it hard enough to build this,
and the idle-capacity side is directly observable: any weekday walk past an apartment
visitor bay or a mall lot in the morning shows it.

That claim is checked, not assumed, at Gate 2 — see `discovery/assumptions.md`.

## What it costs today

- **Time circling.** The universally reported cost, and the one people describe first.
- **Blocking other people.** Parking on a narrow lane is not a private decision; it removes
  the lane for everyone else. This is the cost that made the problem feel worth solving:
  the "solution" available to the resident is antisocial.
- **Risk to the vehicle.** Street parking overnight in an unlit lane is a real worry, and
  it is why the gym lot felt like a relief rather than a workaround.
- **Abandoned trips.** The invisible cost. Some trips simply do not happen, and the
  business at the destination never learns why.
- **Unearned revenue** on the supply side.

## What changes if this exists

A driver, before setting off, can see that there is a bookable bay 200 metres from where
they are going, know what it costs for the two hours they need, and arrive holding a
confirmation instead of a hope.

A building with idle bays can turn dead hours into revenue without staffing anything new.

The narrow-lane resident has somewhere to put the car that is not the lane.

## What would tell me I was wrong

- Drivers do not pre-book. They chance the street, decide on arrival, and treat parking as
  a problem to solve at the destination rather than before leaving.
- Buildings will not admit non-residents at any price, because security and liability
  outweigh the money.
- The walk from a bookable bay to the destination is far enough that people would rather
  circle.

Each of these is an assumption with a kill condition, ranked in `discovery/assumptions.md`
and tested at the phase 2 spike.

## Scope note

This statement describes the whole problem. The first release deliberately does **not**
address all of it — see `plan/scope.md` for the Gate 2 cut and what is explicitly out.
