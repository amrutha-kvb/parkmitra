/**
 * Fixed-window rate limiter backed by Postgres (rate_limit_hits table).
 *
 * A single atomic INSERT … ON CONFLICT … DO UPDATE RETURNING statement
 * increments and reads the counter so two concurrent calls can never both
 * see the pre-increment value.
 */

import pool from "./db";

const MAX_HITS = 20;
const WINDOW_SECONDS = 60;

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
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  // date_trunc('minute', now()) gives a stable window start that all
  // concurrent invocations agree on without application-side clock math.
  const { rows } = await pool.query<{ hits: number; window_min: Date }>(
    `INSERT INTO rate_limit_hits (ip_addr, window_min, hits)
     VALUES ($1::inet, date_trunc('minute', now()), 1)
     ON CONFLICT (ip_addr, window_min)
     DO UPDATE SET hits = rate_limit_hits.hits + 1
     RETURNING hits, window_min`,
    [ip],
  );

  const { hits, window_min } = rows[0];

  if (hits <= MAX_HITS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const windowEnd = new Date(window_min.getTime() + WINDOW_SECONDS * 1000);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowEnd.getTime() - Date.now()) / 1000),
  );

  return { allowed: false, retryAfterSeconds };
}
