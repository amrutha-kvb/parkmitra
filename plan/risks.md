# Risk register

Owner is Amrutha Korumilli for every row — it is a solo build, and pretending otherwise
would make this a fiction. What varies is the mitigation and the trigger.

| # | Risk | Likelihood | Impact | Mitigation | Trigger to act |
|---|---|---|---|---|---|
| R1 | **The two CLI fix PRs are never merged** | Medium | High — criterion 6 caps at ~3/5; "merged" is the anchor's word | Raised early (both open since 22 Sep), kept small and obviously correct, each closing its issue. Chase once, politely. | Not merged by 25 Sep midday → accept the cap, state it in the field report rather than implying otherwise |
| R2 | **Demo videos never recorded** | Medium | High — a hard merge-bar item on both PRs *and* 5 points for the product demo | Cannot be done by the build; needs a person and a screen recorder. Scripts and exact commands prepared in advance so each takes minutes. | 24 Sep evening with no recording → cut to the single product demo and forfeit the PR video requirement |
| R3 | **The provider outage returns** | Low now, was certain yesterday | High — 30 points sit behind model access | Already survived once: phases 1-4 were completed without the tool, declared in `field/tool-switches.md`. Sessions are exported as they finish so evidence survives. | Any repeat → revert to the substitute tool, declare it, keep building |
| R4 | **Long-session protocol incomplete** | **High** | 10 points | B3 is the binding one and it only fits if a session starts on the 23rd and is resumed on the 25th. Session 1 started 14:58 on the 23rd and is registered in `field/sessions/README.md` specifically so it cannot be lost. | 25 Sep with no resume done → report the protocol as partial and say which parts, rather than claiming it |
| R5 | **Free-tier deploy fails or cold-starts badly on the day** | Medium | High — the product score depends on a judge opening a URL | Deploy during E1, not on the last day. Cold start is budgeted and surfaced in the UI rather than hidden. | Deploy not working by 24 Sep → fall back to a second host from the approved list |
| R6 | **`btree_gist` unavailable on the hosted Postgres** | Low | Severe — the booking guarantee is the product | Verified at deploy, not assumed. The spike ran on local Postgres 18; Neon documents the extension. | Unavailable → advisory-lock fallback, already designed in ADR-001's rejected-alternatives |
| R7 | **Scope creep from the tool** | Medium | Medium — time lost reviewing code nobody asked for | Every unrequested file is reviewed and removed or justified. One already appeared in session 1 (a GitHub workflow nobody asked for). This is also scenario A4, so it is evidence rather than only a nuisance. | Two or more unrequested artefacts in a session → tighten prompts, record as a finding |
| R8 | **Over-commitment: 24.5 estimated hours against ~2.5 days** | **High** | Medium — something will not land | Acknowledged in `plan/backlog.json` rather than hidden. Drop order is fixed in advance in `plan/sequence.md`. | Behind by more than one slice at 24 Sep midday → drop in the stated order, no renegotiation |
| R9 | **Fresh-clone test fails at Gate 6** | Medium | Severe — it caps the whole score | The README is written from a clean clone and followed literally, not from memory. Done on the 25th with time to fix, not at the deadline. | Any step fails → the README is wrong, and that is itself the finding |
| R10 | **A finding is contradicted on review** | Low | −10 each | Everything filed is reproduced before filing, with verbatim output. Four candidate findings were already discarded this build rather than banked, including two of my own measurement errors. | Owner disputes one → withdraw it immediately rather than argue |

## The two that actually decide the outcome

**R4 and R1.** Everything else is recoverable by working harder. Those two are not: one has
a calendar deadline that has already nearly passed, and the other needs a decision from
somebody who does not work for this project.

## Risks deliberately accepted, not mitigated

- **Supply-side trust (A1)** — v1 seeds fictional spots and says so. Unfixable in the time.
- **Booking spam** — no accounts and no real payment means nothing makes it cost anything
  (threat model T3). Named, not solved.
- **Self-reported arrival** — the north-star signal is weaker than a sensor. Accepted.
