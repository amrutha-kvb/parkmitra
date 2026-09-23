import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import pool from "../../../lib/db";
import { computeAmountPaise } from "../../../lib/money";
import { rateLimitGuard } from "../../../lib/rate-limit-guard";

// ---------------------------------------------------------------------------
// Types — mirror the OpenAPI contract exactly (ARCH-002).
// ---------------------------------------------------------------------------

/**
 * Fields accepted from the JSON request body.
 *
 * `amount` is intentionally absent: ADR-003 / openapi.yaml forbid accepting
 * it from the client. Any `amount` key in the body is silently ignored — it
 * is never read from the parsed object.
 */
interface BookingRequestBody {
  bay_id: number;
  start: string;
  end: string;
  driver_phone: string;
  vehicle_reg: string;
  driver_name?: string | null;
}

/** Shape of the `Booking` schema in openapi.yaml (201 success body). */
interface BookingResponse {
  reference_code: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  window: { start: string; end: string };
  amount_paise: number;
  spot_name: string;
  bay_label: string;
  address_line: string;
  arrived_at: string | null;
}

/** Shape of the `Error` schema in openapi.yaml. */
interface ErrorResponse {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------

/**
 * Columns read back from the INSERT … RETURNING join.
 * Named to match the snake_case the database returns.
 */
interface BookingRow {
  reference_code: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  window_start: string;
  window_end: string;
  amount_paise: number;
  spot_name: string;
  bay_label: string;
  address_line: string;
  arrived_at: string | null;
}

/**
 * Minimal shape of the spot + bay row fetched before inserting, used to:
 *   1. Validate that the booking window is within opens_at / closes_at.
 *   2. Read price_per_hour_paise for amount computation.
 */
interface SpotRow {
  spot_id: number;
  price_per_hour_paise: number;
  opens_at: string; // "HH:MM:SS" as returned by pg for a time column
  closes_at: string;
  spot_name: string;
  bay_label: string;
  address_line: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a 400 NextResponse using the OpenAPI Error schema. */
function badRequest(error: string, message: string): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>({ error, message }, { status: 400 });
}

/** Return a 409 NextResponse using the OpenAPI Error schema. */
function conflict(error: string, message: string): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>({ error, message }, { status: 409 });
}

/** Return a 422 NextResponse using the OpenAPI Error schema. */
function unprocessable(
  error: string,
  message: string,
): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>({ error, message }, { status: 422 });
}

/**
 * Parse an ISO 8601 date-time string into a Date.
 * Returns `null` when the string is missing, empty, or produces a NaN timestamp.
 */
function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isFinite(d.getTime()) ? d : null;
}

