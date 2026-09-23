# Effort accounting

Measured from the commit history and the session records, not estimated afterwards.
Two clocks are kept separate throughout, as the programme requires: **product** work on
`amrutha-kvb/parkmitra`, and **CLI** work on `niha-and-co/ai-platform`.

## Summary

| | |
|---|---|
| Elapsed | 22 Sep 18:21 → 23 Sep 19:45 IST (~25h wall clock) |
| Working time | ~13h product · ~4h CLI field work |
| Commits | 54 across all branches (25 on the 22nd, 29 on the 23rd) |
| Tracked files | 123 |
| Application + schema | 10,543 lines |
| Tests | 237 unit assertions across 13 files, plus 17 end-to-end specs |
| Lifecycle artifacts | 54 documents, 6,320 lines |

## By phase

| Phase | Commits (IST) | Working | What came out of it |
|---|---|---|---|
| 0 setup + first run | 22 Sep 18:21–19:12 | ~50m | `field/first-run.md`, F-01…F-04, tool switches declared |
| 1 discovery | 22 Sep 20:05–20:17 | ~1h10m | charter, problem, personas, metrics, landscape, stakeholders, assumptions |
| 2 spike + Gate 2 | 22 Sep 20:17–20:21 | ~35m | the no-double-booking spike, stack choice, signed scope cut |
| 3 design | 22 Sep 20:21–20:28 | ~1h | architecture, ADR-001…003, data model, dictionary, OpenAPI, NFRs, threat model |
| 4 UX | 22 Sep 20:28–20:36 | ~50m | flows with failure paths, wireframes, tokens, mockups, a11y plan, terminology |
| 5 plan | 23 Sep 15:01–15:05 | ~40m | epics, backlog with acceptance criteria, DoD, test strategy, risks, sequence |
| 6 build | 23 Sep 15:05–18:45 | ~4h30m | schema, seed, six screens, all API routes, the test suite, deploy, fresh-clone verify |
| 7 harden | 23 Sep 18:45–19:30 | ~1h15m | security review, a11y audit, health endpoint, alerting |
| 8 ship | 23 Sep 19:30–20:10 | ~1h15m | v1.0.0, changelog, retrospective, this document, handover, measured performance |
| 9 run | 23 Sep 18:58–19:04 | ~35m | runbook, rollback practised, alert fired for real |

**Read the two time columns separately.** The first is when that phase's commits landed;
the second is time actually spent. They differ because artifacts were written in a block and
committed in one batch per phase — phase 3's commit span is seven minutes, but the
architecture, three ADRs, data model, dictionary, OpenAPI contract, NFRs and threat model
behind it took about an hour. Commit timestamps are the honest record of *when work was
sealed*, not of how long it took, and presenting them as duration would overstate the pace.

Phases 1-5 are compressed because **22 September was largely lost**: the organisation was
out of provider credits and no model-backed niha call completed for roughly twenty hours
(F-03). The artifacts from those phases were written by hand in a single evening block. The
programme's own rule — *"an engineer who loses a day to a T1 has their scope reduced by a
day, not their score"* — is the reason this is recorded rather than smoothed over.

## 24 September — after the quota wall

The organisation's provider quota was exhausted at 23:09 on the 23rd, with access returning
2026-10-01. Everything below was written by hand, declared in `field/tool-switches.md`.

| Work | What came out of it |
|---|---|
| Rate limiting on every endpoint that needs it | Three endpoints had none, including the T3 surface. Per-scope buckets. **Test-first, with the failing commit visible** |
| Accessibility audit, clause by clause | `prefers-reduced-motion` was specified in the baseline and never built |
| Endpoint audit | `docs/endpoint-audit.md` — all 8 endpoints: inputs, validation, authorisation, throttling |
| Contract tests | `e2e/contract.spec.ts` — the contract was called binding and nothing enforced it |
| Gate evidence | `docs/gates.md`; Gate 6 re-timed at **24s** clone-to-serving |
| Four states | `design/states.md`; S1's empty state existed nowhere |
| Findings | F-15 through F-21 |

Roughly **6 hours**, all of it closing gaps between what the documents claimed and what the
code did. Five of the seven rows above are that same shape, which is worth noting given the
field report's thesis about niha: *documents and summaries that assert things the underlying
state does not support* was not only niha's problem on this build.

## Where the time actually went

Two things dominated, and neither was writing the product.

**Verification, ~3h.** Reading generated code rather than trusting a green suite, and
running things against the deployment rather than locally. Nearly every real defect in this
project was found this way, not by a test:

- the money format bug, *whose generated test asserted the bug*
- `./db.js` ESM specifiers — green tests, 500ing endpoint
- the `?spot=` / `?spot_id=` mismatch
- `.env.example` silently excluded from the repo
- the whole test suite passing only because of my exported shell variable
- `health-alert.sh` printing `ALERT` and exiting 1 while creating nothing

The pattern: **individual generated files were good; the seams between them were where it
broke**, and every seam failed silently.

**Tooling friction, ~2h15m.** Itemised in `field/report.md`. The provider outage, Guardian
blocking ordinary coding vocabulary (F-09), the credential expiring mid-session behind a
`whoami` that reported it valid (F-13, F-14).

## My own errors, counted

Recorded here because effort accounting that only counts productive time is not accounting.

| | Cost |
|---|---|
| A session harness that inferred turn completion from terminal silence, and dropped half the prompts | ~50m, abandoned entirely |
| `cmd \| head; echo $?` returning head's exit code — nearly filed a false finding | ~15m |
| zsh not word-splitting an unquoted variable — nearly filed two more | ~15m |
| Grepping `whoami` through a filter that hid the decisive line — **did** file a wrong finding, publicly withdrawn | ~25m + the correction |
| `git reset --hard` while niha was mid-write | ~10m, fully recovered |

About **1h55m lost to my own mistakes**, against ~2h15m lost to the tool. Three of the five
were measurement errors that would have produced false findings, and the fourth actually
did. That ratio is the strongest argument in this project for the programme's verbatim-output
rule.

## CLI field work, separately

| | |
|---|---|
| Findings filed | 11 (F-05…F-15), all reproducible with verbatim output |
| Findings investigated and discarded | 4, rather than banked toward the floor |
| Findings corrected after filing | 1 (F-13, partially withdrawn) |
| Fix PRs | 3 — [#1019](https://github.com/niha-and-co/ai-platform/pull/1019), [#1021](https://github.com/niha-and-co/ai-platform/pull/1021), [#1034](https://github.com/niha-and-co/ai-platform/pull/1034) |
| Time | ~4h |
