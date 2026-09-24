import type { PaymentProvider } from "./provider";
import { SimulatedProvider } from "./simulated";

/**
 * Module-level singleton. Created once per cold start, reused across
 * requests within the same serverless invocation — same lifetime as
 * the db pool in lib/db.ts.
 */
let cached: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const name = process.env.PAYMENT_PROVIDER ?? "simulated";

  switch (name) {
    case "simulated":
      cached = new SimulatedProvider();
      break;
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${name}". Supported: simulated.`,
      );
  }

  return cached;
}
