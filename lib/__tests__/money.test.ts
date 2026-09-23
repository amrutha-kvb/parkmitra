import { describe, expect, it } from "vitest";
import { formatPaise, billableHours, computeAmountPaise } from "../money";

describe("formatPaise", () => {
  it("formats a whole-rupee amount", () => {
    expect(formatPaise(4000)).toBe("₹40.00");
  });

  it("formats an amount with paise", () => {
    expect(formatPaise(4050)).toBe("₹40.50");
  });
});

describe("billableHours", () => {
  it("bills 2 hours for a 90-minute window", () => {
    const start = new Date("2026-10-01T10:00:00+05:30");
    const end = new Date("2026-10-01T11:30:00+05:30");
    expect(billableHours(start, end)).toBe(2);
  });

  it("bills 1 hour for a 60-minute window", () => {
    const start = new Date("2026-10-01T10:00:00+05:30");
    const end = new Date("2026-10-01T11:00:00+05:30");
    expect(billableHours(start, end)).toBe(1);
  });
});

describe("computeAmountPaise", () => {
  it("multiplies billable hours by the hourly rate", () => {
    const start = new Date("2026-10-01T10:00:00+05:30");
    const end = new Date("2026-10-01T11:30:00+05:30");
    // 90 min → 2 hours, at 4000 paise/hr → 8000 paise
    expect(computeAmountPaise(4000, start, end)).toBe(8000);
  });
});
