/**
 * Money rules from ADR-003 and the microcopy rule in design/terminology.md.
 *
 * Note on history: the generated version of this file asserted
 * formatPaise(4000) === "₹40.00", which contradicts the stated rule "₹40, not
 * ₹40.00". The test agreed with the implementation rather than with the spec —
 * exactly the tautology plan/test-strategy.md warns about. Both were corrected
 * against the spec, not against each other.
 */
import { describe, it, expect } from "vitest";
import { paiseToDisplay, billableHours, computeAmountPaise } from "../money";

describe("paiseToDisplay", () => {
  it("omits decimals for a whole rupee amount", () => {
    expect(paiseToDisplay(4000)).toBe("₹40");
  });

  it("shows paise only when they are non-zero", () => {
    expect(paiseToDisplay(4050)).toBe("₹40.50");
  });

  it("pads a single-digit paise value", () => {
    expect(paiseToDisplay(4005)).toBe("₹40.05");
  });

  it("handles zero", () => {
    expect(paiseToDisplay(0)).toBe("₹0");
  });
});

describe("billableHours — whole hours, rounded up (ADR-003)", () => {
  it("bills 1 hour for exactly 60 minutes", () => {
    expect(billableHours("2026-09-24T10:00:00+05:30", "2026-09-24T11:00:00+05:30")).toBe(1);
  });

  it("bills 2 hours for 90 minutes", () => {
    expect(billableHours("2026-09-24T10:00:00+05:30", "2026-09-24T11:30:00+05:30")).toBe(2);
  });

  it("bills 2 hours for exactly 120 minutes, not 3", () => {
    expect(billableHours("2026-09-24T10:00:00+05:30", "2026-09-24T12:00:00+05:30")).toBe(2);
  });

  it("refuses a zero-length window", () => {
    expect(() => billableHours("2026-09-24T10:00:00+05:30", "2026-09-24T10:00:00+05:30")).toThrow();
  });

  it("refuses an end before the start", () => {
    expect(() => billableHours("2026-09-24T12:00:00+05:30", "2026-09-24T10:00:00+05:30")).toThrow();
  });
});

describe("computeAmountPaise", () => {
  it("multiplies the rounded-up hours by the hourly rate", () => {
    expect(computeAmountPaise(4000, "2026-09-24T10:00:00+05:30", "2026-09-24T11:30:00+05:30")).toBe(8000);
  });

  it("stays an integer — no float arithmetic in the money path", () => {
    const v = computeAmountPaise(3333, "2026-09-24T10:00:00+05:30", "2026-09-24T12:45:00+05:30");
    expect(Number.isInteger(v)).toBe(true);
  });
});
