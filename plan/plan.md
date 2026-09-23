# Build plan

The plan of record from Gate 5. Slice order is in `plan/sequence.md`; this is the calendar
and who does what, including the parts that are not code.

## The calendar constraint

Submissions close **2026-09-25 23:59 IST**. Registration was late and the provider outage
(F-03) took the whole of 22 Sep for anything model-backed. What remains is roughly two and
a half days, and three things inside it have fixed dates rather than durations.

| Fixed-date item | Why it cannot move |
|---|---|
| **Session 1 started 23 Sep** | Scenario B3 needs a session resumed after a *full day's gap*. Started 23rd → untouched 24th → resumed 25th is the only arrangement that fits. Missing it forfeits the points permanently. |
| **Fresh-clone test on 25 Sep, with hours to spare** | Gate 6 caps the entire score on it. Running it at 23:00 leaves no time to fix what it finds — and what it finds is usually the README. |
| **CLI fix PRs already open** | Criterion 6 says *merged*. Merging is the CLI owner's decision, so the only lever is raising them early, which is done. |

## Day plan

### 23 Sep — foundation, through niha
- **Session 1** (started 14:58): schema, indexes, seed, scaffold, money helpers with tests,
  availability query, first API routes. Registered for the B3 resume.
- Phase 5 artifacts written alongside (this document and its siblings).
- Recover S-01: session 1's first prompt was lost to a harness fault, so the schema
  migration is the first thing session 2 does.
- Deploy skeleton to the host — **not left to the end**, per `plan/sequence.md`.

### 24 Sep — the product, through niha
- **Session 2, the long one (4h+ target, scenario B2):** S-08 through S-13 — home, results
  with map, booking, payment, confirmation, lookup. This is where most of the product gets
  built and where most build-phase findings will come from.
- **Session 3 (2h+):** hardening — the concurrency test S-05, contract tests, the
  end-to-end run S-14.
- **Session 1 is not touched today.** That is the gap B3 requires.
- Findings logged the same day, in format, with verbatim output.

### 25 Sep — resume, harden, ship
- **Resume session 1** → scenario B3 satisfied. Continue the same piece of work, and record
  honestly whether it picked up or had to be re-briefed.
- Phase 7: security review against the threat model, accessibility audit, performance and
  cost measured against `design/nfr.md`, runbook.
- **Fresh-clone test, timed** → Gate 6.
- Phase 8: deploy final, tag v1.0, changelog, demo recording, field report, retrospective,
  effort accounting.
- Phase 9: fire the alert on purpose, execute a rollback on the live deployment → Gate 7.
- Submit.

## Division of work

| Who | What |
|---|---|
| The build (me, driving niha) | Everything in `plan/backlog.json`, the artifacts, deploy, tests, field report |
| **Amrutha, and only Amrutha** | **The demo videos** — two short ones for the CLI fix PRs, and the 10-minute product demo. No part of the build can produce these. |
| **Amrutha** | Chasing the two fix PRs (#1019, #1021) if they go quiet |
| The CLI owner | Reviewing and merging those PRs. Outside this project entirely. |

## What "finished" means on the 25th

- The one flow runs on a hosted URL a stranger can open, database to screen, no mocks
- A clean clone comes up by following the README, timed
- All four states behave on every shipped screen
- Double-booking is refused, with a test that proves it under concurrency
- Eight or more findings filed, reproducible, verbatim, spread across phases
- The long-session protocol run and reported honestly, including whatever it got wrong
- Alert fired and rollback executed on the live deployment

## What will be reported as not done

Written here in advance so it is a disclosure rather than an excuse discovered at the end:

- Supply-side onboarding, enforcement, real payments, accounts — cut at Gate 2
- Screen-reader testing on a real device
- Anything the long-session protocol could not reach because the model was unavailable on
  22 Sep
