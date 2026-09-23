# Session register

Long-session protocol evidence (scenarios B1-B8). Session ids are recorded here the
moment a session starts, because B3 requires resuming a specific session after a full
day's gap and a lost id cannot be recovered.

| # | Session id | Started | Purpose | Duration | Turns | Notes |
|---|---|---|---|---|---|---|
| 1 | `259a8a57-dc3b-4623-a894-92fd08aeb008` | 2026-09-23 14:58 IST | Foundation build: schema, seed, scaffold, money helpers, availability query, first API routes | 6 min | 6 | Was reserved for B3. **B3 is now impossible** — resuming needs a model call, and the quota does not clear until 2026-10-01 |
| 2 | `7d425a0b-61d0-4268-86cb-5aa22e37a46e` | 2026-09-23 21:39 IST | Rate limiting, handover ticket 1 | **41 min** | 40/40 | Complete. Latency 29s mean over the first ten turns, 69s over the last ten, max 234s. No pause over 60s. $0.85 |
| 3 | `687268af-dad5-45b5-968e-4c2fb71bbdd5` | 2026-09-23 22:42 IST | Owner surface | **28 min** | **13 real of 36 counted** | **Stopped by the organisation's provider quota.** 23 consecutive turns rejected with a 400. $0.70 |

## The protocol was not completed, and here is exactly why

**B1 (three sessions over two hours), B2 (one over four hours) and B3 (resume after a full
day's gap) are all unmet.** Not deferred — unreachable.

At 23:09 IST on 2026-09-23, mid-session, every model call began returning:

```
Provider error: BadRequestError: Error code: 400 —
'You have reached your specified API usage limits.
 You will regain access on 2026-10-01 at 00:00 UTC.'
```

The submission deadline is 2026-09-25 23:59 IST. **Access returns five days after it.** No
further model-backed niha work is possible for this challenge, which also kills B3: resuming
session 1 requires a model call.

This is the second time the same class of outage decided what this build could contain. The
first cost the whole of 2026-09-22 (F-03) and pushed phases 1-5 out of niha entirely. This
one ends the long-session protocol.

**What the protocol did produce**, and it is not nothing:

- **B5, latency across a long session** — measured, not estimated. Session 2: 29s mean over
  the first ten turns, 69s over the last ten, max 234s. Method in `run_session.py`.
- **B6, pauses over sixty seconds** — none, across 53 real turns.
- **B7, crashes and lost sessions** — none from niha. Every failure in this register is
  either the provider quota or my own harness, and the harness failures are named as mine.
- **B8, cost per session** — $0.85 for 41 minutes, $0.70 for 28. Against the ₹0 runtime
  budget in `design/nfr.md`, which this does not touch: parkmitra calls no model at runtime.
- **A finding worth more than the sessions it came from.** niha counted all 36 of session
  3's turns, including the 23 that failed, and `niha export` summarises it as
  `Outcome: completed`. Filed as
  [#1038](https://github.com/niha-and-co/ai-platform/issues/1038). I found it because my
  harness trusted `turnCount` and reported steady progress for two minutes while every
  request was being rejected.

## B3 resume command, for the record

Kept because it was set up correctly and would have worked:

```
niha
/resume 259a8a57-dc3b-4623-a894-92fd08aeb008
```

## Harness note, recorded for honesty

Sessions are driven through a scripted pty (`run_session.py`) rather than typed by hand,
so that per-turn latency (B5) and pauses over sixty seconds (B6) are measured rather than
estimated. The transcripts and timings are real; the typing is automated.

One consequence, and it is the harness's fault rather than the tool's: on session 1 the
first prompt was submitted before the REPL had finished booting and was lost — `meta.json`
shows `firstUserMessage` as what was intended to be turn 2. Recorded here rather than
filed as a finding, because it is a defect in this driver, not in niha.
