import { describe, it, expect, beforeEach } from "vitest";
import { SimulatedProvider } from "../../lib/payments/simulated";
import type { PaymentRequest } from "../../lib/payments/provider";

function req(overrides?: Partial<PaymentRequest>): PaymentRequest {
  return {
    reference_code: "7K2M9QX4TB",
    amount_paise: 8000,
    ...overrides,
  };
}

describe("SimulatedProvider", () => {
  let provider: SimulatedProvider;

  beforeEach(() => {
    provider = new SimulatedProvider();
  });

  // ── name ──────────────────────────────────────────────────────────────

  it("reports its name as 'simulated'", () => {
    expect(provider.name).toBe("simulated");
  });

  // ── happy path ────────────────────────────────────────────────────────

  it("always succeeds with status 'paid'", async () => {
    const result = await provider.authorise(req());
    expect(result.status).toBe("paid");
  });

  it("returns a provider_reference prefixed 'sim_'", async () => {
    const result = await provider.authorise(req());
    expect(result.status).toBe("paid");
    if (result.status === "paid") {
      expect(result.provider_reference).toMatch(/^sim_[0-9a-f]{24}$/);
    }
  });

  it("returns a unique provider_reference per distinct booking", async () => {
    const r1 = await provider.authorise(req({ reference_code: "AAAAAAAAAA" }));
    const r2 = await provider.authorise(req({ reference_code: "BBBBBBBBBB" }));
    expect(r1.status).toBe("paid");
    expect(r2.status).toBe("paid");
    if (r1.status === "paid" && r2.status === "paid") {
      expect(r1.provider_reference).not.toBe(r2.provider_reference);
    }
  });

  // ── idempotency (double-capture) ──────────────────────────────────────

  it("returns the same provider_reference on a second call with the same reference_code", async () => {
    const first = await provider.authorise(req());
    const second = await provider.authorise(req());
    expect(first).toEqual(second);
  });

  it("does not generate a new reference on the idempotent replay", async () => {
    const first = await provider.authorise(req());
    const second = await provider.authorise(req());
    expect(first.status).toBe("paid");
    expect(second.status).toBe("paid");
    if (first.status === "paid" && second.status === "paid") {
      expect(second.provider_reference).toBe(first.provider_reference);
    }
  });

  it("idempotency is scoped to the reference_code, not the amount", async () => {
    const first = await provider.authorise(req({ amount_paise: 4000 }));
    const replayed = await provider.authorise(req({ amount_paise: 9999 }));
    expect(first).toEqual(replayed);
  });

  it("triple call still returns the original result", async () => {
    const r1 = await provider.authorise(req());
    const r2 = await provider.authorise(req());
    const r3 = await provider.authorise(req());
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  // ── isolation between bookings ────────────────────────────────────────

  it("idempotency for one booking does not affect another", async () => {
    const a1 = await provider.authorise(req({ reference_code: "AAAAAAAAAA" }));
    const a2 = await provider.authorise(req({ reference_code: "AAAAAAAAAA" }));
    const b1 = await provider.authorise(req({ reference_code: "BBBBBBBBBB" }));

    expect(a1).toEqual(a2);
    expect(a1.status).toBe("paid");
    expect(b1.status).toBe("paid");
    if (a1.status === "paid" && b1.status === "paid") {
      expect(b1.provider_reference).not.toBe(a1.provider_reference);
    }
  });

  // ── never fails ───────────────────────────────────────────────────────

  it("never returns a failed result", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        provider.authorise(req({ reference_code: `CODE${String(i).padStart(6, "0")}` })),
      ),
    );
    for (const r of results) {
      expect(r.status).toBe("paid");
    }
  });

  // ── concurrent capture (proving idempotency, not asserting it) ───────

  it("10 simultaneous captures for the same booking produce exactly one provider_reference", async () => {
    const calls = Array.from({ length: 10 }, () => provider.authorise(req()));
    const results = await Promise.all(calls);

    const refs = new Set<string>();
    for (const r of results) {
      expect(r.status).toBe("paid");
      if (r.status === "paid") refs.add(r.provider_reference);
    }

    expect(refs.size).toBe(1);
  });

  // ── isolation between provider instances ──────────────────────────────

  it("separate instances do not share idempotency state", async () => {
    const other = new SimulatedProvider();
    const r1 = await provider.authorise(req());
    const r2 = await other.authorise(req());
    expect(r1.status).toBe("paid");
    expect(r2.status).toBe("paid");
    if (r1.status === "paid" && r2.status === "paid") {
      expect(r2.provider_reference).not.toBe(r1.provider_reference);
    }
  });
});
