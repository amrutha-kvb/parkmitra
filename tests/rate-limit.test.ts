/**
 * Rate limiter against a REAL database. Not mocked — the atomicity guarantee
 * lives in Postgres's ON CONFLICT row lock, so mocking would test nothing.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import pool from "../lib/db";
import { checkRateLimit } from "../lib/rate-limit";

const TEST_IP = "198.51.100.1";

async function clearRateLimits() {
  await pool.query("TRUNCATE rate_limit_hits");
}

beforeEach(async () => {
  await clearRateLimits();
});

afterAll(async () => {
  await clearRateLimits();
  await pool.end();
});

describe("rate limiting", () => {
  it("allows requests under the limit", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(TEST_IP);
      expect(result.allowed).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
    }
  });

  it("allows exactly the 20th request", async () => {
    await pool.query(
      `INSERT INTO rate_limit_hits (ip_addr, window_min, hits)
       VALUES ($1::inet, date_trunc('minute', now()), 19)`,
      [TEST_IP],
    );
    const twentieth = await checkRateLimit(TEST_IP);
    expect(twentieth.allowed).toBe(true);
    expect(twentieth.retryAfterSeconds).toBe(0);
  });

  it("rejects the 21st request with a positive Retry-After", async () => {
    await pool.query(
      `INSERT INTO rate_limit_hits (ip_addr, window_min, hits)
       VALUES ($1::inet, date_trunc('minute', now()), 20)`,
      [TEST_IP],
    );
    const twentyFirst = await checkRateLimit(TEST_IP);
    expect(twentyFirst.allowed).toBe(false);
    expect(twentyFirst.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(twentyFirst.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts IPs independently", async () => {
    const OTHER_IP = "203.0.113.1";
    await pool.query(
      `INSERT INTO rate_limit_hits (ip_addr, window_min, hits)
       VALUES ($1::inet, date_trunc('minute', now()), 20)`,
      [TEST_IP],
    );
    const other = await checkRateLimit(OTHER_IP);
    expect(other.allowed).toBe(true);
  });

  it("30 concurrent requests: exactly 20 allowed, 10 refused", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () => checkRateLimit(TEST_IP)),
    );

    const outcomes = results.map((r) => {
      if (r.status !== "fulfilled") throw r.reason;
      return r.value;
    });

    const allowed = outcomes.filter((o) => o.allowed).length;
    const refused = outcomes.filter((o) => !o.allowed).length;

    expect(allowed).toBe(20);
    expect(refused).toBe(10);

    for (const o of outcomes) {
      if (!o.allowed) {
        expect(o.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        expect(o.retryAfterSeconds).toBeLessThanOrEqual(60);
      }
    }
  });

  it("resets when the window changes", async () => {
    // Simulate a full window by inserting a row one minute in the past
    await pool.query(
      `INSERT INTO rate_limit_hits (ip_addr, window_min, hits)
       VALUES ($1::inet, date_trunc('minute', now()) - interval '1 minute', 20)`,
      [TEST_IP],
    );

    // Current minute is a fresh window — should be allowed
    const result = await checkRateLimit(TEST_IP);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });
});

/**
 * Per-scope buckets.
 *
 * Written BEFORE the implementation, and committed failing on purpose, because
 * the quality bar this project is held to asks for the failing commit to be
 * visible rather than asserted.
 *
 * Why this is needed: the limiter keyed on ip_addr alone, so every endpoint
 * that used it shared ONE bucket per IP. With only the booking lookup wired up
 * that was invisible. The moment a second endpoint calls it — and searching,
 * listing bays and creating a booking all should be limited — an ordinary user
 * browsing normally would exhaust a single 20/minute allowance across unrelated
 * actions and be locked out of the product by its own defences.
 *
 * A limiter that throttles legitimate use is not a stricter limiter, it is a
 * broken one.
 */
describe("per-scope rate limit buckets", () => {
  const IP = "203.0.113.77";

  beforeEach(async () => {
    await pool.query("DELETE FROM rate_limit_hits WHERE ip_addr = $1::inet", [IP]);
  });

  it("exhausting one scope does not affect another", async () => {
    // Fill the 'search' bucket right up to its limit.
    for (let i = 0; i < 5; i += 1) {
      const r = await checkRateLimit(IP, { scope: "search", limit: 5 });
      expect(r.allowed).toBe(true);
    }
    const overSearch = await checkRateLimit(IP, { scope: "search", limit: 5 });
    expect(overSearch.allowed).toBe(false);

    // A different scope, same IP, must be untouched.
    const otherScope = await checkRateLimit(IP, { scope: "booking", limit: 5 });
    expect(otherScope.allowed).toBe(true);
  });

  it("each scope enforces its own limit independently", async () => {
    for (let i = 0; i < 3; i += 1) {
      await checkRateLimit(IP, { scope: "tight", limit: 3 });
    }
    expect((await checkRateLimit(IP, { scope: "tight", limit: 3 })).allowed).toBe(false);

    // A generous scope still allows well past the tight one's limit.
    for (let i = 0; i < 10; i += 1) {
      expect((await checkRateLimit(IP, { scope: "loose", limit: 50 })).allowed).toBe(true);
    }
  });

  it("concurrent requests in one scope cannot exceed that scope's limit", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () => checkRateLimit(IP, { scope: "race", limit: 20 })),
    );
    const allowed = results.filter(
      (r) => r.status === "fulfilled" && r.value.allowed,
    ).length;
    expect(allowed).toBe(20);
  });
});
