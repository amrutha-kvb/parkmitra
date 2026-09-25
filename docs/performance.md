# Performance, measured

Against the budgets in [`design/nfr.md`](../design/nfr.md). Server-side figures measured
2026-09-25 against the live deployment; the end-to-end figures below are from 2026-09-23.

## Measured server-side, and now proven (2026-09-25)

`design/nfr.md` states its budgets as *"measured server-side, p95, warm"*. Until today
nothing measured server-side, so every verdict below had to be recorded as **unproven** —
from Hyderabad the wall-clock figure is dominated by the round trip to the function region,
and subtracting an estimate is not a measurement.

`/api/areas` and `/api/availability` now emit a standard `Server-Timing` header carrying the
handler's own duration. Measured on the live deployment, 25 warm requests each:

| Endpoint | Budget | p50 | p95 | max | Verdict |
|---|---|---|---|---|---|
| `GET /api/areas` | 100 ms | **2.7 ms** | **7.1 ms** | 83.9 ms | **PASS** — 14× headroom |
| `GET /api/availability` | 400 ms | **2.6 ms** | **24.2 ms** | 65.5 ms | **PASS** — 16× headroom |

```console
$ curl -sI https://…/api/availability?area=gachibowli&… | grep -i server-timing
server-timing: handler;dur=2.6
```

**Both budgets are met with an order of magnitude to spare**, and the figure is now readable
by anyone with curl or browser devtools rather than being an estimate in a document.

### The same measurement, taken wrongly, says the opposite

Run against a local server talking to the same hosted database, the identical instrumentation
reports:

| Endpoint | p50 | p95 |
|---|---|---|
| `GET /api/areas` | 248.8 ms | 347.0 ms |
| `GET /api/availability` | 246.5 ms | 291.9 ms |

That reads as a **failure** on the 100 ms budget. It is not a different product — it is the
handler waiting on a database in `us-east-1` from a laptop in Hyderabad. Recorded because it
is the trap: server-side timing is only meaningful when the server is where the server
actually is. I nearly wrote the first set of numbers up as the verdict.

## The finding this confirms: every request crosses an ocean

```console
$ curl -sI https://parkmitra-nu.vercel.app/api/areas | grep x-vercel-id
x-vercel-id: bom1::iad1::c4zfk-1790174171629-28ef58968e55
```

Read that right to left. The request **enters at `bom1`** — Vercel's Mumbai edge, a few
hundred kilometres from the user — and is then **executed at `iad1`**, Washington DC. The
database is in `us-east-1`, co-located with the function, so the app-to-database hop is
cheap and is not the problem.

The problem is that the user is in Hyderabad and the compute is in Virginia. Roughly
**230-250 ms of every measurement above is geography**, paid on every single request, and
no query optimisation can touch it. That is why all three endpoints cluster around the same
p50 despite doing very different amounts of work: `/api/areas` returns seven effectively
static rows and `/api/availability` runs the product's real query, and they are within 5 ms
of each other. When two endpoints with a 10x difference in work take the same time, the
time is not being spent on work.

**This was written before the budgets could be proven, and it said so.** At the time the
honest position was "probably being met, and I cannot demonstrate it" — subtracting an
estimated round trip is not a measurement, so the verdict column read *see below* rather
than **PASS**.

The `Server-Timing` measurement at the top of this document settles it: **2.7 ms and 2.6 ms
p50 server-side, against budgets of 100 ms and 400 ms.** The hypothesis in this section — that
two endpoints doing a 10× difference in work take the same wall-clock time because the time
is not being spent on work — turned out to be exactly right, and is now evidence rather than
inference.

### The fix, which is configuration and not code

Set the function region to `bom1` and create the Neon database in `ap-south-1`. **Both, or
neither** — moving the function to Mumbai while leaving the database in Virginia would make
things worse, turning one user-to-server crossing into several server-to-database
crossings per request.

Not done inside the challenge window because it means migrating the database, and doing
that against a live deployment on the last evening, to chase a number rather than fix a
fault, is the wrong trade. It is in the handover.

## Cold start

Neon's free tier suspends compute after idle, and the first request after suspension pays
the wake-up. Observed at **~3 s**, consistent with earlier phases.

This is surfaced in the interface rather than hidden behind an indefinite spinner, which is
the honest handling of a known property of the tier. It is excluded from the p95 figures
above deliberately, and reported separately, because burying a 3-second outlier inside a
warm p95 would misrepresent both numbers — as `design/nfr.md` says.

## Cost

| | |
|---|---|
| Vercel | 13 production deployments, within Hobby limits |
| Neon | Storage negligible — 7 areas, 20 spots, 106 bays |
| Runtime model spend | **₹0** — parkmitra calls no model at runtime |
| Total spend | **₹0.** No card on any service. |

The cost budget is met, and unlike the latency budget that one I can state plainly.

## What I would measure next

1. **Server-side timing**, so the NFR budgets can actually be judged. A `Server-Timing`
   header carrying the handler duration would make every number above decomposable, and is
   a small change.
2. **Latency after the region move**, to confirm the diagnosis rather than assume it.
3. **Availability under concurrency.** Everything here is a single sequential client. The
   interesting question for this product is what the p95 looks like while the exclusion
   constraint is actually contending.
