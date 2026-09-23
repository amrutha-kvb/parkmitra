# Declared tool switches

Required by R6 and C5: every switch to a different tool is declared here with the task,
what was used instead, and why. An undeclared switch invalidates the field report, so
this file is the record of record and is written the day the switch happens.

Standing position: niha first for every stage. Where a row below exists, niha was tried
first and the reason it could not be used is stated.

---

## 2026-09-22 — all model-backed work

**Task:** everything requiring a model turn — brainstorm, problem framing, discovery
artifacts, and all code for the product.

**Switched to:** Claude Code (Anthropic), running in the VS Code integrated terminal.

**Why:** niha's model layer is unreachable. Every `niha ask` and every prompt in the
interactive session returns a provider 400: *"You have reached your specified API usage
limits. You will regain access on 2026-10-01 at 00:00 UTC."* Recorded as F-03 (#1013),
severity S1, tier T1. The stated reset is six days after submissions close, so it does
not clear inside the challenge window. Escalated to the challenge channel the same day
per the T1 rule rather than continuing to retry.

**What niha was still used for, unaffected:** `niha --version`, `niha doctor`,
`niha whoami`, `niha status`, `niha init` (as a diagnostic, producing F-01), and the
interactive session launch itself (producing F-04). Non-model surfaces work and were
exercised; the model surface is the part that is dead.

**Scope consequence:** per the programme rule *"fix time does not count against scope —
an engineer who loses a day to a T1 has their scope reduced by a day, not their score"*,
the time lost to F-03 and to the F-01/F-02 detour is logged here and in the daily field
log rather than absorbed silently into the build.

**Reversal condition:** the moment the usage limit is lifted, model-backed work returns
to niha and this row stops accruing. Retry cadence and outcome are recorded in the daily
field log.

---

## 2026-09-22 — investigating and fixing a web-console defect (withdrawn from the findings)

**Task:** reading `niha-and-co/ai-platform` source to locate a role-gating defect in the
web console, writing the failing test, and preparing PR #1011. Later withdrawn from the
numbered findings as out of scope (it is `src/web`, and the challenge scopes findings to
`src/cli-ink`); the time is still logged here because it was spent.

**Switched to:** Claude Code, plus ordinary local tooling (`git`, `gh`, `npx vitest`,
`npx eslint`, `npx tsc`).

**Why:** same root cause as above — niha could not be used to read or edit files, because
no model turn completes (F-03). Fix work on the CLI repository is also a separate clock
from the product build by the programme's own rule ("two clocks, two commit histories"),
and is logged separately here.

---

## 2026-09-23 — investigating and fixing F-15 (`niha ci agent init`)

**Task:** reproducing the broken generated workflow, verifying that `@v1` resolves to
nothing, patching `src/cli-ink/src/commands/ci-agent.ts`, and preparing PR #1034.

**Switched to:** Claude Code, plus ordinary local tooling (`git`, `gh`, `npx vitest`,
`npm run build`).

**Why:** two separate reasons, both worth stating plainly.

1. **Fix work on the CLI repository is a separate clock** by the programme's own rule
   ("two clocks, two commit histories"), as with the 22 September entry above.
2. **niha could not have been asked in any case.** The credential expired mid-session and
   every model-backed call returns `Not authorized` (F-13, F-14). The governance hook
   confirms it on each commit: `niha: governance check skipped (commit allowed) — Not
   authorized to evaluate rules`. The re-login is a device-code flow awaiting a human.

**Worth recording:** F-15 was found *because* of this switch, not in spite of it. I went
looking for why parkmitra had no CI runs, found `.github/workflows/niha-governance.yml`
uncommitted, and read it properly before pushing it. Had the file been committed
unexamined on the day it was generated, the finding would have surfaced as a confusing red
check rather than as a diagnosis.

**Reversal condition:** product work returns to niha the moment the credential is valid.

---

## 2026-09-23 23:09 — the organisation's provider quota is exhausted; everything after this is by hand

**Task:** completing the owner surface, and running the remaining long sessions (B1, B2, B3).

**Switched to:** Claude Code and ordinary local tooling, for the remainder of the challenge.

**Why:** not a preference. Mid-session, every model call began returning a hard 400:

```
Provider error: BadRequestError: Error code: 400 —
'You have reached your specified API usage limits.
 You will regain access on 2026-10-01 at 00:00 UTC.'
```

The deadline is 2026-09-25 23:59 IST. Access returns **five days after it**. There is no
workaround available to me: this is an organisation-level limit, not a local setting.

**What it cost, stated once:**

- Session 3 stopped at 13 real turns of 42 planned. The owner surface has schema, an ADR, a
  query layer, tests and one endpoint, and no UI, no e2e, no accessibility pass, and **no
  authorisation on the endpoint that claims ownership of a spot** — the session died on the
  prompt that addressed exactly that. The branch says so and does not merge.
- **B1, B2 and B3 are unreachable.** B3 is the sharpest loss, because it was set up
  correctly on day one: session 1 was reserved and left untouched specifically so it could
  be resumed after a full day's gap. Resuming needs a model call.

**Worth recording rather than resenting:** this is the same class of outage as F-03, which
took the whole of 2026-09-22 and pushed phases 1-5 out of niha entirely. Two of the three
things that shaped what this build could contain were provider availability, not engineering.
The programme's own rule — *"an engineer who loses a day to a T1 has their scope reduced by a
day, not their score"* — is why both are logged here in full rather than absorbed quietly.

**It also produced the strongest finding of the build.** niha counted all 23 failed turns as
turns, and `niha export` reports the session as `Outcome: completed`
([#1038](https://github.com/niha-and-co/ai-platform/issues/1038)). My harness trusted
`turnCount` and reported healthy progress for two minutes while every single request was
being rejected. The first symptom was turns becoming suspiciously fast — nine seconds for
"build the owner dashboard screen".

**Reversal condition:** none available before the deadline.