/**
 * Generate a 10-character Crockford base32 reference code.
 *
 * Crockford alphabet: 0-9 A-H J K M N P-T V-Z (drops I L O U to avoid
 * visual ambiguity). 5 random bytes × 8 bits = 40 bits → 8 base32 chars,
 * so we use 7 bytes (56 bits) and slice to exactly 10 characters.
 *
 * Entropy: 10 chars × log₂(32) = 50 bits — sufficient for ADR-002.
 *
 * This module-level constant is tested independently via the test suite.
 */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateReferenceCode(): string {
  // 8 bytes → 64 bits. We need ceil(10 * 5 / 8) = 7 bytes for 10 base32
  // chars; we draw 8 for a cleaner bit-manipulation loop then slice.
  const bytes = randomBytes(8);

  // Treat the 8 bytes as a big 64-bit integer and extract 10 × 5-bit groups.
  // We work with the two 32-bit halves to stay in safe integer range.
  let hi = (bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!;
  let lo = (bytes[4]! << 24) | (bytes[5]! << 16) | (bytes[6]! << 8) | bytes[7]!;

  // Normalise hi to unsigned 32-bit.
  hi = hi >>> 0;
  lo = lo >>> 0;

  let result = "";
  // Extract 10 groups of 5 bits from the most-significant end.
  for (let i = 0; i < 10; i++) {
    // The top 5 bits of the 64-bit value (hi:lo).
    const idx = (hi >>> 27) & 0x1f; // top 5 bits of hi
    result += CROCKFORD_ALPHABET[idx];
    // Shift the combined 64-bit value left by 5.
    hi = ((hi << 5) | (lo >>> 27)) >>> 0;
    lo = (lo << 5) >>> 0;
  }

  return result;
}

/**
 * Check that a booking window [start, end) lies entirely within the spot's
 * operating hours on both the start date and the end date (the latter for
 * windows that cross midnight at spots with near-24 h hours such as spot 9 in
 * the seed data).
 *
 * `opens_at` and `closes_at` come back from pg as strings like "07:00:00".
 * We construct a Date for each boundary in the **same calendar day as the
 * window boundary being tested**, using the UTC offset already present in
 * the ISO start/end strings so we compare apples-to-apples.
 *
 * @returns true when the window is fully within operating hours; false otherwise.
 */
export function isWithinOpeningHours(
  startIso: string,
  endIso: string,
  opensAt: string,
  closesAt: string,
): boolean {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);

  // Helper: given a Date and a "HH:MM:SS" boundary string, build the Date
  // that represents that time of day in the *local* wall-clock sense implied
  // by the ISO string's UTC offset. We use the ISO string itself to find
  // the date fragment and splice in the boundary time.
  function boundaryDate(ref: Date, timeStr: string): Date {
    // Extract the UTC offset from the original ISO string, e.g. "+05:30".
    // If the string has no offset (ends in Z), treat it as "+00:00".
    const offsetMatch = /([+-]\d{2}:\d{2})$/.exec(startIso);
    const offset = offsetMatch ? offsetMatch[1]! : "+00:00";

    // Format the ref date as YYYY-MM-DD in UTC (pg time columns have no tz).
    // We want the *local* date for the given ref time: convert to local first.
    const [h, m, s] = timeStr.split(":").map(Number) as [
      number,
      number,
      number,
    ];
    // Build an ISO string like "2026-10-01T07:00:00+05:30" then parse it.
    const yyyy = ref.getUTCFullYear();
    const mm = String(ref.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(ref.getUTCDate()).padStart(2, "0");
    const hh = String(h).padStart(2, "0");
    const mi = String(m).padStart(2, "0");
    const ss = String(s ?? 0).padStart(2, "0");
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${offset}`);
  }

  const openOnStartDay = boundaryDate(startDate, opensAt);
  const closeOnStartDay = boundaryDate(startDate, closesAt);
  const closeOnEndDay = boundaryDate(endDate, closesAt);

  // The booking start must be >= opens_at of the start day.
  if (startDate.getTime() < openOnStartDay.getTime()) return false;

  // The booking start must be < closes_at of the start day.
  if (startDate.getTime() >= closeOnStartDay.getTime()) return false;

  // The booking end must be <= closes_at of the end day (half-open: end is
  // exclusive, so end === closeOnEndDay is valid — the bay is released exactly
  // when the spot closes).
  if (endDate.getTime() > closeOnEndDay.getTime()) return false;

  return true;
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/**
 * Fetch the spot that owns `bay_id`, joining through bays → spots.
 * Returns null when the bay does not exist or is not active.
 * Uses a parameterised query; no string concatenation (SEC-004).
 */
const SPOT_LOOKUP_SQL = `
  SELECT
    s.id                    AS spot_id,
    s.price_per_hour_paise  AS price_per_hour_paise,
    s.opens_at::text        AS opens_at,
    s.closes_at::text       AS closes_at,
    s.name                  AS spot_name,
    s.address_line          AS address_line,
    b.label                 AS bay_label
  FROM bays b
  JOIN spots s ON s.id = b.spot_id
  WHERE b.id = $1
    AND b.is_active = true
    AND s.is_active = true
`;

/**
 * Insert a booking and immediately JOIN back the spot/bay data needed for the
 * response — one round-trip to the database.
 *
 * The INSERT uses tstzrange with '[)' (half-open, lower-inclusive / upper-
 * exclusive), matching ADR-001 and the exclusion constraint definition.
 *
 * Parameterised throughout; no string concatenation of user input (SEC-004).
 */
const INSERT_BOOKING_SQL = `
  WITH ins AS (
    INSERT INTO bookings
      (bay_id, window_at, driver_phone, driver_name, vehicle_reg,
       reference_code, amount_paise, status)
    VALUES
      ($1,
       tstzrange($2::timestamptz, $3::timestamptz, '[)'),
       $4, $5, $6, $7, $8,
       'pending')
    RETURNING
      id,
      reference_code,
      status,
      lower(window_at)  AS window_start,
      upper(window_at)  AS window_end,
      amount_paise,
      arrived_at
  )
  SELECT
    ins.reference_code,
    ins.status,
    ins.window_start,
    ins.window_end,
    ins.amount_paise,
    ins.arrived_at,
    s.name          AS spot_name,
    b.label         AS bay_label,
    s.address_line  AS address_line
  FROM ins
  JOIN bays  b ON b.id = $1
  JOIN spots s ON s.id = b.spot_id
`;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/bookings — create a booking for a bay.
 *
 * Request body (application/json):
 *   bay_id        integer  — required
 *   start         string   — ISO 8601 date-time, required
 *   end           string   — ISO 8601 date-time, required
 *   driver_phone  string   — required
 *   vehicle_reg   string   — required
 *   driver_name   string   — optional, may be null
 *   (any `amount` field is silently ignored — ADR-003)
 *
 * Success 201 body  → Booking schema (openapi.yaml)
 * Error 400 body    → Error schema  (malformed / missing fields)
 * Error 409 body    → Error schema  (bay_unavailable — exclusion constraint)
 * Error 422 body    → Error schema  (window outside opens_at / closes_at,
 *                                    or zero / negative duration)
 *
 * @see design/openapi.yaml  →  /bookings  →  POST  →  createBooking
 * @see design/adr/*.md      →  ADR-001 (exclusion constraint), ADR-002
 *                               (reference_code), ADR-003 (money in paise)
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<BookingResponse | ErrorResponse>> {
  // Rate limit before any database work. Scope 'booking' has its own
  // budget so ordinary use of one endpoint cannot lock a visitor out of
  // another (see lib/rate-limit.ts SCOPES).
  const limited = await rateLimitGuard<BookingResponse | ErrorResponse>(request, "booking");
  if (limited) return limited;

  // -------------------------------------------------------------------------
  // 1. Parse the JSON body.
  //    Any `amount` key that arrives in the body is never read (ADR-003).
  // -------------------------------------------------------------------------
  let body: Partial<BookingRequestBody & { amount?: unknown }>;
  try {
    body = (await request.json()) as Partial<
      BookingRequestBody & { amount?: unknown }
    >;
  } catch {
    return badRequest("invalid_json", "Request body must be valid JSON.");
  }

  // -------------------------------------------------------------------------
  // 2. Input validation (SEC-003) — required fields.
  // -------------------------------------------------------------------------
  const { bay_id, start, end, driver_phone, vehicle_reg, driver_name } = body;

  if (bay_id === undefined || bay_id === null) {
    return badRequest("missing_field", "Field 'bay_id' is required.");
  }
  if (!Number.isInteger(bay_id) || bay_id <= 0) {
    return badRequest(
      "invalid_field",
      "'bay_id' must be a positive integer.",
    );
  }

  if (!start) {
    return badRequest("missing_field", "Field 'start' is required.");
  }
  if (!end) {
    return badRequest("missing_field", "Field 'end' is required.");
  }

  if (!driver_phone) {
    return badRequest("missing_field", "Field 'driver_phone' is required.");
  }
  if (!vehicle_reg) {
    return badRequest("missing_field", "Field 'vehicle_reg' is required.");
  }

  // -------------------------------------------------------------------------
  // 3. Timestamp parsing — both values must be valid date-times.
  // -------------------------------------------------------------------------
  const startDate = parseTimestamp(start);
  if (!startDate) {
    return badRequest(
      "invalid_field",
      "'start' is not a valid ISO 8601 date-time.",
    );
  }

  const endDate = parseTimestamp(end);
  if (!endDate) {
    return badRequest(
      "invalid_field",
      "'end' is not a valid ISO 8601 date-time.",
    );
  }

  // -------------------------------------------------------------------------
  // 4. Window ordering — end must be strictly after start (422 per spec).
  // -------------------------------------------------------------------------
  if (endDate.getTime() <= startDate.getTime()) {
    return unprocessable(
      "invalid_window",
      "'end' must be strictly after 'start'.",
    );
  }

  // -------------------------------------------------------------------------
  // 5. Look up the spot that owns this bay — needed for:
  //      a) price_per_hour_paise  (amount computation)
  //      b) opens_at / closes_at  (opening-hours validation)
  //      c) spot_name, bay_label, address_line (response body)
  //
  //    If the bay doesn't exist or is inactive, bail with 400.
  // -------------------------------------------------------------------------
  const spotResult = await pool.query<SpotRow>(SPOT_LOOKUP_SQL, [bay_id]);

  if (spotResult.rows.length === 0) {
    return badRequest(
      "bay_not_found",
      "No active bay found with that bay_id.",
    );
  }

  const spot = spotResult.rows[0]!;

  // -------------------------------------------------------------------------
  // 6. Opening-hours check (422 per spec).
  // -------------------------------------------------------------------------
  if (!isWithinOpeningHours(start, end, spot.opens_at, spot.closes_at)) {
    return unprocessable(
      "outside_opening_hours",
      "The requested window falls outside the spot's opening hours.",
    );
  }

  // -------------------------------------------------------------------------
  // 7. Compute the authoritative amount (ADR-003).
  //    computeAmountPaise rounds up to whole hours.
  // -------------------------------------------------------------------------
  const amount_paise = computeAmountPaise(
    spot.price_per_hour_paise,
    start,
    end,
  );

  // -------------------------------------------------------------------------
  // 8. Generate a 10-character Crockford base32 reference code (ADR-002).
  // -------------------------------------------------------------------------
  const reference_code = generateReferenceCode();

  // -------------------------------------------------------------------------
  // 9. Insert the booking.
  //    On Postgres error code 23P01 (exclusion_violation) the bay was taken
  //    for an overlapping window → 409. All other DB errors propagate.
  // -------------------------------------------------------------------------
  let row: BookingRow;

  try {
    const result = await pool.query<BookingRow>(INSERT_BOOKING_SQL, [
      bay_id,      // $1  bay_id
      start,       // $2  window lower bound
      end,         // $3  window upper bound
      driver_phone, // $4
      driver_name ?? null, // $5  optional
      vehicle_reg, // $6
      reference_code, // $7
      amount_paise,   // $8
    ]);

    row = result.rows[0]!;
  } catch (err: unknown) {
    // 23P01 is the SQLSTATE for exclusion_violation — raised by the GiST
    // exclusion constraint `bookings_no_overlapping_active` (ADR-001).
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23P01"
    ) {
      return conflict(
        "bay_unavailable",
        "That bay was just taken for part of your window.",
      );
    }
    throw err;
  }

  // -------------------------------------------------------------------------
  // 10. Build and return the 201 Booking response (ARCH-002).
  // -------------------------------------------------------------------------
  const responseBody: BookingResponse = {
    reference_code: row.reference_code,
    status: row.status,
    window: {
      start: new Date(row.window_start).toISOString(),
      end: new Date(row.window_end).toISOString(),
    },
    amount_paise: row.amount_paise,
    spot_name: row.spot_name,
    bay_label: row.bay_label,
    address_line: row.address_line,
    arrived_at: row.arrived_at
      ? new Date(row.arrived_at).toISOString()
      : null,
  };

  return NextResponse.json<BookingResponse>(responseBody, { status: 201 });
}
