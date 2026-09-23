# Test strategy

Including the part the programme asks about specifically: **how AI-written code gets
verified rather than trusted.** That question is unusually live on this project, because
most of the code is being written by an AI tool in long sessions and I am the only reviewer.

## The layers

| Layer | Tool | What it covers | What it must never do |
|---|---|---|---|
| **Unit** | Vitest | Money rounding, reference-code generation, window validation | Touch the database |
| **Contract** | Vitest | Every endpoint's response shape against `design/openapi.yaml` | Assert on a shape the contract does not specify |
| **Integration** | Vitest + real Postgres | Availability query, the booking insert, the exclusion constraint | **Mock the database.** Mocking it here would test nothing — the guarantee *is* the database |
| **End to end** | Playwright | The whole flow, browser to database | Stub any HTTP call in the demonstrated path |

## The one test that matters most

`S-05` — concurrent overlapping bookings, exactly one winner, against real Postgres.

It is the only test that proves the product's promise, and it is the one that would pass
trivially if written carelessly, because a single-threaded test never races. It must fire
genuinely concurrent inserts and it must fail if the exclusion constraint is dropped. The
spike already demonstrated the behaviour; this promotes it from a throwaway shell script to
a test that guards against regression.

## How AI-written code gets verified rather than trusted

The honest problem: a tool that writes code also writes tests that agree with the code it
wrote. A green suite proves the two are consistent, not that either is correct.

Controls actually used on this build:

1. **The test comes from the acceptance criteria, not from the implementation.** Criteria
   in `plan/backlog.json` were written at Gate 5, before the code existed. A test derived
   from the code is a tautology; a test derived from a criterion written earlier is not.
2. **The failing run is kept.** Every fix PR in this project — including the two raised
   against the CLI itself — shows the test failing before the change and passing after.
   That is the only cheap proof the test actually exercises the thing.
3. **The constraint is checked by deleting it.** For the booking guarantee, the check is
   to remove the exclusion constraint and confirm the test goes red. A test that stays
   green without the constraint was never testing it.
4. **Generated SQL is read line by line against the data dictionary.** Schema is where a
   confidently-wrong column type does the most lasting damage, and it is the cheapest place
   to catch it — the migration is thirty lines.
5. **Contract tests are generated from the contract**, which was written at phase 3 before
   any implementation, so the endpoint cannot quietly redefine what correct means.
6. **Anything the tool volunteered that was not asked for gets removed or justified.**
   Unrequested files are a scope signal (scenario A4), and during session 1 the tool
   produced a `.github/workflows/` file nobody asked for. Reviewed, not merged on trust.

## What runs where

- **Pre-push:** unit + contract + lint + typecheck. Fast, and it is what stops a red CI.
- **CI (GitHub Actions):** the above, plus integration against a Postgres service, plus the
  Playwright run.
- **By hand, once, before submission:** the fresh-clone test — wipe, clone, follow the
  README, time it. Gate 6 grades this and failing it caps the score.

## Known gaps, stated rather than discovered

- No load testing. Out of proportion to the scale.
- No cross-browser matrix. Chrome and Safari at mobile widths only.
- No mutation testing, which is the honest answer to "are these tests any good" and is not
  affordable in the time.
- Seed data is fictional, so nothing proves the product against real supply.
