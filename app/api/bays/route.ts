import { NextRequest, NextResponse } from "next/server";
import pool from "../../../lib/db";

// ---------------------------------------------------------------------------
// Types — mirror the OpenAPI contract shape (ARCH-002).
// ---------------------------------------------------------------------------

/** One free bay returned in the response. */
interface BayResult {
  bay_id: number;
  label: string;
}

/** Shape of the successful 200 response body. */
interface BaysResponse {
  bays: BayResult[];
}

/** Shape of error response bodies. */
interface ErrorResponse {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a 400 NextResponse using the shared Error schema. */
function badRequest(error: string, message: string): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>({ error, message }, { status: 400 });
}

/**
 * Parse an ISO 8601 date-time string into a Date.
 * Returns `null` when the string is missing, empty, or produces a NaN timestamp.
 */
function parseTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isFinite(d.getTime()) ? d : null;
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/**
 * Return active bays for `spot_id` that carry NO non-cancelled booking
 * overlapping the requested [start, end) window.
 *
 * Uses the half-open tstzrange '[)' semantics matching ADR-001 and the
 * exclusion constraint: a bay booked 10:00–12:00 IS free at 12:00.
 *
 * Fully parameterised — no string concatenation of user input (SEC-004).
 */
const FREE_BAYS_SQL = `
  SELECT
    b.id    AS bay_id,
    b.label AS label
  FROM bays b
  LEFT JOIN bookings bk
         ON  bk.bay_id   = b.id
         AND bk.status  <> 'cancelled'
         AND bk.window_at && tstzrange($2::timestamptz, $3::timestamptz, '[)')
  WHERE b.spot_id   = $1
    AND b.is_active = true
    AND bk.id IS NULL
  ORDER BY b.label
`;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * GET /api/bays
 *
 * Returns active bays for a spot that are free for the entire [start, end)
 * window. Used by S3 (Book screen) to render the selectable bay chips.
 *
 * Query parameters (all required):
 *   spot_id  – integer spot id
 *   start    – ISO 8601 window start (inclusive)
 *   end      – ISO 8601 window end (exclusive)
 *
 * Success 200 body  →  { bays: Array<{ bay_id: number; label: string }> }
 * Error 400 body    →  { error: string; message: string }
 *
 * An empty bays array is a valid 200 — it means another booking raced ahead
 * while the user was on the results page. The S3 UI handles this gracefully.
 *
 * @see design/openapi.yaml — the availability contract uses the same window
 *   semantics and range operator (tstzrange '[)' / &&).
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<BaysResponse | ErrorResponse>> {
  const { searchParams } = request.nextUrl;

  // -------------------------------------------------------------------------
  // 1. Input validation (SEC-003).
  // -------------------------------------------------------------------------
  const spotIdRaw = searchParams.get("spot_id");
  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");

  if (!spotIdRaw) {
    return badRequest("missing_param", "Query parameter 'spot_id' is required.");
  }
  if (!startRaw) {
    return badRequest("missing_param", "Query parameter 'start' is required.");
  }
  if (!endRaw) {
    return badRequest("missing_param", "Query parameter 'end' is required.");
  }

  // -------------------------------------------------------------------------
  // 2. Parse spot_id as a positive integer.
  // -------------------------------------------------------------------------
  const spotId = parseInt(spotIdRaw, 10);
  if (!Number.isInteger(spotId) || spotId <= 0 || String(spotId) !== spotIdRaw) {
    return badRequest(
      "invalid_param",
      "'spot_id' must be a positive integer.",
    );
  }

  // -------------------------------------------------------------------------
  // 3. Timestamp parsing — both values must be valid date-times.
  // -------------------------------------------------------------------------
  const startDate = parseTimestamp(startRaw);
  if (!startDate) {
    return badRequest(
      "invalid_param",
      "'start' is not a valid ISO 8601 date-time.",
    );
  }

  const endDate = parseTimestamp(endRaw);
  if (!endDate) {
    return badRequest(
      "invalid_param",
      "'end' is not a valid ISO 8601 date-time.",
    );
  }

  // -------------------------------------------------------------------------
  // 4. Window ordering — end must be strictly after start.
  // -------------------------------------------------------------------------
  if (endDate.getTime() <= startDate.getTime()) {
    return badRequest(
      "invalid_window",
      "'end' must be strictly after 'start'.",
    );
  }

  // -------------------------------------------------------------------------
  // 5. Query — free bays only, ordered by label.
  // -------------------------------------------------------------------------
  const result = await pool.query<BayResult>(FREE_BAYS_SQL, [
    spotId,
    startRaw,
    endRaw,
  ]);

  return NextResponse.json<BaysResponse>({ bays: result.rows }, { status: 200 });
}
