/**
 * Tests for GET /api/health  (app/api/health/route.ts)
 *
 * All external dependencies (lib/db, process.uptime, process.env) are mocked
 * so the suite runs without a database.  The tests verify:
 *
 * Happy path — 200
 *   1.  Both checks pass          → 200 with status 'ok'
 *   2.  Response has all required fields (ARCH-002)
 *   3.  checks.database is true when SELECT $1 succeeds
 *   4.  checks.booking_guarantee is true when constraint row is found
 *   5.  version is the real package version, not the npm env var
 *   6.  version is reported even when the npm env var is absent
 *   6b. commit is the short SHA of the deployed build
 *   6c. commit falls back to 'unknown' off Vercel
 *   7.  uptime_seconds is a non-negative integer (Math.floor of process.uptime)
 *   8.  Response body keys are exactly {status, checks, version, commit, uptime_seconds}
 *   9.  checks keys are exactly {database, booking_guarantee}
 *
 * Degraded — 503
 *  10.  database check fails       → 503 with status 'degraded', database:false
 *  11.  booking_guarantee fails    → 503 with status 'degraded', booking_guarantee:false
 *  12.  Both checks fail           → 503 with both flags false
 *  13.  503 body has same schema as 200 body (ARCH-002)
 *
 * Security — SEC-001 (no leaking of connection string / stack traces)
 *  14.  DB error message does not appear in the response body
 *  15.  Stack trace does not appear in the response body
 *  16.  DATABASE_URL does not appear in the response body
 *
 * Behaviour
 *  17.  Both DB queries run on every call (no caching)
 *  18.  Checks run in parallel — both queries called even when first fails
 *  19.  PING_SQL is parameterised — literal '1' is a bind param, not in SQL text
 *  20.  CONSTRAINT_SQL checks contype = 'x' (exclusion), not just conname
 *  21.  Zero rows from pg_constraint returns booking_guarantee:false
 *  22.  More than zero rows from pg_constraint returns booking_guarantee:true
 *  23.  uptime_seconds is Math.floor (not ceil or raw float)
 *  24.  export const dynamic = 'force-dynamic' is set on the module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mocks — must happen before any static imports.
// ---------------------------------------------------------------------------
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../../../../lib/db", () => ({
  default: { query: mockQuery },
}));

// Now import the handler under test.
import { GET, dynamic } from "../route";
import pkg from "../../../../package.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the mock return value for the PING query (SELECT $1::int). */
function pingOk(): { rows: Array<{ pong: number }> } {
  return { rows: [{ pong: 1 }] };
}

/** Build the mock return value for the constraint query (1 row = found). */
function constraintFound(): { rows: Array<Record<string, number>> } {
  return { rows: [{ "?column?": 1 }] };
}

/** Build the mock return value for the constraint query (0 rows = absent). */
function constraintMissing(): { rows: never[] } {
  return { rows: [] };
}

/**
 * Set up both queries for the fully healthy path.
 * Promise.all means both queries are issued concurrently; mockQuery receives
 * them in issue order — ping first (always SELECT $1), constraint second.
 */
function setupHealthy(): void {
  mockQuery.mockResolvedValueOnce(pingOk());
  mockQuery.mockResolvedValueOnce(constraintFound());
}

// ---------------------------------------------------------------------------
// Capture and restore process.uptime + process.env around tests.
// ---------------------------------------------------------------------------
const originalUptime = process.uptime.bind(process);

beforeEach(() => {
  mockQuery.mockReset();
  // Default: uptime returns a stable float so tests are deterministic.
  vi.spyOn(process, "uptime").mockReturnValue(42.7);
});

afterEach(() => {
  vi.restoreAllMocks();
  // Restore any env mutations.
  if ("npm_package_version" in process.env) {
    // leave as-is if it was already set; individual tests override as needed
  }
});

