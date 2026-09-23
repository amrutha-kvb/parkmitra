# Session 1 — observations

**Session:** `259a8a57-dc3b-4623-a894-92fd08aeb008`
**Started:** 2026-09-23 14:58 IST · **Ended:** 15:06 IST · **7 minutes**
**Model:** claude-opus-4-6 · **Permission mode:** auto
**Turns sent:** 12 · **Turns that actually registered:** 6

Scenario observations (A1-A6). These are observations of the tool, not defects in it —
anything that rose to a defect is in `field/findings.md` instead.

---

## A1 — given the task from the brief alone, did it produce the right thing first time?

**Mostly, and it read the documents rather than inventing.** Given "read
`design/data-model.md` and `design/data-dictionary.md`, then create the migration", the
output tracked those documents closely: correct table set, correct column names, the
`_paise` suffix carried through, and `002_indexes.sql` correctly *omitted* the GiST index
with the comment "the exclusion constraint in 001 already creates it" — which is a
non-obvious detail stated only once, in a table, in the data model. It found it.

**But it also duplicated one.** `002_indexes.sql` creates
`CREATE UNIQUE INDEX idx_areas_slug ON areas (slug)` while the data dictionary declares
`slug text UNIQUE`, which already creates a unique index. So it caught the subtle
duplication (GiST) and introduced an obvious one (slug) in the same file.

## A2 — did it hold a constraint stated in the repository?

**No. First violation at turn 8 (`lib/money.ts`).**

`design/terminology.md` states the microcopy rule plainly: *"₹ with no decimals when paise
are zero: `₹40`, not `₹40.00`. Show paise only when non-zero."*

What was generated:

```ts
export function formatPaise(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  return `₹${rupees}.${String(remainder).padStart(2, "0")}`;   // always ₹80.00
}
```

Three deviations in one small function:
1. Always renders decimals — violates the stated rule
2. Renamed `paiseToDisplay` → `formatPaise`, though the name was given explicitly
3. Signature changed from ISO strings to `Date` objects, though the prompt said `startIso`

Worth being fair about what it got *right*: the integer-paise rule from ADR-003 held
perfectly. No float touched the money path, and the `_paise` suffix survived every turn.
So the architectural constraint held; the microcopy constraint did not. The difference
seems to be that ADR-003 was named in the prompt and the terminology file was not — it had
to go and find that one.

Fixed by hand; the corrected version is in the repo with the rule quoted in a comment so
the next turn cannot lose it again.

## A4 — asked for one specific change, did the scope stay inside it?

**Turn 5 — yes, cleanly.** "Add a single CHECK constraint … Change nothing else" produced
exactly `003_bookings_amount_paise_check.sql` and touched nothing else.

**Elsewhere — no.** `.github/workflows/niha-governance.yml` appeared without being
requested at any point in the session. It is not harmful, and it may be the tool's own
governance scaffolding rather than a response to a prompt, but it is an unrequested file
in a repository where every file is meant to be a deliberate decision. Reviewed before
being kept.

## A6 — used for a non-code task

Not exercised in this session — every turn was code. Phase 1 discovery *was* the non-code
task and the tool was unavailable for all of it (F-03), which is why A6 has no
observation and the field report says so rather than inventing one.

## B5 — latency across the session

Real work took 20-114 seconds per turn, rising with the size of the output. The longest
turn (114s) was the availability route, the most complex single thing asked for. No turn
was pathologically slow, and there were **no pauses over 60 seconds** (B6: none) and **no
crashes** (B7: none).

## B8 — cost

`/cost` was requested at session end; the reading is in `transcript.txt`.

---

## The harness fault, recorded so it is not mistaken for a tool defect

Six of twelve prompts never registered. In `summary.json` they are the turns taking
**exactly ~8.5 seconds** — my quiet-timeout, not a response.

The cause was in my driver, not in niha: it inferred "turn finished" from silence on the
pty, and the tail of turn N's repaint looked like turn N+1 completing. The two prompts then
concatenated into one input box, visible in the transcript as
`...areas/route.ts` running straight into `...availability/route.ts`.

Consequences: `001_init.sql` (the schema itself), `db/seed.sql` and `lib/availability.ts`
were never created, and are the first items in session 2.

The driver now waits on niha's own `meta.json` `turnCount` incrementing instead of
guessing from silence. **Not filed as a finding** — filing my own bug against the tool
would be exactly the kind of contradicted finding the programme deducts for.
