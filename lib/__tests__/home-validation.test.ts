/**
 * Regression test for the timezone bug found by manual testing on 2026-09-23.
 *
 * toISO used d.toISOString().slice(0,16), which converts to UTC and then drops
 * the zone marker. In IST (UTC+5:30) a 6:00 pm selection travelled through the
 * URL as "12:30" and every booking silently moved five and a half hours. No
 * test caught it because every existing test already spoke in explicit offsets.
 */
import { describe, it, expect } from "vitest";
import { combineDateTime, toISO } from "../home-validation";

describe("toISO", () => {
  it("keeps the local wall-clock time the user actually picked", () => {
    const picked = combineDateTime("2026-09-25", "18:00");
    const iso = toISO(picked);
    // The hour in the string must be the hour on the clock, not the UTC hour.
    expect(iso).toMatch(/T18:00:00/);
  });

  it("carries an explicit UTC offset rather than a naive timestamp", () => {
    const iso = toISO(combineDateTime("2026-09-25", "18:00"));
    expect(iso).toMatch(/[+-]\d{2}:\d{2}$/);
  });

  it("round-trips back to the same instant", () => {
    const picked = combineDateTime("2026-09-25", "18:00");
    expect(new Date(toISO(picked)).getTime()).toBe(picked.getTime());
  });

  it("preserves midnight without rolling to the previous day", () => {
    const iso = toISO(combineDateTime("2026-09-25", "00:30"));
    expect(iso).toMatch(/^2026-09-25T00:30:00/);
  });
});