// ===========================================================================
// 1–9  Happy path — 200
// ===========================================================================
describe("happy path → 200", () => {
  it("1. returns 200 when both checks pass", async () => {
    setupHealthy();
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("2. status field is 'ok' when both checks pass", async () => {
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("3. checks.database is true when SELECT $1 succeeds", async () => {
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.checks.database).toBe(true);
  });

  it("4. checks.booking_guarantee is true when constraint row is found", async () => {
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.checks.booking_guarantee).toBe(true);
  });

  // Regression guard. This used to read `npm_package_version`, which is only
  // set when the process is launched *by npm*. The Vercel runtime is not, so
  // production reported `"version":"unknown"` on every deployment — a health
  // endpoint that could not tell you what was deployed. It now reads
  // package.json directly, which is resolved at build time.
  it("5. version is the real package version, not the npm env var", async () => {
    process.env["npm_package_version"] = "3.7.1";
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.version).toBe(pkg.version);
    expect(body.version).not.toBe("3.7.1");
    expect(body.version).not.toBe("unknown");
    delete process.env["npm_package_version"];
  });

  it("6. version is still reported when npm_package_version is absent", async () => {
    const saved = process.env["npm_package_version"];
    delete process.env["npm_package_version"];
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.version).toBe(pkg.version);
    if (saved !== undefined) process.env["npm_package_version"] = saved;
  });

  it("6b. commit is the short SHA of the deployed build", async () => {
    process.env["VERCEL_GIT_COMMIT_SHA"] = "0123456789abcdef";
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.commit).toBe("0123456");
    delete process.env["VERCEL_GIT_COMMIT_SHA"];
  });

  // Regression guard. `??` does not catch an empty string, and a deployment that
  // is not git-connected sets this variable to exactly that — so production
  // reported `"commit": ""`, which reads as a value rather than as absence.
  it("6b-ii. commit falls back to 'unknown' when the env var is an EMPTY STRING", async () => {
    process.env["VERCEL_GIT_COMMIT_SHA"] = "";
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.commit).toBe("unknown");
    delete process.env["VERCEL_GIT_COMMIT_SHA"];
  });

  it("6b-iii. commit falls back to 'unknown' when the env var is whitespace", async () => {
    process.env["VERCEL_GIT_COMMIT_SHA"] = "   ";
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.commit).toBe("unknown");
    delete process.env["VERCEL_GIT_COMMIT_SHA"];
  });

  it("6c. commit falls back to 'unknown' off Vercel", async () => {
    const saved = process.env["VERCEL_GIT_COMMIT_SHA"];
    delete process.env["VERCEL_GIT_COMMIT_SHA"];
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.commit).toBe("unknown");
    if (saved !== undefined) process.env["VERCEL_GIT_COMMIT_SHA"] = saved;
  });

  it("7. uptime_seconds is the floored value of process.uptime()", async () => {
    vi.spyOn(process, "uptime").mockReturnValue(99.9);
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    // Math.floor(99.9) === 99
    expect(body.uptime_seconds).toBe(99);
  });

  it("8. response body has exactly {status, checks, version, commit, uptime_seconds} (ARCH-002)", async () => {
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["checks", "commit", "status", "uptime_seconds", "version"].sort(),
    );
  });

  it("9. checks object has exactly {database, booking_guarantee} (ARCH-002)", async () => {
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(Object.keys(body.checks).sort()).toEqual(
      ["booking_guarantee", "database"].sort(),
    );
  });
});

// ===========================================================================
// 10–13  Degraded — 503
// ===========================================================================
describe("degraded → 503", () => {
  it("10. returns 503 when the database check fails", async () => {
    // Ping throws; constraint succeeds.
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));
    mockQuery.mockResolvedValueOnce(constraintFound());
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.database).toBe(false);
  });

  it("11. returns 503 when booking_guarantee check fails (constraint absent)", async () => {
    // Ping succeeds; constraint returns 0 rows.
    mockQuery.mockResolvedValueOnce(pingOk());
    mockQuery.mockResolvedValueOnce(constraintMissing());
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.booking_guarantee).toBe(false);
  });

  it("11b. returns 503 when booking_guarantee check throws", async () => {
    // Ping succeeds; constraint query throws.
    mockQuery.mockResolvedValueOnce(pingOk());
    mockQuery.mockRejectedValueOnce(new Error("pg down"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.booking_guarantee).toBe(false);
  });

  it("12. returns 503 with both flags false when both checks fail", async () => {
    mockQuery.mockRejectedValueOnce(new Error("no db"));
    mockQuery.mockRejectedValueOnce(new Error("no db"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.database).toBe(false);
    expect(body.checks.booking_guarantee).toBe(false);
  });

  it("13. 503 body has the same schema as 200 body (ARCH-002)", async () => {
    mockQuery.mockRejectedValueOnce(new Error("down"));
    mockQuery.mockRejectedValueOnce(new Error("down"));
    const res = await GET();
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["checks", "commit", "status", "uptime_seconds", "version"].sort(),
    );
    expect(Object.keys(body.checks).sort()).toEqual(
      ["booking_guarantee", "database"].sort(),
    );
  });

  it("database:true is preserved when only booking_guarantee fails", async () => {
    mockQuery.mockResolvedValueOnce(pingOk());
    mockQuery.mockResolvedValueOnce(constraintMissing());
    const res = await GET();
    const body = await res.json();
    expect(body.checks.database).toBe(true);
    expect(body.checks.booking_guarantee).toBe(false);
  });

  it("booking_guarantee:true is preserved when only database fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("ping failed"));
    mockQuery.mockResolvedValueOnce(constraintFound());
    const res = await GET();
    const body = await res.json();
    expect(body.checks.database).toBe(false);
    expect(body.checks.booking_guarantee).toBe(true);
  });
});

