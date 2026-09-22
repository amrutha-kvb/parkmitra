# Stakeholder map

Who decides, who is affected, who must be told. Kept short deliberately — the programme
lists the stakeholder map as the first thing to cut if the process has to be lightened,
so this covers the decisions that actually exist rather than inventing a governance
structure for a solo ten-day build.

## Who decides

| Decision | Decider | Notes |
|---|---|---|
| Scope, stack, what ships | Amrutha Korumilli | Solo build. No approval needed from anyone; the project is hers and uses no employer IP. |
| Whether a finding is valid, and whether a CLI fix merges | the niha CLI owner | Outside this project's control. Two fix PRs are open and awaiting their review. |
| Whether the challenge submission is accepted | challenge judges | Two judges per criterion, per the published process. |
| Whether a real spot may be listed | the building's owner or manager | Not exercised in v1 — supply is seeded with fictional spots. See "affected" below. |

## Who is affected

**Drivers using the product.** The primary and secondary personas. Affected directly and
immediately: a bad booking means a wasted trip.

**Buildings whose capacity would be listed.** Affected in the full product, *not* in v1.
This matters and is called out deliberately: **no real building is named, contacted, or
listed in this release.** All seeded spots are fictional, with invented names, and the
README says so. Listing a real gym or apartment complex without its owner's consent would
be both wrong and a liability, and a demo is not consent.

**Residents of lanes near a listed spot.** Second-order and easy to miss. A product that
successfully routes more cars into a residential pocket changes that street for people who
never opted in. Noted now so it is a known consequence rather than a surprise; it is one
reason the full product would need supply-side agreements rather than open listing.

**Other challenge participants.** Affected by F-03, the provider outage — it blocks the
whole cohort, not just this project. That is why it was filed publicly and flagged rather
than handled quietly.

## Who must be told

| Who | What | When |
|---|---|---|
| Challenge organisers / channel | T1 blockers as they happen | Done — F-03 escalated 2026-09-22, same day |
| niha CLI owner | Findings and fix PRs | Done — issues #1015, #1016, #1018, #1020; PRs #1019, #1021 |
| Judges | Scope cut, and honestly, the reduced scope caused by the outage | At Gate 2 and in the field report |
| Anyone reading the repo | That the spots are fictional and no real building endorsed this | README, before anything else |

## Explicitly not stakeholders

**tech.at.core as an employer.** The project is personal, built on a personal GitHub
account, using no client or employer data. The challenge is run by the organisation, but
the product is not its property and no approval was required.

**Any real Hyderabad business.** No real venue is named in the product or its seed data —
see above.
