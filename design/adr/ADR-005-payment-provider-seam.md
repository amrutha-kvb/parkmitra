# ADR-005 — Payment provider seam: interface now, integration later

**Status:** accepted
**Date:** 2026-09-24
**Phase:** 6

## Context

Payment is simulated. The pay endpoint (`POST /api/bookings/{reference_code}/pay`) inserts
a `payments` row with `provider = 'simulated'` and moves the booking to `confirmed`. No
money moves, no gateway is called, and no card data enters the system. This is deliberate
and stated in the product (`plan/scope.md`, openapi.yaml, the UI itself).

The handover names real payment as part of ticket 1, paired with phone verification. The
threat model (T3) identifies the absence of payment as the reason booking denial-of-service
is mitigated but not closed — a free reservation costs the attacker nothing.

The owner surface (ticket 2) makes the question sharper: once a real operator lists a real
spot, a booking that moves no money is a promise the product cannot keep. The pay endpoint
already has the right shape — it accepts no amount from the client (ADR-003), it gates
confirmation on a status transition, and it records the payment in a dedicated table with a
`provider` column. What it lacks is a seam: the provider name is a string literal in a SQL
CTE, and replacing it means editing the route handler.

The decision is whether to integrate a real provider now, build the seam without a real
provider, or leave the code as it is.

## Decision

Build a **provider interface** in application code with a single method — `authorise` — and
ship it with exactly one implementation: `SimulatedProvider`, which does what the current
code does (return success immediately). The pay route calls the interface, not the
implementation.

The interface:

- Takes the booking's `reference_code` and `amount_paise`.
- Returns a result: success with a provider-assigned transaction reference, or failure with
  a reason.
- Never receives or returns card data — the real provider will use a redirect or SDK on the
  client side, and the server will receive a callback or a token, never a card number. This
  boundary is drawn now so no implementation can violate it.

The `payments` table already has `provider` and `status` columns. The seam writes the
provider's name and the transaction reference into those columns; the simulated
implementation writes `'simulated'` and a generated reference, exactly as today.

Selection of the active provider is by environment variable (`PAYMENT_PROVIDER`). When it
is absent or set to `simulated`, the simulated provider is used. This means the owner
surface, the test suite, and local development all work without a gateway account.

## Alternatives rejected

**Integrate Razorpay (or Stripe) now**
*Rejected:* Razorpay requires a merchant account with KYC, a webhook endpoint, signature
verification, and a client-side SDK integration. Stripe requires similar. Both require
secrets that the free tier does not have, and test-mode keys that would need to be
provisioned and rotated. The work is real — roughly a day for the happy path, more for
failure handling, refunds, and webhook idempotency. None of it can be tested end-to-end
without a merchant account, and the product has no operator yet. Building it before there
is an operator to onboard means building it twice: once speculatively, and once when the
real provider's constraints are known. ADR-003 already guarantees that the money model is
correct (integer paise, server-computed) and that both Razorpay and Stripe will accept it
unchanged, so nothing is lost by waiting.

**Do nothing — leave the hardcoded `'simulated'` string in the route handler**
*Rejected:* the current code works, but it has no seam. Adding a real provider later means
editing the pay route's SQL, its error handling, and its response mapping in place, with no
way to run the old path alongside the new one. The simulated provider cannot be selected in
tests once the real one is wired in, so the test suite would need a gateway account or a
mock that reimplements what the simulated provider already does. The cost of the seam is
one interface, one trivial implementation, and one environment variable — small enough that
"do it later" is not a saving, it is a debt.

**Mock the gateway at the HTTP level (e.g. MSW, nock)**
*Rejected:* HTTP-level mocks test that the code sends the right HTTP request, not that the
payment logic is correct. They are the right tool for verifying a *specific* provider
integration; they are not a substitute for an application-level seam. With the seam in
place, the simulated provider *is* the mock — it runs in-process, has no network
dependency, and is the same code in production (when no real provider is configured) and in
tests.

**Feature flag instead of an environment variable**
*Rejected:* there is no feature-flag infrastructure in parkmitra, and adding one for a
single binary choice is overhead. An environment variable is the project's convention for
configuration (ARCH-003, `DATABASE_URL`), and `PAYMENT_PROVIDER` fits the same pattern.

## Consequences

**Good**
- The pay route becomes provider-agnostic. Integrating Razorpay or Stripe is a new file
  that implements the interface, not a rewrite of the route handler.
- Tests run against the simulated provider with no external dependency, no mock server, and
  no test-mode API keys.
- The owner surface can ship with simulated payment and be upgraded to real payment without
  changing any owner-facing code.
- Card data never enters the server — the interface enforces this structurally by not
  accepting it, rather than relying on a validation that could be removed.

**Bad / accepted**
- **No money moves.** A booking confirmed via the simulated provider is a lie, and the
  product must say so. The UI already does; the owner surface must do the same. This is
  honest and temporary — it is the price of shipping the owner surface before ticket 1.
- **The interface is designed before any real provider is integrated.** It may need to
  change when Razorpay's actual flow is wired in — their Orders API, for instance, requires
  a server-created order before the client opens the checkout, which is a two-step flow the
  current single `authorise` call does not model. Accepted: the interface is deliberately
  minimal (one method, two fields in, two fields out) so that extending it is cheaper than
  predicting it.
- **An attacker can still reserve every bay for free.** The simulated provider does not
  make spam cost anything. This is the same residual risk as today (threat model T3) and is
  closed only when a real provider replaces it. The seam does not fix T3; it makes fixing
  T3 a configuration change rather than a code change.
