/**
 * Fixed-window rate limiter backed by Postgres (rate_limit_hits table).
 *
 * A single atomic INSERT … ON CONFLICT … DO UPDATE RETURNING statement
 * increments and reads the counter so two concurrent calls can never both
 * see the pre-increment value.
 */

import pool from "./db";

const WINDOW_SECONDS = 60;

/** Default allowance, kept at the original value so the lookup route is unchanged. */
const DEFAULT_LIMIT = 20;

/**
 * Per-endpoint budgets.
 *
 * Deliberately not one number. Searching is what a visitor does repeatedly
 * while making up their mind, and throttling that is throttling the product.
 * Creating a booking is a write that costs a bay, so it is tighter — this is
 * the only control standing between the seeded supply and threat T3, booking
 * spam, which `design/threat-model.md` still lists as unmitigated.
 */
export const SCOPES = {
  /** Reading one booking by reference code. Enumeration defence (T1). */
  lookup: 20,
  /** Availability search. Generous: this is normal browsing. */
  search: 60,
  /** Listing bays for a spot. Same reasoning as search. */
  bays: 60,
  /** Creating a booking. A write that reserves a bay (T3). */
  booking: 10,
  /** Paying for, or arriving at, an existing booking. */
  mutate: 20,
} as const;

export type RateLimitScope = keyof typeof SCOPES;

interface RateLimitOptions {
  /** Which bucket to count against. Each scope is independent per IP. */
  scope: RateLimitScope | string;
  /** Override the scope's configured allowance. Used by tests. */
  limit?: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Check (and atomically increment) the rate-limit counter for `ip`.
 *
 * Returns whether the request is allowed and, if not, how many seconds
 * until the current window resets.
 */
export async function checkRateLimit(
  ip: string,
  options: RateLimitOptions = { scope: "lookup" },
): Promise<RateLimitResult> {
  const scope = options.scope;
  const maxHits =
    options.limit ?? SCOPES[scope as RateLimitScope] ?? DEFAULT_LIMIT;

  // date_trunc('minute', now()) gives a stable window start that all
  // concurrent invocations agree on without application-side clock math.
  // The conflict target is the full primary key, so two scopes for one IP
  // never touch each other's counter.
  const { rows } = await pool.query<{ hits: number; window_min: Date }>(
    `INSERT INTO rate_limit_hits (ip_addr, scope, window_min, hits)
     VALUES ($1::inet, $2, date_trunc('minute', now()), 1)
     ON CONFLICT (ip_addr, scope, window_min)
     DO UPDATE SET hits = rate_limit_hits.hits + 1
     RETURNING hits, window_min`,
    [ip, scope],
  );

  const { hits, window_min } = rows[0];

  if (hits <= maxHits) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const windowEnd = new Date(window_min.getTime() + WINDOW_SECONDS * 1000);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowEnd.getTime() - Date.now()) / 1000),
  );

  return { allowed: false, retryAfterSeconds };
}
