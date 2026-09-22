# Brainstorm — and why this file is not what the process asked for

**Date:** 2026-09-22
**Phase:** 1
**Status:** partial. Declared deviation, not an omission.

## What the process asked for

Phase 1, step 2: *"Full brainstorm session driven through the Niha CLI, exported."* R1
reinforces it: *"Niha first for every stage, including the ones that are not code:
brainstorm, problem statement, ADRs, stories, mockup briefs. Every stage exported."*

## Why there is no exported niha session here

There cannot be one. Every model-backed call fails:

```
$ niha ask "say hi"
Error: Provider error: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.'}, 'request_id': 'req_011CfJXCUPG5x7ZTwJ6k2baC'}
```

Filed as F-03 (#1013), severity S1, tier T1, escalated to the challenge channel the same
day. The challenge team confirmed the cause — the organisation is out of provider credits,
ongoing for about a week, with a payment problem blocking the top-up. The stated reset,
2026-10-01, is after submissions close.

`niha export` *does* work, and the sessions it can export are the failed ones. That is
the honest artifact available: the record of the tool being unable to run the stage.

Tool switch declared in `field/tool-switches.md`.

## The brainstorm that actually happened

Unaided, on paper and in conversation, on 2026-09-21 and 2026-09-22. Options considered
before settling:

**Directions rejected**

| Idea | Why not |
|---|---|
| Continue an existing client project (gym management system) | Real client, real client data throughout — the challenge forbids client names and data in the repo or field report, and separating them was not tractable in the time. Also had no backend, so "database to screen" would have meant building it from zero anyway. |
| Revive a personal product already built (nutrition app) | Already finished. The decisions were made in August; writing them up now as if decided this week would be backdating, which is explicitly penalised and is simply dishonest. |
| Internal agency ops tools (pipeline tracker, intake form, lead CRM) | Genuinely useful, low risk, and dull. Would have shipped, but solves no problem I could describe to a stranger in one sentence. |
| Free-tier cost watchdog | Reads as built-for-the-challenge rather than for a person. |

**The direction taken**

Parking. It came from a real night with a real car and nowhere to put it, which is the
only one of these that arrived as a problem rather than as a project idea.

**Framings tried and discarded within the parking idea**

1. *IT-corridor commuter parking* — wrong. Commuters have office parking. Discarded after
   about ten minutes of thinking about who actually suffers.
2. *Supply-side first: get buildings to list* — correct long-term, impossible in the time.
   Trust is the product and trust cannot be built in three days.
3. *Full two-sided marketplace* — the honest version, and far too large.
4. *Searcher flow only, seeded supply* — chosen. Proves the demand-side experience end to
   end and is truthful about what it does not prove.

## What this cost

A brainstorm run through the tool would have produced a transcript, and the programme
wanted that transcript as evidence of *how the tool handles a non-code task* — scenario
A6 specifically. That observation cannot be made this round. It is one of the reasons the
long-session and task-understanding scenarios are absent from the field report, and the
gap is stated in `field/report.md` rather than papered over.
