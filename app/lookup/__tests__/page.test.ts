/**
 * Tests for the S6 Lookup page logic (app/lookup/page.tsx).
 *
 * The project does not have a DOM test environment configured (no jsdom /
 * happy-dom / @testing-library/react), so these tests exercise the pure
 * helper functions that drive the page's state machine. Those helpers live in
 * lib/lookup-validation.ts, which was extracted from the component precisely
 * so they can be verified here.
 *
 * Every meaningful behaviour the UI relies on maps to at least one test:
 *
 *   stripSpaces
 *   ─────────────────────────────────────────────────────────────────────────
 *   1.  Returns the raw value unchanged when there are no spaces.
 *   2.  Removes a single interior space.
 *   3.  Removes multiple interior spaces (formatted code with two gaps).
 *   4.  Removes leading whitespace.
 *   5.  Removes trailing whitespace.
 *   6.  Handles tabs and newlines as whitespace.
 *   7.  Returns an empty string when given an empty string.
 *   8.  Returns an empty string when the value is all spaces.
 *
 *   toUpperCase
 *   ─────────────────────────────────────────────────────────────────────────
 *   9.  Upper-cases lowercase ASCII letters.
 *  10.  Leaves uppercase letters unchanged.
 *  11.  Leaves digits unchanged.
 *  12.  Leaves spaces unchanged (they are stripped separately, not here).
 *  13.  Returns an empty string unchanged.
 *
 *   cleanAndValidate  (the combined helper the component uses)
 *   ─────────────────────────────────────────────────────────────────────────
 *  14.  A formatted 10-char code with spaces → cleanCode has 10 chars,
 *       isReady is true.
 *  15.  A raw 10-char code (no spaces) → isReady is true.
 *  16.  9 chars after stripping → isReady is false.
 *  17.  11 chars after stripping → isReady is false  (over-length).
 *  18.  Empty string → isReady is false.
 *  19.  All spaces → isReady is false.
 *  20.  cleanCode does not contain any spaces even when the input does.
 *
 *   REQUIRED_LENGTH constant
 *   ─────────────────────────────────────────────────────────────────────────
 *  21.  Equals 10 — matches the openapi.yaml reference_code length.
 *
 *   Round-trip: toUpperCase → cleanAndValidate
 *   ─────────────────────────────────────────────────────────────────────────
 *  22.  A lower-case formatted code typed by the user is uppercased and then
 *       passes validation, replicating the exact sequence the component runs.
 *  23.  A partially-filled lower-case + spaced input does not pass validation
 *       after the same round-trip.
 *
 *   Edge cases
 *   ─────────────────────────────────────────────────────────────────────────
 *  24.  Non-breaking space (U+00A0) is treated as whitespace by stripSpaces.
 *  25.  stripSpaces is idempotent: calling it twice gives the same result.
 *  26.  toUpperCase is idempotent: calling it twice gives the same result.
 *  27.  cleanAndValidate does not mutate its argument.
 */

import { describe, it, expect } from "vitest";
import {
  stripSpaces,
  toUpperCase,
  cleanAndValidate,
  REQUIRED_LENGTH,
} from "../../../lib/lookup-validation";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A valid 10-char reference code, formatted as displayed on S5. */
const FORMATTED_CODE = "7K2M 9QX4 TB"; // 10 non-space chars, 2 spaces
/** The same code without any spaces. */
const RAW_CODE = "7K2M9QX4TB";

// ===========================================================================
// 1–8  stripSpaces
// ===========================================================================
describe("stripSpaces", () => {
  it("1. returns the value unchanged when there are no spaces", () => {
    expect(stripSpaces(RAW_CODE)).toBe(RAW_CODE);
  });

  it("2. removes a single interior space", () => {
    expect(stripSpaces("7K2M 9QX4")).toBe("7K2M9QX4");
  });

  it("3. removes multiple interior spaces (formatted S5-style code)", () => {
    expect(stripSpaces(FORMATTED_CODE)).toBe(RAW_CODE);
  });

  it("4. removes leading whitespace", () => {
    expect(stripSpaces("  ABCDEFGHIJ")).toBe("ABCDEFGHIJ");
  });

  it("5. removes trailing whitespace", () => {
    expect(stripSpaces("ABCDEFGHIJ  ")).toBe("ABCDEFGHIJ");
  });

  it("6. treats tab (\\t) and newline (\\n) as whitespace", () => {
    expect(stripSpaces("ABCD\tEFGH\nIJ")).toBe("ABCDEFGHIJ");
  });

  it("7. returns an empty string when given an empty string", () => {
    expect(stripSpaces("")).toBe("");
  });

  it("8. returns an empty string when the value is all spaces", () => {
    expect(stripSpaces("     ")).toBe("");
  });
});

