/**
 * Payment provider interface (ADR-005).
 *
 * The pay route calls this interface, never a concrete provider. The active
 * implementation is selected by the PAYMENT_PROVIDER environment variable;
 * when absent or "simulated", {@link SimulatedProvider} (separate file) is
 * used.
 *
 * Money is integer paise throughout — no rupees, no floats (ADR-003).
 * Card data never enters this interface. A real provider uses a client-side
 * redirect or SDK; the server receives a token or callback, never a PAN.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * What the pay route knows about the booking it is trying to pay.
 *
 * `reference_code` is the booking's external identifier (ADR-002) and serves
 * as the **idempotency key** for the provider call. A provider that receives
 * the same reference_code twice MUST return the result of the first call, not
 * charge a second time. See {@link PaymentProvider.authorise} for the full
 * idempotency contract.
 */
export interface PaymentRequest {
  /** Booking reference code (Crockford base32, 10 chars). Also the idempotency key. */
  reference_code: string;

  /** Authoritative amount computed by the server (ADR-003). Integer paise. */
  amount_paise: number;
}

/**
 * Discriminated union returned by {@link PaymentProvider.authorise}.
 *
 * `status` is the discriminant:
 *
 * - `"paid"` — money was (or already had been) captured. The pay route may
 *   confirm the booking.
 * - `"failed"` — the charge was declined or the provider rejected it. The
 *   booking stays `pending`; the driver may retry.
 *
 * There is deliberately no `"pending"` / `"requires_action"` status. The
 * current flow is synchronous: the driver clicks "pay", the server calls
 * the provider, the server responds. Asynchronous flows (3-D Secure,
 * UPI intent, bank redirect) will need a webhook callback and a status
 * that the pay route does not resolve in-band. When that flow is built,
 * add the status here rather than overloading `"failed"`.
 */
export type PaymentResult = PaymentSuccess | PaymentFailure;

export interface PaymentSuccess {
  status: "paid";

  /**
   * Provider-assigned identifier for this transaction (e.g. Razorpay
   * payment id, Stripe PaymentIntent id). Stored in the `payments` table
   * for reconciliation. The simulated provider generates a random value.
   */
  provider_reference: string;
}

export interface PaymentFailure {
  status: "failed";

  /**
   * Machine-readable reason. Not shown to the driver — the pay route maps
   * it to a user-safe message. Values are provider-specific; the interface
   * does not enumerate them so implementations are not forced into a
   * lowest-common-denominator vocabulary.
   */
  reason: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * A payment provider that can authorise a charge for a booking.
 *
 * ### Idempotency
 *
 * `reference_code` is the idempotency key. A correct implementation MUST
 * satisfy:
 *
 * 1. If `authorise` is called twice with the same `reference_code`, the
 *    second call returns `{ status: "paid" }` with the same
 *    `provider_reference` as the first, without capturing a second charge.
 *
 * 2. Idempotency holds across process restarts — the provider persists the
 *    mapping on its side (Razorpay and Stripe both do this natively when
 *    the idempotency key is sent in the request header).
 *
 * 3. If the first call failed, a retry with the same key MAY produce a
 *    different result. Idempotency protects against double-charge on
 *    success, not against re-attempts after failure.
 *
 * The pay route already guards against double-confirmation at the database
 * level (SELECT … FOR UPDATE, status check). Provider-side idempotency is
 * a second layer: it prevents the narrower but costlier failure where the
 * DB transaction commits, the response is lost in transit, the driver
 * retries, and the provider charges again before the route's status check
 * can see `confirmed`.
 *
 * ### Partial failure
 *
 * When `authorise` returns `{ status: "paid" }`, the pay route will — in
 * the same database transaction — insert a `payments` row and set the
 * booking to `confirmed`. If that transaction fails (Postgres down, unique
 * violation, connection drop), the booking stays `pending` but the provider
 * has already captured the money.
 *
 * This is the classic "money taken, record not written" partial failure.
 * It is not resolved by this interface. The correct resolution is a
 * reconciliation sweep that lists recent provider charges and matches them
 * to `payments` rows, confirming any booking whose charge succeeded but
 * whose DB write did not. That sweep is out of scope until a real provider
 * is integrated, because the simulated provider captures nothing.
 *
 * An implementation MUST NOT attempt to roll back the charge inside
 * `authorise` on a subsequent failure — that conflates authorisation with
 * reconciliation, and a rollback that itself fails leaves the system in an
 * unrecoverable state. Fail forward; reconcile asynchronously.
 *
 * ### Refunds
 *
 * This interface does not model refunds. Refund policy is undefined
 * (handover.md, "also worth doing"), and the cancellation flow does not
 * involve money today. When refunds are needed, add a `refund` method to
 * this interface rather than overloading `authorise` — a refund is a
 * distinct operation with its own idempotency key (the original
 * `provider_reference`), its own partial-failure mode, and its own
 * provider API.
 */
export interface PaymentProvider {
  /**
   * Human-readable name stored in the `payments.provider` column.
   * e.g. `"simulated"`, `"razorpay"`, `"stripe"`.
   */
  readonly name: string;

  /**
   * Attempt to capture `request.amount_paise` for the booking identified by
   * `request.reference_code`.
   *
   * Must be idempotent on `reference_code` when the first call succeeded.
   * See the interface-level doc for the full contract.
   *
   * @throws only on transient infrastructure errors (network timeout, DNS
   *   failure). A declined card or insufficient balance is a `"failed"`
   *   result, not an exception — the pay route must distinguish "try again
   *   later" (throw) from "this will never work" (failed result).
   */
  authorise(request: PaymentRequest): Promise<PaymentResult>;
}
