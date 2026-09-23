# Field report — niha, Q3 2026 build challenge

**Engineer:** Amrutha Korumilli · **Product:** parkmitra · **Period:** 22-25 September 2026

---

## Summary

Eleven findings filed against `niha-and-co/ai-platform`, all reproducible, all with
verbatim output. Three fix PRs raised. Four further candidates were investigated and
**discarded rather than banked**, including two of my own measurement errors, and one filed
finding was **publicly corrected** when better evidence contradicted part of it.

The single most useful thing this build can tell you: on day one the tool was unusable for
about twenty hours because the organisation was out of provider credits, and on day two the
credential silently expired mid-session while `whoami` continued to report it valid for
another 28 days. Most of what follows flows from those two facts.

---

## The findings

| ID | Sev | Issue | What |
|---|---|---|---|
| F-05 | S3 | [#1015](https://github.com/niha-and-co/ai-platform/issues/1015) | Personal skills from `~/.claude/skills` are listed under a heading reading "Team skills" |
| F-06 | S2 | [#1016](https://github.com/niha-and-co/ai-platform/issues/1016) | `whoami --json` prints human text, so the worked example in its own `--help` fails |
| F-07 | S3 | [#1018](https://github.com/niha-and-co/ai-platform/issues/1018) | The documented zsh completions one-liner fails with `command not found: compdef` |
| F-08 | S2 | [#1020](https://github.com/niha-and-co/ai-platform/issues/1020) | `--json` documented but ignored on four list commands, which still exit 0 |
| F-09 | S2 | [#1027](https://github.com/niha-and-co/ai-platform/issues/1027) | **Guardian blocks any prompt containing `../` or SQL keywords as an injection attack** |
| F-10 | S2 | [#1028](https://github.com/niha-and-co/ai-platform/issues/1028) | `assess` fails with `Error: requires 'assess'` — names neither cause nor remedy |
| F-11 | S2 | [#1029](https://github.com/niha-and-co/ai-platform/issues/1029) | A failing check cannot be traced to a rule: `check` prints UUIDs, `rules list` prints short ids |
| F-12 | S3 | [#1030](https://github.com/niha-and-co/ai-platform/issues/1030) | `ceremony kaizen` prints a usage error and exits 0, unlike every comparable command |
| F-13 | S2 | [#1031](https://github.com/niha-and-co/ai-platform/issues/1031) | **The governance pre-commit hook fails open silently** — every commit passed unchecked |
| F-14 | S2 | [#1032](https://github.com/niha-and-co/ai-platform/issues/1032) | **`whoami` prints "Token: valid for 28d 23h" directly above "this credential is expired or revoked"** |
| F-15 | S2 | [#1033](https://github.com/niha-and-co/ai-platform/issues/1033) | **`ci agent init` pins the action to `@v1`, a ref that has never existed** — generated CI fails on every PR |

Fix PRs: [#1019](https://github.com/niha-and-co/ai-platform/pull/1019) (F-05),
[#1021](https://github.com/niha-and-co/ai-platform/pull/1021) (F-07) and
[#1034](https://github.com/niha-and-co/ai-platform/pull/1034) (F-15). Each carries
before-and-after output and a test that fails without the fix.

### The four that matter most

**F-09 — Guardian refuses ordinary coding vocabulary.** `../lib/db` in a prompt is blocked
as `path_traversal`; `DELETE FROM bookings` is blocked as `sql`. Both isolated against
controls differing only in those characters. For a tool whose job includes writing
TypeScript imports and migrations, this removes ordinary vocabulary from the conversation.
It blocked creation of `tests/concurrency.test.ts` — the test proving this product's central
guarantee — which I then had to write by hand. The control belongs on the operations the
agent performs, not on the characters in the user's sentence; the write-containment sandbox
and protected-paths list already do that job properly.

**F-13 — governance silently stops governing.** `niha hooks install` advertises "Runs niha
check --ci before every commit". When authorisation broke, it ran nothing: every commit
passed unchecked, secret scan included, with one grey line and exit 0. A team that
installed the hook deliberately would not notice for days. Failing open on a developer's
commit is defensible; doing it quietly is not.

**F-14 — the tool contradicts itself in one screen.** `whoami` computes "valid for 28d 23h"
from the JWT's own expiry and prints the server's rejection four lines below it, never
reconciling the two. This is the programme's own worked example in a different command. It
cost me more than time: I reported part of F-13 wrongly because of it, and had to withdraw
that publicly.

**F-15 — the generated CI cannot run.** `niha ci agent init` pins
`.github/actions/niha-ci@v1`. No such tag or branch has ever been published; every release
is tagged in full, `v1.0.0` through `v1.2.8`. GitHub cannot resolve it, so the workflow
fails at job setup before a single governance check runs — and the error names a missing
action version, so it reads like the user's mistake. This is F-13's shape again in a
different surface: **a governance product visibly not governing, while looking like it is.**
A red check that never checked anything is the failure mode this tool should be least
willing to ship. Fixed in #1034.

---

## The correction, and what it cost

I filed F-13 claiming the credential was valid and the "run `niha login`" advice was
therefore misleading. It was not. I had checked `whoami` through
`grep -E 'Email|Role|Token'` — **my own filter removed the line saying the credential had
been rejected.**

I withdrew that portion on the issue and in this report the same day, kept the part that
still stands, and filed the display problem separately as F-14.

Recording it because it is the sharpest argument for the programme's verbatim rule that
this build produced. The rule exists to stop people inventing findings. What it also
prevents is this: summarising real output, losing the decisive line, and reasoning
confidently from what is left. I did that with the tool's output in front of me.

---

## Scenario coverage, honestly

| | Covered | Not covered |
|---|---|---|
| **A** task understanding | A1, A2, A4 | A3, A5, A6 |
| **B** long sessions | B5, B6, B7, B8 partially | **B1, B2, B3 not met** |
| **C** recording discipline | C1, C2, C3, C5 | C4 (macOS only) |

**The long-session protocol was not completed, and I am not going to present it as if it
were.** It requires three sessions over two hours, one over four, and one resumed after a
full day's gap. The provider outage consumed 22 September entirely; credits returned around
14:30 on the 23rd, and the credential then expired mid-session that evening. What exists is
session 1 (`259a8a57`), registered in `field/sessions/` with per-turn latency and pause
measurements, and the export reporting 6 turns, 62 tool calls, $0.2629.

**A2 is the most interesting thing I did observe.** Asked to write `lib/money.ts`, the tool
held ADR-003's integer-paise rule perfectly across every turn — no float ever entered the
money path — while violating the microcopy rule in `design/terminology.md` ("₹40, not
₹40.00") at the first opportunity. The difference appears to be that ADR-003 was named in
the prompt and the terminology file had to be found. Architectural constraints held;
discovered constraints did not.

---

## Where the tool was genuinely good

A field report that only lists defects is not a field report.

- **`niha check` is the best thing here.** 20 rules, sub-2-second commits through the hook,
  and it independently flagged SEC-004 (SQL string concatenation) while I was working on
  exactly that area.
- **Permission denials are excellently written.** "this call needs confirmation and this is
  a non-interactive run… Add one to `.niha/settings.local.json`, or run it in the niha REPL.
  For a one-off, pass `--permission-mode auto`." Cause, fix, and a one-off workaround in one
  message. F-10 and F-13's errors should be held to this standard, because the product has
  already shown it can meet it.
- **It reads the repository properly.** Given "read `design/data-model.md`, then create the
  migration", it produced a schema matching the document, and correctly *omitted* the GiST
  index with the comment "the exclusion constraint already creates it" — a detail stated
  once, in a table.
- **Design instincts better than my prompt.** The pay endpoint derives `amount_paise` from a
  locked CTE rather than trusting a value read moments earlier. I did not ask for that; it
  is better than what I asked for.

## Where it cost me time

| | |
|---|---|
| Provider outage (22 Sep) | ~20 hours — the whole of day one for anything model-backed |
| Guardian false positives (F-09) | ~30 min, plus writing the concurrency test by hand |
| Credential expiry + F-14 | ~40 min, plus a wrong report and a public correction |
| `assess` / rules identity (F-10, F-11) | ~35 min |
| Chasing my own harness bugs | ~50 min (see below) |

---

## Tool switches

Declared in full in `field/tool-switches.md`, as R6 requires. Summary: phases 1-5 were
completed without niha because it was unavailable; from the 23rd the product code was
written through `niha ask`; the concurrency test and several fixes were written by hand
where Guardian blocked the request or where verification demanded it.

**What niha wrote, and what verification caught.** Most of `db/`, `lib/` and `app/api/` came
from the tool. Reading it caught seven real defects, and the pattern is worth naming:
individual files were good; **the seams between separately generated files were where it
broke** — a Postgres `bigint` arriving as a string and compared with `parseInt`, a link
sending `?spot=` to a page reading `?spot_id=`, a query taking one parameter called with
two. Every one failed silently.

**Two of my own errors, recorded so they are not mistaken for tool defects.** My first
session driver inferred turn completion from terminal silence and lost every other prompt.
My first alert script printed "ALERT" and exited 1 while creating nothing, because the label
did not exist and the error went to `/dev/null`. Neither was filed against niha.

---

## What I would tell the CLI owner

1. **Move Guardian's injection checks off the prompt text and onto the operations.** It is
   the one finding that changes what the tool can be used for.
2. **Make failure loud when governance stops governing — and notice how often it does.**
   F-13 and F-15 are the same defect wearing different clothes: the hook that checks
   nothing, and the CI job that cannot start. Both leave a user believing they are
   governed. Of eleven findings, the two I would fix first are these.
3. **Verify the refs you generate.** A generator that emits `@v1` is in a position to
   resolve `@v1` once, at generation time (F-15).
4. **Let the server's verdict win the summary line** (F-14). One contradiction in one screen
   produced a wrong bug report from someone actively trying to be careful.
5. **Hold every error to the standard of the permission-denied message.** That message is
   already in the product and it is very good.
