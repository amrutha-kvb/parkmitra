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
