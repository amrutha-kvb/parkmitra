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
