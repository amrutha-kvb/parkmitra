# Session register

Long-session protocol evidence (scenarios B1-B8). Session ids are recorded here the
moment a session starts, because B3 requires resuming a specific session after a full
day's gap and a lost id cannot be recovered.

| # | Session id | Started | Purpose | Duration | Turns | Notes |
|---|---|---|---|---|---|---|
| 1 | `259a8a57-dc3b-4623-a894-92fd08aeb008` | 2026-09-23 14:58 IST | Foundation build: schema, indexes, seed, scaffold, money helpers, availability query, first API routes | see summary.json | see summary.json | **Reserved for B3.** Must be resumed on 2026-09-25 after a full day's gap — do not touch on the 24th. |

## B3 resume command

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
