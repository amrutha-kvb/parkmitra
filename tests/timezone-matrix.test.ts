/**
 * Timezone matrix for date-handling code.
 *
 * The one bug that reached a user was a timezone shift invisible to every
 * test because they all ran in IST (handover.md, "also worth doing").
 *
 * This file runs isWithinOpeningHours and billableHours under three
 * timezones: IST (+05:30), UTC (+00:00), and US Pacific (-07:00/-08:00).
 * The bug class it catches: using getUTCDate() when the code means "the
 * local date in the booking's timezone." In IST, a 01:00 IST booking is
 * still the same calendar day in UTC (19:30 UTC the day before). In
 * US Pacific, a 22:00 IST booking is 09:30 PDT the same day — no shift.
 * But a 01:00 IST booking seen from UTC is the previous calendar day,
 * and the boundary-date construction picks the wrong day.
 *
 * The test that would have caught the original bug: a booking at
 * 2026-10-01T01:00:00+05:30 (which is 2026-09-30T19:30:00Z). In IST,
 * the date part is October 1. In UTC, getUTCDate() returns September 30.
 * If the boundary is built from the UTC date, it constructs
 * "2026-09-30T07:00:00+05:30" instead of "2026-10-01T07:00:00+05:30"
 * — off by a full day, and the check wrongly rejects the booking.
 */
import { describe, it, expect } from "vitest";
import { isWithinOpeningHours } from "../app/api/bookings/route";
import { billableHours, computeAmountPaise } from "../lib/money";

const TIMEZONES = ["Asia/Kolkata", "UTC", "America/Los_Angeles"] as const;

for (const tz of TIMEZONES) {
  describe(`TZ=${tz}`, () => {
    const origTZ = process.env.TZ;

    // Set TZ before each test in this block, restore after.
    // Node reads TZ at process start for some APIs, but Date parsing
    // and toLocale* methods do respect runtime TZ changes.
    function withTZ(fn: () => void) {
      return () => {
        process.env.TZ = tz;
        try {
          fn();
        } finally {
          if (origTZ === undefined) delete process.env.TZ;
          else process.env.TZ = origTZ;
        }
      };
    }

    // ── isWithinOpeningHours ────────────────────────────────────────

    describe("isWithinOpeningHours", () => {
      const OPENS = "07:00:00";
      const CLOSES = "23:00:00";

      it(
        "a normal daytime booking is within hours",
        withTZ(() => {
          expect(
            isWithinOpeningHours(
              "2026-10-01T10:00:00+05:30",
              "2026-10-01T12:00:00+05:30",
              OPENS,
              CLOSES,
            ),
          ).toBe(true);
        }),
      );

      it(
        "booking starting exactly at opens_at is within hours",
        withTZ(() => {
          expect(
            isWithinOpeningHours(
              "2026-10-01T07:00:00+05:30",
              "2026-10-01T09:00:00+05:30",
              OPENS,
              CLOSES,
            ),
          ).toBe(true);
        }),
      );

      it(
        "booking ending exactly at closes_at is within hours (half-open)",
        withTZ(() => {
          expect(
            isWithinOpeningHours(
              "2026-10-01T21:00:00+05:30",
              "2026-10-01T23:00:00+05:30",
              OPENS,
              CLOSES,
            ),
          ).toBe(true);
        }),
      );

      it(
        "booking starting before opens_at is outside hours",
        withTZ(() => {
          expect(
            isWithinOpeningHours(
              "2026-10-01T06:59:00+05:30",
              "2026-10-01T09:00:00+05:30",
              OPENS,
              CLOSES,
            ),
          ).toBe(false);
        }),
      );

      it(
        "booking ending after closes_at is outside hours",
        withTZ(() => {
          expect(
            isWithinOpeningHours(
              "2026-10-01T21:00:00+05:30",
              "2026-10-01T23:01:00+05:30",
              OPENS,
              CLOSES,
            ),
          ).toBe(false);
        }),
      );

      // THE BUG-CATCHING TEST: a booking in the early hours of IST,
      // where the UTC date is the previous calendar day.
      it(
        "early-morning IST booking (01:00+05:30 = previous day in UTC) is within hours of a 00:00-open spot",
        withTZ(() => {
          expect(
            isWithinOpeningHours(
              "2026-10-01T01:00:00+05:30",
              "2026-10-01T03:00:00+05:30",
              "00:00:00",
              "23:59:00",
            ),
          ).toBe(true);
        }),
      );

      it(
        "late-night IST booking (23:00+05:30 = 17:30 UTC) near closing",
        withTZ(() => {
          expect(
            isWithinOpeningHours(
              "2026-10-01T22:00:00+05:30",
              "2026-10-01T23:00:00+05:30",
              OPENS,
              CLOSES,
            ),
          ).toBe(true);
        }),
      );

      it(
        "booking with Z offset at a time that crosses day boundary in IST",
        withTZ(() => {
          // 2026-09-30T19:30:00Z = 2026-10-01T01:00:00+05:30
          // Spot opens 00:00, closes 23:59
          expect(
            isWithinOpeningHours(
              "2026-09-30T19:30:00Z",
              "2026-09-30T21:30:00Z",
              "00:00:00",
              "23:59:00",
            ),
          ).toBe(true);
        }),
      );
    });

    // ── billableHours ──────────────────────────────────────────────

    describe("billableHours", () => {
      it(
        "1 hour for exactly 60 minutes",
        withTZ(() => {
          expect(
            billableHours(
              "2026-09-24T10:00:00+05:30",
              "2026-09-24T11:00:00+05:30",
            ),
          ).toBe(1);
        }),
      );

      it(
        "2 hours for 90 minutes (rounds up)",
        withTZ(() => {
          expect(
            billableHours(
              "2026-09-24T10:00:00+05:30",
              "2026-09-24T11:30:00+05:30",
            ),
          ).toBe(2);
        }),
      );

      it(
        "same result regardless of offset representation",
        withTZ(() => {
          const a = billableHours(
            "2026-09-24T10:00:00+05:30",
            "2026-09-24T12:00:00+05:30",
          );
          const b = billableHours(
            "2026-09-24T04:30:00Z",
            "2026-09-24T06:30:00Z",
          );
          expect(a).toBe(b);
        }),
      );
    });

    // ── computeAmountPaise ─────────────────────────────────────────

    describe("computeAmountPaise", () => {
      it(
        "computes the same amount regardless of TZ",
        withTZ(() => {
          expect(
            computeAmountPaise(
              4000,
              "2026-09-24T10:00:00+05:30",
              "2026-09-24T11:30:00+05:30",
            ),
          ).toBe(8000);
        }),
      );
    });
  });
}
