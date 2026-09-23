import { NextResponse } from "next/server";
import pool from "../../../lib/db";

// ---------------------------------------------------------------------------
// Caching — this route must never be served from a cache. Infrastructure
// metrics and liveness probes require a live database round-trip every call.
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types — all response shapes are typed (ARCH-002).
// ---------------------------------------------------------------------------

/** Per-subsystem boolean check results. */
interface Checks {
  /** True when `SELECT 1` completes successfully against the pool. */
  database: boolean;
  /**
   * True when the `bookings_no_overlapping_active` exclusion constraint
   * is confirmed present in `pg_constraint`.  The double-booking guarantee
   * lives entirely in that constraint (ADR-001); its absence means the
   * guarantee is not in force.
   */
  booking_guarantee: boolean;
}

/** Response body returned on HTTP 200 (all checks pass). */
interface HealthOkResponse {
  status: "ok";
  checks: Checks;
  /** Value of the `npm_package_version` env var, injected by Next.js from
   *  `package.json`.  Falls back to `"unknown"` when not available. */
  version: string;
  /** Seconds since `process.start` — a proxy for pod/worker uptime. */
  uptime_seconds: number;
}

/** Response body returned on HTTP 503 (at least one check fails). */
interface HealthDegradedResponse {
  status: "degraded";
  checks: Checks;
  version: string;
  uptime_seconds: number;
}

type HealthResponse = HealthOkResponse | HealthDegradedResponse;

// ---------------------------------------------------------------------------
// SQL constants
// ---------------------------------------------------------------------------

/**
 * Minimal reachability probe — the cheapest possible round-trip that proves
 * the connection pool can talk to Postgres.  Uses a parameterised form ($1)
 * so the pg driver takes the full prepared-statement path (SEC-004).
 */
const PING_SQL = "SELECT $1::int AS pong";

/**
 * Verify the exclusion constraint that enforces the double-booking guarantee
 * (ADR-001).  We query `pg_constraint` by name so the check is independent
 * of schema migrations re-running — as long as the constraint exists with
 * this exact name the guarantee is in force.
 *
 * Fully parameterised; constraint name is a bind parameter (SEC-004).
 */
const CONSTRAINT_SQL = `
  SELECT 1
  FROM   pg_constraint
  WHERE  conname = $1
    AND  contype = 'x'
`;

/** The constraint name defined in the migration (ADR-001). */
const CONSTRAINT_NAME = "bookings_no_overlapping_active";

// ---------------------------------------------------------------------------
// Individual check helpers — each resolves to a boolean; errors are caught
// internally so one failing check never masks the other, and no stack trace
// or connection detail ever escapes into the response (SEC-001).
// ---------------------------------------------------------------------------

/**
 * Probe the database by executing `SELECT $1::int`.
 * Returns `true` on success, `false` on any error.
 */
async function checkDatabase(): Promise<boolean> {
  try {
    await pool.query<{ pong: number }>(PING_SQL, [1]);
    return true;
  } catch {
    // Deliberately swallow: error detail may contain the connection string
    // (SEC-001).  The boolean return is sufficient for the health response.
    return false;
  }
}

/**
 * Verify `bookings_no_overlapping_active` exists in `pg_constraint`.
 * Returns `true` when the row is found, `false` on absence or any error.
 */
async function checkBookingGuarantee(): Promise<boolean> {
  try {
    const result = await pool.query<{ "?column?": number }>(CONSTRAINT_SQL, [
      CONSTRAINT_NAME,
    ]);
    return result.rows.length === 1;
  } catch {
    // Same reasoning as checkDatabase — swallow silently.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * GET /api/health
 *
 * Runs two independent database checks on every request:
 *   1. `database`          — `SELECT $1::int` through the connection pool.
 *   2. `booking_guarantee` — presence of the `bookings_no_overlapping_active`
 *                            exclusion constraint in `pg_constraint`.
 *
 * Both checks run in parallel via `Promise.all` to minimise latency.
 *
 * Responses:
 *   200 `{ status:'ok',       checks:{database:true,  booking_guarantee:true},  version, uptime_seconds }`
 *   503 `{ status:'degraded', checks:{database:false, booking_guarantee:false}, version, uptime_seconds }`
 *      (either or both of the check booleans may be false on 503)
 *
 * Security guarantees (SEC-001):
 *   - The DATABASE_URL connection string is never echoed in any response body.
 *   - Stack traces are never included in any response body.
 *   - Errors from both checks are caught inside their helpers before they can
 *     reach the serialiser.
 *
 * @see design/adr/ADR-001 — exclusion constraint definition
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  // Run both checks concurrently — neither depends on the other's result.
  const [database, booking_guarantee] = await Promise.all([
    checkDatabase(),
    checkBookingGuarantee(),
  ]);

  const checks: Checks = { database, booking_guarantee };
  const version =
    process.env["npm_package_version"] ?? "unknown";
  const uptime_seconds = Math.floor(process.uptime());

  if (database && booking_guarantee) {
    const body: HealthOkResponse = {
      status: "ok",
      checks,
      version,
      uptime_seconds,
    };
    return NextResponse.json<HealthOkResponse>(body, { status: 200 });
  }

  const body: HealthDegradedResponse = {
    status: "degraded",
    checks,
    version,
    uptime_seconds,
  };
  return NextResponse.json<HealthDegradedResponse>(body, { status: 503 });
}
