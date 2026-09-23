# Handover

For whoever picks parkmitra up next. It assumes you have read the [README](../README.md)
and can run the thing; if you cannot, that is a bug in the README and worth fixing first.

## Where things are

| | |
|---|---|
| Live | https://parkmitra-nu.vercel.app |
| Health | `/api/health` — checks the constraint, not just the process |
| Operations | [`docs/runbook.md`](runbook.md) |
| Why it is built this way | [`design/adr/`](../design/adr/) — read ADR-001 first |
| Known security gaps | [`field/security-review.md`](../field/security-review.md) |
| What I would change | [`docs/retrospective.md`](retrospective.md) |
| Measured performance | [`docs/performance.md`](performance.md) |

## The one thing to understand before changing anything

**No-double-booking is enforced by the database, not by the code** (ADR-001):

```sql
EXCLUDE USING gist (bay_id WITH =, window_at WITH &&) WHERE (status <> 'cancelled')
```

If you are ever tempted to check availability in TypeScript and then insert, don't. That
reads correctly and fails under concurrency, which is the only condition that matters.
`tests/concurrency.test.ts` guards this; if you change the schema, make sure that test still
fails when you drop the constraint.

Windows are half-open `[start, end)`, so a booking may begin exactly when the previous one
ends. Money is integer paise everywhere (ADR-003) and is **never** accepted from the client.

---

## The next three tickets

In priority order. Each is scoped to be finishable, with the acceptance criterion that
matters stated rather than implied.

### 1. Real payment and phone verification — L, product

Payment is simulated and there are no accounts, so nothing makes a booking cost anything. A
script can reserve every bay (threat model T3). These two are one ticket because either
alone leaves the hole open: OTP without payment still allows free reservations, and payment
without verification has no one to charge.

ADR-002 names this as the first thing to add, and the capability model was designed so it
can be: the reference code stays the authorisation, and a verified phone becomes a second
way to reach it.

**Done when:** a booking is only confirmed after a real payment authorisation, the OTP path
has its failure cases implemented (wrong code, expired, resend), and no endpoint lets a
phone number enumerate bookings — that would reintroduce exactly what ADR-002 avoids.

### 2. Real supply — L, product and non-technical

Every spot is invented. The booking engine, pricing and the guarantee are real; the supply
is not, because listing a real business without its consent isn't ours to do.

This is mostly not an engineering ticket. It needs one apartment complex or one mall
operator to agree. The engineering part is small: an owner-facing way to list a spot, set
bay counts and pricing, and see bookings — none of which exists, since every spot today is
seeded SQL.

**Done when:** one real operator has listed one real spot through an interface they used
themselves, and one real driver has parked in it.

---

### 3. Move the deployment to the region its users are in — S, performance

Requests enter Vercel's Mumbai edge and are then executed in Washington DC
(`x-vercel-id: bom1::iad1::…`), so roughly 230-250 ms of every response is geography. All
three measured endpoints cluster at the same p50 despite doing very different amounts of
work, which is the signature of time spent travelling rather than computing. See
[`docs/performance.md`](performance.md).

Set the Vercel function region to `bom1` and create the Neon database in `ap-south-1`.
**Both, or neither** — moving compute to Mumbai while the database stays in Virginia
replaces one user-to-server crossing with several server-to-database crossings per request,
and would be worse than doing nothing.

**Done when:** `x-vercel-id` shows a South Asian execution region, the database is in
`ap-south-1`, and the measurements in `docs/performance.md` have been retaken and show the
improvement rather than being assumed to.

---

## Also worth doing, smaller

- **Test in a non-IST timezone.** The one bug that reached a user was a timezone shift that
  the whole suite missed, because every test ran where the code did. A CI matrix entry with `TZ` set
  elsewhere would have caught it.
- **Assign a deputy owner.** The runbook has one name against it, which means the service is
  unowned the first week that person is unavailable.
- **Cancellation and refund policy.** Cancellation works; what happens to the money is
  undefined, and will stop being theoretical the moment payment is real.
- **Restore linting when typescript-eslint supports TypeScript 7.** There is currently no
  linter on this project at all. Next 16 removed `next lint`, and ESLint cannot parse the
  TypeScript here — `typescript-eslint does not support TS 7.0`. Neither available
  workaround was taken: downgrading TypeScript to satisfy a linter, or forcing an unmet peer
  dependency that would then break `npm ci` on a fresh clone. `npm run typecheck` runs in CI
  and is stricter about types, but nothing is checking the react-hooks or Next-specific rules.
- **Schedule `scripts/rate-limit-sweep.sh` somewhere real.** It is documented in the
  runbook as a crontab line, which means it runs on whichever laptop someone remembered to
  set it up on. A Vercel cron or a GitHub Actions schedule would be honest; a crontab on a
  developer machine is not infrastructure.
- **Watch `npm run verify` on a fresh clone** whenever setup changes. Two separate bugs got
  in by being invisible on a machine that already worked.

## What not to do

- **Don't add a "find my bookings by phone" endpoint.** It is the most obvious feature
  request here and it is the enumeration hole the whole capability model exists to avoid
  (ADR-002). If lost codes become a real problem, solve it with verified phone + payment
  (ticket 1), not with a lookup.
- **Don't relax the exclusion constraint to fix a conflict.** If a booking is wrongly
  blocked, the window or the bay is wrong, not the constraint.
- **Don't delete bookings.** Set `status = 'cancelled'`; the record is the audit trail.
