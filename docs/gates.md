# Gate evidence

The seven gates, and the artifact that evidences each. A gate with no artifact behind it is a
claim, so every row below points at something a reader can open and check, and says what in
it constitutes the evidence.

---

## Gate 1 — *The charter exists and it names what this is not*

**[`discovery/charter.md`](../discovery/charter.md)**

The charter has an explicit non-goals section. The test is not that a charter exists — it is
that it forecloses something, because a charter that only says yes has decided nothing. This
one rules out enforcement, supply-side onboarding, real payments and multi-day parking, each
with a reason.

## Gate 2 — *Spike result plus a signed scope cut. Nothing proceeds past this one*

**[`discovery/spike-result.md`](../discovery/spike-result.md)** · **[`plan/scope.md`](../plan/scope.md)**

The spike proved the exclusion constraint before anything was designed around it. That
ordering is the point: had it failed, the architecture would have changed on day one rather
than mid-build.

`plan/scope.md` carries the cut and what it costs.

## Gate 3 — *The contract validates, the ERD exists, the ADRs are merged*

**[`design/openapi.yaml`](../design/openapi.yaml)** · **[`design/data-model.md`](../design/data-model.md)** · **[`design/adr/`](../design/adr/)**

```console
$ npx @redocly/cli lint design/openapi.yaml
Woohoo! Your API description is valid. 🎉
You have 2 warnings.
```

Two warnings, both `operation-4xx-response` on `/areas` and `/health` — neither takes input
or has authorisation, so neither has a 4xx to return. Not suppressed; a silenced warning is
one nobody re-examines.

Four ADRs, each naming the alternatives rejected and why. ADR-004 was written during the
owner-surface session and lives on `feat/owner-surface`.

## Gate 4 — *Every screen in the first release has a mockup, including all four states*

**[`design/mockups/index.html`](../design/mockups/index.html)** · **[`design/states.md`](../design/states.md)**

`states.md` is the register: for every screen × every state, either how it is reached and
what the user sees, or **why it cannot occur**. Fourteen "cannot occur" claims are written
down rather than assumed, each one challengeable.

That is a deliberate reading of this gate. Mocking an empty state for a screen that always
has exactly one record is not thoroughness, it is dead design that hides the real gaps. The
audit that produced it found S1's empty state missing from the mockups *and* the code.

## Gate 5 — *Design and backlog reviewed. The backlog is the plan of record from here*

**[`plan/backlog.json`](../plan/backlog.json)** · **[`plan/plan.md`](../plan/plan.md)** · **[`plan/sequence.md`](../plan/sequence.md)**

Every story carries acceptance criteria. `sequence.md` holds the slice dependency graph;
`dependencies.md` holds the external ones and what breaks if each disappears.

## Exit condition — *The primary flow runs end to end with no mocks anywhere in the path*

**[`e2e/flow.spec.ts`](../e2e/flow.spec.ts)** · verified in [`field/run-log.md`](../field/run-log.md)

Ten Playwright specs against a real database, including a full booking. Verified by grep that
no mock, stub, fake, TODO or hardcoded datum sits in `app/` or `lib/` outside tests.

Payment is simulated — a scope decision rather than a mock, disclosed on the product itself.

## Phase 8 — *Demo script, then a ten-minute live demonstration*

**[`docs/demo-script.md`](demo-script.md)**

A minute-by-minute script for the live demo, from the hosted instance, product before any
slides. Includes what to say when something breaks on stage — and notes that a 409 mid-demo
is the best thing that can happen, because it is the exclusion constraint working in front of
an audience.

## Gate 6 — *The fresh clone works*

**[`field/run-log.md`](../field/run-log.md)**, "Gate 6 — the fresh clone, timed"

**24 seconds from `git clone` to a serving product**, re-timed against `main` on 2026-09-24
because a gate evidences a state rather than a past state. All ten e2e specs pass against
that clean checkout.

Two bugs were found by doing this rather than assuming it: `.env.example` had been silently
excluded from the repository, and the test suite only passed because of an exported shell
variable.

## Gate 7 — *A rollback has been executed on the live deployment and the alert has fired, both on purpose*

**[`field/run-log.md`](../field/run-log.md)** · **[`docs/runbook.md`](runbook.md)**

Rollback executed against production: **7 seconds back, 6 seconds forward**, verified by
`/api/health` disappearing and returning rather than by trusting the CLI's success message.

The alert fired for real and opened a GitHub issue. Its first version printed `ALERT:` and
exited 1 while creating nothing — the label did not exist and the error went to `/dev/null`.
Caught by checking whether the issue existed, which is the only reason this row is true.

---

## What is not evidenced

**The long-session protocol.** B1, B2 and B3 are unmet and unreachable: the organisation's
provider quota was exhausted on 2026-09-23 and returns 2026-10-01, five days after the
deadline. [`field/sessions/README.md`](../field/sessions/README.md) records what the protocol
did produce — latency across a long session, pauses, crashes, cost per session — and states
plainly what it did not.
