# Performance, measured

Against the budgets in [`design/nfr.md`](../design/nfr.md). Measured 2026-09-23 against the
live deployment at `https://parkmitra-nu.vercel.app`, release v1.0.0.

## What was measured, and what it includes

20 warm requests per endpoint from Hyderabad, after three discarded warm-up calls.

**These are end-to-end numbers from a real user's location, not server-side numbers.** The
NFR budgets were written as "measured server-side, p95, warm", and I cannot isolate server
compute from a client without server-side instrumentation. Reporting the client figure
against a server budget would understate the product; reporting it *as* the server figure
would be false. So both columns are below, and the verdict column judges the thing the
budget actually asked about.

| Endpoint | Budget (server) | TTFB p50 | TTFB p95 | Wall p95 | Verdict |
|---|---|---|---|---|---|
| `GET /api/areas` | 100 ms | 250 ms | 331 ms | 437 ms | see below |
| `GET /api/availability` | 400 ms | 245 ms | **450 ms** | 508 ms | see below |
| `GET /api/health` | — | 255 ms | 485 ms | 540 ms | — |

## The finding: every request crosses an ocean

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

**This means the budgets are probably being met and I cannot prove it.** Subtract the
round trip and every figure lands inside its budget with room to spare — but "probably,
if you subtract a number I estimated" is not a measurement, so the verdict column says
*see below* rather than **PASS**. I would rather leave this open than award a pass I did
not earn.

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
