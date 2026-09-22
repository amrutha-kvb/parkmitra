# Wireframes — low fidelity

Structure and hierarchy only. No colour, no type choices, no spacing decisions — those come
after this is agreed, in `design/mockups/`. Mobile-first: every frame below is ~390px wide.

Screens are S1-S6, matching `design/flows/primary-flow.md`.

---

## S1 — Home: pick an area and a window

```
┌────────────────────────────────┐
│ parkmitra                      │  ← wordmark only, no nav. One job.
│ Park near where you're going.  │
├────────────────────────────────┤
│                                │
│ WHERE                          │
│ ┌──────┐┌──────┐┌────────────┐ │  ← chips, not a <select>.
│ │HITEC ││Gachi ││ Madhapur   │ │    One tap. No dropdown on mobile.
│ └──────┘└──────┘└────────────┘ │
│ ┌────────┐┌────────┐┌────────┐ │
│ │Kondapur││Hafeez  ││Fin.Dist│ │
│ └────────┘└────────┘└────────┘ │
│ ┌──────────┐                   │
│ │Manikonda │                   │
│ └──────────┘                   │
│                                │
│ WHEN                           │
│ ┌────────────┐ ┌─────────────┐ │
│ │ Today   ▾  │ │ 2:30 pm  ▾  │ │  ← start
│ └────────────┘ └─────────────┘ │
│                                │
│ FOR HOW LONG                   │
│ ┌───┐┌───┐┌───┐┌───┐┌────────┐ │  ← duration, NOT an end time.
│ │1h ││2h ││3h ││4h ││ More ▾ │ │    People think in hours.
│ └───┘└───┘└───┘└───┘└────────┘ │
│                                │
│ ┌────────────────────────────┐ │
│ │      Find parking          │ │  ← one primary action
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

## S2 — Results: list + map

```
┌────────────────────────────────┐
│ ‹ Gachibowli · 2:30–4:30 pm  ✎ │  ← what was asked, editable in place
├────────────────────────────────┤
│ ┌────────────────────────────┐ │
│ │                            │ │
│ │       [ map, pins ]        │ │  ← ENHANCEMENT. List below is
│ │                            │ │    complete on its own.
│ └────────────────────────────┘ │
├────────────────────────────────┤
│ 4 spots unbooked               │
│                                │
│ ┌────────────────────────────┐ │
│ │ Cyber Heights          ₹40 │ │  ← price per hour, prominent
│ │ apartment · 3 min walk /hr │ │
│ │ 6 bays unbooked            │ │
│ │              ┌───────────┐ │ │
│ │              │  Choose   │ │ │
│ │              └───────────┘ │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ Orchid Square          ₹30 │ │
│ │ mall · 6 min walk      /hr │ │
│ │ 2 bays unbooked            │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

## S3 — Book

```
┌────────────────────────────────┐
│ ‹ Cyber Heights                │
├────────────────────────────────┤
│ Tue 23 Sep · 2:30–4:30 pm      │
│                                │
│ PICK A BAY                     │
│ ┌────┐┌────┐┌────┐┌────┐       │
│ │B-02││B-07││B-11││B-12│       │  ← labels, so the driver knows
│ └────┘└────┘└────┘└────┘       │    where to actually go
│                                │
│ YOUR DETAILS                   │
│ ┌────────────────────────────┐ │
│ │ Phone                      │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ Vehicle number             │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ Name (optional)            │ │
│ └────────────────────────────┘ │
│                                │
│ ┌────────────────────────────┐ │
│ │ 2 hours × ₹40      ₹80     │ │  ← rounding rule shown, not hidden
│ │ Part hours round up.       │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │      Book this bay         │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

## S4 — Pay (simulated)

```
┌────────────────────────────────┐
│ ┌────────────────────────────┐ │
│ │ ⚠ Demo — no real payment   │ │  ← standing, not dismissible
│ │   is taken.                │ │
│ └────────────────────────────┘ │
│                                │
│ Cyber Heights · B-11           │
│ Tue 23 Sep · 2:30–4:30 pm      │
│                                │
│         ₹80                    │  ← the number, large
│                                │
│ ┌────────────────────────────┐ │
│ │    Pay ₹80 (simulated)     │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

## S5 — Confirmed

```
┌────────────────────────────────┐
│           ✓ Booked             │
│                                │
│      7K2M 9QX4 TB              │  ← LARGEST thing on the screen.
│      ┌──────────┐              │    Mono, grouped, copyable.
│      │   Copy   │              │
│      └──────────┘              │
│ Save this — it's the only way  │  ← said plainly (ADR-002)
│ back to this booking.          │
│                                │
│ Cyber Heights · Bay B-11       │
│ 12 Rd No 2, Gachibowli         │
│ Tue 23 Sep · 2:30–4:30 pm      │
│ ₹80 · paid (simulated)         │
│                                │
│ ┌────────────────────────────┐ │
│ │      I've arrived          │ │  ← the north-star signal
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

## S6 — Lookup

```
┌────────────────────────────────┐
│ Find your booking              │
│                                │
│ ┌────────────────────────────┐ │
│ │ Reference code             │ │  ← mono input, auto-uppercase
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │        Look up             │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

---

## Decisions this wireframing round settled

**Duration chips, not an end-time picker.** Two datetime inputs is the obvious build and
the wrong interface: a driver thinks "two hours", not "until 4:30". It also removes the
whole class of end-before-start errors, which is a validation rule we then do not need.

**Bay labels shown, not hidden.** It would be simpler to auto-assign a bay. But "B-11" is
what makes the confirmation usable when you are standing in a car park, and it is the
difference between a booking and a receipt.

**The rounding rule is on the screen.** Part hours round up (ADR-003). Showing it at
booking time costs one line; discovering it at payment feels like a trick.

**Map above the list, and never instead of it.** The map answers "is it near where I'm
going", which a list cannot. But it is an enhancement — `design/a11y.md` requires every
spot to be reachable from the list alone, and S2's failure path keeps the list working when
tiles fail.

**One primary action per screen.** Anywhere two appeared, the screen had not decided what
it was for.
