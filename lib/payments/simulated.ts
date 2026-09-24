import { randomBytes } from "crypto";
import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
} from "./provider";

/**
 * In-process simulated payment provider (ADR-005).
 *
 * Behaviour matches the current pay route exactly: every authorisation
 * succeeds immediately, no money moves, and the provider name written to
 * the `payments` table is `"simulated"`.
 *
 * Idempotency is enforced in-memory: a second `authorise` call with the
 * same `reference_code` returns the original `provider_reference` without
 * generating a new one. The map lives for the lifetime of the process,
 * which is sufficient for a serverless function handling one request at a
 * time. A real provider persists idempotency on its own infrastructure;
 * this implementation mirrors that contract within a single execution
 * context.
 */
export class SimulatedProvider implements PaymentProvider {
  readonly name = "simulated" as const;

  /**
   * Maps reference_code → the in-flight or settled promise for that code.
   *
   * Using a promise (not a bare string) as the map value closes the race
   * where two concurrent callers both pass the `get` check before either
   * reaches `set`. The first caller stores its promise immediately; the
   * second caller finds it and awaits the same result. Only one reference
   * is ever generated per code, regardless of how many calls overlap.
   */
  private readonly inflight = new Map<string, Promise<PaymentResult>>();

  authorise(request: PaymentRequest): Promise<PaymentResult> {
    const existing = this.inflight.get(request.reference_code);
    if (existing !== undefined) return existing;

    const promise = this.capture(request.reference_code);
    this.inflight.set(request.reference_code, promise);
    return promise;
  }

  private async capture(referenceCode: string): Promise<PaymentResult> {
    // Simulate a gateway round-trip so concurrent callers actually
    // overlap rather than running sequentially within one microtask.
    await Promise.resolve();

    const provider_reference = `sim_${randomBytes(12).toString("hex")}`;
    return { status: "paid", provider_reference };
  }
}
