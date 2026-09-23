/**
 * Pure helpers for the S6 Lookup page (app/lookup/page.tsx).
 *
 * Extracted into a library module so they can be unit-tested without a DOM
 * environment (the project does not have @testing-library/react or jsdom
 * configured — tests run against Node via Vitest).
 *
 * Each helper is a simple, stateless pure function.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Number of raw (space-stripped) characters required before the "Look up"
 * button becomes enabled. Matches the 10-character Crockford base32 code used
 * throughout the rest of the product (openapi.yaml, ADR-002).
 */
export const REQUIRED_LENGTH = 10 as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip every whitespace character from `value`.
 *
 * A driver may type or paste the reference code with spaces
 * (e.g. "7K2M 9QX4 TB" copied from the confirmation screen).
 * Stripping spaces before counting and before the API call means
 * the field accepts both forms without error.
 *
 * @example
 *   stripSpaces("7K2M 9QX4 TB") // → "7K2M9QX4TB"
 *   stripSpaces("A1B2C3D4E5")   // → "A1B2C3D4E5"
 *   stripSpaces("")             // → ""
 */
export function stripSpaces(value: string): string {
  return value.replace(/\s/g, "");
}

/**
 * Upper-case every character in `value`.
 *
 * Applied on every keystroke so the input auto-uppercases, removing the
 * need for the driver to engage Caps Lock when entering the reference code.
 *
 * @example
 *   toUpperCase("7k2m 9qx4 tb") // → "7K2M 9QX4 TB"
 *   toUpperCase("ABC")           // → "ABC"
 *   toUpperCase("")              // → ""
 */
export function toUpperCase(value: string): string {
  return value.toUpperCase();
}

/**
 * Return the space-stripped version of `value` and whether it has the right
 * length to enable the look-up button.
 *
 * A combined helper so the page can call one function and destructure both
 * derived values without calling `stripSpaces` twice.
 *
 * @example
 *   cleanAndValidate("7K2M 9QX4 TB")
 *   // → { cleanCode: "7K2M9QX4TB", isReady: true }
 *
 *   cleanAndValidate("7K2M")
 *   // → { cleanCode: "7K2M", isReady: false }
 *
 *   cleanAndValidate("")
 *   // → { cleanCode: "", isReady: false }
 */
export function cleanAndValidate(value: string): {
  cleanCode: string;
  isReady: boolean;
} {
  const cleanCode = stripSpaces(value);
  return { cleanCode, isReady: cleanCode.length === REQUIRED_LENGTH };
}