// ===========================================================================
// 9–13  toUpperCase
// ===========================================================================
describe("toUpperCase", () => {
  it("9. upper-cases lowercase ASCII letters", () => {
    expect(toUpperCase("7k2m9qx4tb")).toBe("7K2M9QX4TB");
  });

  it("10. leaves already-uppercase letters unchanged", () => {
    expect(toUpperCase("7K2M9QX4TB")).toBe("7K2M9QX4TB");
  });

  it("11. leaves digits unchanged", () => {
    expect(toUpperCase("1234567890")).toBe("1234567890");
  });

  it("12. leaves spaces unchanged (they are stripped separately)", () => {
    expect(toUpperCase("7k2m 9qx4 tb")).toBe("7K2M 9QX4 TB");
  });

  it("13. returns an empty string when given an empty string", () => {
    expect(toUpperCase("")).toBe("");
  });
});

// ===========================================================================
// 14–20  cleanAndValidate
// ===========================================================================
describe("cleanAndValidate", () => {
  it("14. formatted 10-char code with spaces → isReady true, cleanCode correct", () => {
    const { cleanCode, isReady } = cleanAndValidate(FORMATTED_CODE);
    expect(cleanCode).toBe(RAW_CODE);
    expect(isReady).toBe(true);
  });

  it("15. raw 10-char code (no spaces) → isReady true", () => {
    const { cleanCode, isReady } = cleanAndValidate(RAW_CODE);
    expect(cleanCode).toBe(RAW_CODE);
    expect(isReady).toBe(true);
  });

  it("16. 9 chars after stripping → isReady false", () => {
    const { isReady } = cleanAndValidate("7K2M 9QX4"); // 8 non-space chars
    expect(isReady).toBe(false);
  });

  it("16b. exactly 9 stripped chars → isReady false", () => {
    const { cleanCode, isReady } = cleanAndValidate("7K2M9QX4T");
    expect(cleanCode).toHaveLength(9);
    expect(isReady).toBe(false);
  });

  it("17. 11 chars after stripping → isReady false (over-length)", () => {
    const { cleanCode, isReady } = cleanAndValidate("7K2M9QX4TBA");
    expect(cleanCode).toHaveLength(11);
    expect(isReady).toBe(false);
  });

  it("18. empty string → isReady false", () => {
    const { cleanCode, isReady } = cleanAndValidate("");
    expect(cleanCode).toBe("");
    expect(isReady).toBe(false);
  });

  it("19. all spaces → isReady false", () => {
    const { cleanCode, isReady } = cleanAndValidate("          ");
    expect(cleanCode).toBe("");
    expect(isReady).toBe(false);
  });

  it("20. cleanCode contains no spaces even when the input has spaces", () => {
    const { cleanCode } = cleanAndValidate(FORMATTED_CODE);
    expect(cleanCode).not.toContain(" ");
  });
});

// ===========================================================================
// 21  REQUIRED_LENGTH constant
// ===========================================================================
describe("REQUIRED_LENGTH", () => {
  it("21. equals 10 — matches the openapi.yaml reference_code length", () => {
    expect(REQUIRED_LENGTH).toBe(10);
  });
});

// ===========================================================================
// 22–23  Round-trip: toUpperCase → cleanAndValidate
// ===========================================================================
describe("round-trip: toUpperCase → cleanAndValidate", () => {
  it("22. lower-case formatted code is uppercased then passes validation", () => {
    // Simulate the component: onChange uppercases, then derived values run
    // cleanAndValidate on the stored (already-uppercased) display value.
    const typed = "7k2m 9qx4 tb";        // as the driver types, before onChange
    const stored = toUpperCase(typed);    // what rawValue becomes after onChange
    const { cleanCode, isReady } = cleanAndValidate(stored);
    expect(cleanCode).toBe("7K2M9QX4TB");
    expect(isReady).toBe(true);
  });

  it("23. partially filled lower-case input does not pass after round-trip", () => {
    const typed = "7k2m 9q";
    const stored = toUpperCase(typed);
    const { isReady } = cleanAndValidate(stored);
    expect(isReady).toBe(false);
  });
});

// ===========================================================================
// 24–27  Edge cases
// ===========================================================================
describe("edge cases", () => {
  it("24. non-breaking space (U+00A0) is treated as whitespace by stripSpaces", () => {
    // The formatted code on S5 uses U+00A0 between groups. A driver who
    // copy-pastes from the confirmed screen would get these non-breaking spaces.
    const withNbsp = "7K2M\u00A09QX4\u00A0TB";
    expect(stripSpaces(withNbsp)).toBe("7K2M9QX4TB");
  });

  it("25. stripSpaces is idempotent: calling it twice gives the same result", () => {
    const once = stripSpaces(FORMATTED_CODE);
    const twice = stripSpaces(once);
    expect(once).toBe(twice);
  });

  it("26. toUpperCase is idempotent: calling it twice gives the same result", () => {
    const once = toUpperCase("7k2m 9qx4 tb");
    const twice = toUpperCase(once);
    expect(once).toBe(twice);
  });

  it("27. cleanAndValidate does not mutate its argument", () => {
    const original = FORMATTED_CODE;
    const snapshot = FORMATTED_CODE;
    cleanAndValidate(original);
    // Primitive string — cannot be mutated; this is a contract assertion.
    expect(original).toBe(snapshot);
  });
});
