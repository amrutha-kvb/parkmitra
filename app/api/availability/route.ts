import { NextRequest, NextResponse } from "next/server";
import { searchAvailability } from "../../../lib/availability";
import pool from "../../../lib/db";

// ---------------------------------------------------------------------------
// Types — mirror the OpenAPI contract exactly (ARCH-002).
// ---------------------------------------------------------------------------

/** Shape of a successful 200 response body (openapi.yaml → getAvailability). */
interface AvailabilityResponse {
  window: { start: string; end: string };
  spots: Awaited<ReturnType<typeof searchAvailability>>;
}

/** Shape of a 400 error response body (openapi.yaml → Error schema). */
interface ErrorResponse {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a 400 NextResponse using the OpenAPI Error schema. */
function badRequest(error: string, message: string): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>({ error, message }, { status: 400 });
}

/**
 * Parse an ISO 8601 date-time string into a Date.
 * Returns `null` when the string is missing, empty, or does not produce a
 * finite numeric timestamp (i.e. `new Date(s)` → NaN).
 */
function parseTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isFinite(d.getTime()) ? d : null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * GET /api/availability
 *
 * Query parameters (all required):
 *   area  – area slug, e.g. "gachibowli"
 *   start – ISO 8601 date-time (window start, inclusive)
 *   end   – ISO 8601 date-time (window end, exclusive)
 *
 * Successful 200 body  →  { window: { start, end }, spots: SpotAvailability[] }
 * Error 400 body       →  { error: string, message: string }
 *
 * An empty spots array is a valid 200, not an error (openapi.yaml spec note).
 *
 * Side-effect: a row is inserted into search_events for every valid search so
 * the analytics pipeline can track usage. Errors here are silently swallowed
 * so that a metrics failure never degrades the user-facing response.
 *
 * @see design/openapi.yaml  →  /availability  →  GET  →  getAvailability
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<AvailabilityResponse | ErrorResponse>> {
  const { searchParams } = request.nextUrl;

  // ------------------------------------------------------------------
  // 1. Input validation (SEC-003) — all three params are required.
  // ------------------------------------------------------------------
  const area = searchParams.get("area");
  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");

  if (!area) {
    return badRequest("missing_param", "Query parameter 'area' is required.");
  }
  if (!startRaw) {
    return badRequest("missing_param", "Query parameter 'start' is required.");
  }
  if (!endRaw) {
    return badRequest("missing_param", "Query parameter 'end' is required.");
  }

  // ------------------------------------------------------------------
  // 2. Timestamp parsing — both values must be valid date-times.
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // 3. Window ordering — end must be strictly after start.
  // ------------------------------------------------------------------
  if (endDate.getTime() <= startDate.getTime()) {
    return badRequest(
      "invalid_window",
      "'end' must be after 'start'.",
    );
  }

  // ------------------------------------------------------------------
  // 4. Availability search — delegate to the lib module (no SQL here).
  // ------------------------------------------------------------------
  const spots = await searchAvailability(area, startRaw, endRaw);

  // ------------------------------------------------------------------
  // 5. Record the search event for analytics.
  //    Fire-and-forget: a DB error must not affect the HTTP response.
  //    session_id is a random value — no personal data, no IP (see
  //    migration 001 comments and design/data-dictionary.md).
  // ------------------------------------------------------------------
  void recordSearchEvent(area, startRaw, endRaw, spots.length);

  // ------------------------------------------------------------------
  // 6. Return the canonical 200 shape.
  //    The window echoes the validated params as-supplied (ISO strings).
  // ------------------------------------------------------------------
  const body: AvailabilityResponse = {
    window: { start: startRaw, end: endRaw },
    spots,
  };

  return NextResponse.json<AvailabilityResponse>(body, { status: 200 });
}

// ---------------------------------------------------------------------------
// Analytics helper — separated so the main handler stays readable.
// ---------------------------------------------------------------------------

/**
 * Insert a row into `search_events`.
 *
 * Failures are caught and logged to stderr but never re-thrown. The caller
 * uses `void` on the returned promise so a rejection does not become an
 * unhandled rejection.
 *
 * session_id is a random hex string generated per request. It has no
 * relationship to any user identity or IP address (analytics table has no
 * personal data by design — see migration 001).
 */
async function recordSearchEvent(
  areaSlug: string,
  startIso: string,
  endIso: string,
  resultCount: number,
): Promise<void> {
  try {
    // Resolve the slug to an area_id via a single parameterised query (SEC-004).
    const areaResult = await pool.query<{ id: number }>(
      "SELECT id FROM areas WHERE slug = $1",
      [areaSlug],
    );

    // If the slug doesn't match any area (unknown slug searched), skip the
    // insert — the FK constraint would reject it anyway.
    if (areaResult.rows.length === 0) return;

    const areaId = areaResult.rows[0]!.id;

    // Random session identifier — 32 hex characters (~128 bits of entropy).
    // crypto.randomUUID() is available in Node 14.17+ and all modern runtimes.
    const sessionId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO search_events
         (session_id, area_id, window_start, window_end, result_count)
       VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5)`,
      [sessionId, areaId, startIso, endIso, resultCount],
    );
  } catch (err) {
    // Analytics must never degrade the search response.
    console.error("[availability] search_events insert failed:", err);
  }
}