// ===========================================================================
// 14–16  Security — SEC-001 (no leaking of connection string / stack traces)
// ===========================================================================
describe("security — no credential / stack-trace leakage (SEC-001)", () => {
  it("14. a DB error message does not appear anywhere in the response body", async () => {
    const secretMessage =
      "password authentication failed for user 'app_user'";
    mockQuery.mockRejectedValueOnce(new Error(secretMessage));
    mockQuery.mockRejectedValueOnce(new Error(secretMessage));
    const res = await GET();
    const raw = await res.text();
    expect(raw).not.toContain(secretMessage);
  });

  it("15. a stack trace does not appear in the response body", async () => {
    const err = new Error("something broke");
    // Ensure the error has a real stack.
    expect(err.stack).toBeDefined();
    mockQuery.mockRejectedValueOnce(err);
    mockQuery.mockRejectedValueOnce(new Error("x"));
    const res = await GET();
    const raw = await res.text();
    // Stack frames contain 'at ' — if any 'at ' appears the trace leaked.
    expect(raw).not.toMatch(/\bat\b.+:\d+:\d+/);
  });

  it("16. DATABASE_URL does not appear in the response body", async () => {
    // Simulate a hypothetical error that echoes the connection string.
    const fakeUrl = "postgresql://user:s3cr3t@db.internal:5432/parkmitra";
    process.env["DATABASE_URL"] = fakeUrl;
    const err = new Error(`connect ECONNREFUSED ${fakeUrl}`);
    mockQuery.mockRejectedValueOnce(err);
    mockQuery.mockRejectedValueOnce(err);
    const res = await GET();
    const raw = await res.text();
    expect(raw).not.toContain(fakeUrl);
    // Restore — the test suite may need a valid DATABASE_URL later.
    process.env["DATABASE_URL"] = process.env["DATABASE_URL"] ?? "";
  });
});

// ===========================================================================
// 17–24  Behaviour
// ===========================================================================
describe("behavioural contracts", () => {
  it("17. both DB queries are issued on every call", async () => {
    setupHealthy();
    await GET();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("18. both queries are issued even when the ping fails (parallel execution)", async () => {
    // Because checks run via Promise.all, both are kicked off before either
    // settles.  Both mockQuery slots must be consumed.
    mockQuery.mockRejectedValueOnce(new Error("ping down"));
    mockQuery.mockResolvedValueOnce(constraintFound());
    await GET();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("19. ping query passes 1 as a bind parameter — not interpolated in SQL text", async () => {
    setupHealthy();
    await GET();
    // Find the call whose SQL is the ping query.
    const pingCall = mockQuery.mock.calls.find(
      ([sql]: [string]) =>
        // Matches the SELECT $1 ping, not the pg_constraint query.
        sql.includes("SELECT") && !sql.includes("pg_constraint"),
    );
    expect(pingCall).toBeDefined();
    const [sql, params] = pingCall as [string, unknown[]];
    // The literal '1' must be a bind param, not embedded in the SQL string.
    expect(params).toContain(1);
    // The SQL should use a placeholder ($1), not a bare integer literal.
    expect(sql).toMatch(/\$1/);
    expect(sql).not.toMatch(/SELECT 1\b/);
  });

  it("20. constraint query filters contype = 'x' (exclusion type only)", async () => {
    setupHealthy();
    await GET();
    const constraintCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => sql.includes("pg_constraint"),
    );
    expect(constraintCall).toBeDefined();
    const [sql] = constraintCall as [string, unknown[]];
    expect(sql).toMatch(/contype\s*=\s*'x'/);
  });

  it("21. zero rows from pg_constraint → booking_guarantee:false", async () => {
    mockQuery.mockResolvedValueOnce(pingOk());
    mockQuery.mockResolvedValueOnce(constraintMissing());
    const res = await GET();
    const body = await res.json();
    expect(body.checks.booking_guarantee).toBe(false);
  });

  it("22. one row from pg_constraint → booking_guarantee:true", async () => {
    mockQuery.mockResolvedValueOnce(pingOk());
    mockQuery.mockResolvedValueOnce(constraintFound());
    const res = await GET();
    const body = await res.json();
    expect(body.checks.booking_guarantee).toBe(true);
  });

  it("23. uptime_seconds is Math.floor — fractional seconds are truncated", async () => {
    vi.spyOn(process, "uptime").mockReturnValue(3.999);
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    // Math.floor(3.999) === 3, not 4.
    expect(body.uptime_seconds).toBe(3);
  });

  it("23b. uptime_seconds is 0 for a brand-new process (uptime < 1s)", async () => {
    vi.spyOn(process, "uptime").mockReturnValue(0.5);
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(body.uptime_seconds).toBe(0);
  });

  it("24. dynamic export equals 'force-dynamic'", () => {
    // Ensures the route is never served from Next.js's static cache.
    expect(dynamic).toBe("force-dynamic");
  });

  it("constraint query uses the correct constraint name as a bind parameter", async () => {
    setupHealthy();
    await GET();
    const constraintCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => sql.includes("pg_constraint"),
    );
    expect(constraintCall).toBeDefined();
    const [, params] = constraintCall as [string, unknown[]];
    expect(params).toContain("bookings_no_overlapping_active");
  });

  it("uptime_seconds is a non-negative integer in the JSON", async () => {
    vi.spyOn(process, "uptime").mockReturnValue(123.456);
    setupHealthy();
    const res = await GET();
    const body = await res.json();
    expect(Number.isInteger(body.uptime_seconds)).toBe(true);
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("Content-Type header is application/json", async () => {
    setupHealthy();
    const res = await GET();
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
