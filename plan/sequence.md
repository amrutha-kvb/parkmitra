# Slice sequence and dependencies

Vertical slices, never horizontal layers. Each slice below ends with something a person can
be shown; none of them ends with "the backend is finished".

## Dependency graph

```
        S-01 schema ──┬── S-02 indexes
                      ├── S-03 seed ──┐
                      └── S-05 concurrency test
                                      │
        S-04 money helpers ───────────┤
                                      ▼
                            S-07 availability query
                             │
             ┌───────────────┼────────────────┐
             ▼               ▼                ▼
        S-06 /areas    S-08 S1 home     S-09 S2 results
                                              │
                                              ▼
                                    S-10 POST /bookings
                                              │
                                    ┌─────────┴─────────┐
                                    ▼                   ▼
                              S-11 S3 book        S-12 S4 pay + S5 confirm
                                                        │
                                                        ▼
                                                  S-13 S6 lookup + arrive
                                                        │
                                                        ▼
                                                  S-14 end-to-end test
```

**The only hard blocker is S-01.** Everything reads from the schema. It is also the story
that was lost when session 1's first prompt failed to submit, which is why it is the first
thing recovered in session 2 rather than something discovered missing at deploy.

## Order, with what each one lets you demonstrate

| # | Slice | After it, you can show |
|---|---|---|
| 1 | S-01, S-02, S-03 | A real database with real seeded supply. Nothing visual — this is the only slice that ends without a screen, and it is unavoidable. |
| 2 | S-05 | **The promise, proven.** Two racers, one winner. This is the demo moment that matters most and it comes early on purpose. |
| 3 | S-04, S-07, S-06 | Availability answered correctly from the database, including the half-open window edge. |
| 4 | S-08, S-09 | A person can pick an area and a window and *see spots*. First end-to-end user-visible value. |
| 5 | S-10, S-11 | A booking exists, priced by the server, with a 409 on a lost race. |
| 6 | S-12 | The full happy path, ending on a reference code. |
| 7 | S-13 | Return with only the code. The capability model working. |
| 8 | S-14 | The exit condition for phase 6 — the whole flow, no mocks. |

## If it has to give

Fixed in advance, so that a late decision is not made under pressure. `plan/risks.md` R8
says this will probably be needed.

**Drop in this order:**

1. **The map (part of S-09).** The list is complete without it and the failure path for
   missing tiles is already designed. Highest cost, most cuttable.
2. **S6 lookup screen (S-13).** The API endpoint still exists and can be demonstrated with
   a URL. The screen is convenience.
3. **Arrival marking.** Costs the north-star signal, which is painful, but the flow still
   completes without it.
4. **Seed breadth** — seven areas becomes three. Fewer spots, same proof.

**Never dropped, in any circumstance:**

- **S-01 and S-05.** The schema and the proof that double-booking is impossible. Without
  these the product is a pretty list and its one promise is unverified.
- **The four states on whatever screens do ship.** A screen with no empty state is not
  finished, and Gate 4 grades it.
- **The fresh-clone test.** Gate 6 caps the entire score on it.

## What is explicitly *not* sequenced last

**Deployment.** It happens during slice 1, not at the end. "It only runs on my laptop" is
the single most common way a project like this fails its hardest gate, and leaving the
deploy to the final day is how that happens.
