/**
 * Money. Integer paise everywhere, per ADR-003.
 *
 * Formatting happens here and nowhere else, so a raw 8000 cannot reach a screen
 * by accident.
 */

const MILLIS_PER_HOUR = 60 * 60 * 1000;

/**
 * Paise → display string.
 *
 * Microcopy rule from design/terminology.md: no decimals when the paise are a
 * whole rupee. ₹40, not ₹40.00. Paise are shown only when non-zero, because
 * "₹40.00" reads like a form field and "₹40" reads like a price.
 */
export function paiseToDisplay(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  return remainder === 0
    ? `₹${rupees}`
    : `₹${rupees}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Whole hours, rounded UP — ADR-003's billing rule. A 90-minute window bills 2
 * hours. Written as an explicit rule rather than left to integer division,
 * because the rounding direction is a product decision and someone will
 * otherwise "fix" it to round down.
 */
export function billableHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new RangeError("window end must be after start");
  }
  return Math.ceil(ms / MILLIS_PER_HOUR);
}

/**
 * The authoritative price. Computed server-side from the spot's rate and the
 * window; never accepted from a client (ADR-003, threat model T2).
 */
export function computeAmountPaise(
  pricePerHourPaise: number,
  startIso: string,
  endIso: string,
): number {
  if (!Number.isInteger(pricePerHourPaise) || pricePerHourPaise < 0) {
    throw new RangeError("price must be a non-negative integer number of paise");
  }
  return billableHours(startIso, endIso) * pricePerHourPaise;
}
