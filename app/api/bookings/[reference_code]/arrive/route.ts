/**
 * POST /api/bookings/{reference_code}/arrive
 *
 * Driver marks arrival (openapi.yaml markArrival).
 * This is the north-star metric signal (discovery/metrics.md).
 *
 * Behaviour:
 *   1. Validates the reference_code path parameter.
 *   2. Looks up the booking — 404 for unknown or malformed code.
 *   3. Rejects with 409 if the booking is not 'confirmed'.
 *   4. Sets arrived_at = now() if not already set.
 *   5. Returns 200 with the Booking schema — idempotent: a second call when
 *      arrived_at is already set simply returns 200 with the unchanged row
 *      (the original timestamp is preserved).
 *
 * Idempotency detail:
 *   The UPDATE uses "SET arrived_at = COALESCE(arrived_at, now())" so a
 *   repeated call is a no-op on the timestamp value.  The route always
 *   returns 200, not an error, on a repeat call (openapi.yaml: "idempotent
 *   so a second call returns 200 not an error").
 *
 * The openapi.yaml spec lists a 409 for "arrival is already recorded".
 * That 409 is NOT raised here — repeated calls for a confirmed booking are
 * accepted (200).  The 409 is only for a non-confirmed booking status.
 *
 * Personal data is NEVER included in an error body (SEC-003).
 * All SQL is fully parameterised — no string concatenation (SEC-004).
 *
 * @see design/openapi.yaml  →  /bookings/{reference_code}/arrive  →  POST  →  markArrival
 * @see discovery/metrics.md  (arrival as the north-star signal)
 */

import { NextRequest, NextResponse } from "next/server";
import pool from "../../../../../lib/db";
import {
  isValidReferenceCode,
  findBookingByCode,
  toBookingResponse,
  notFound,
  conflict,
  BookingResponse,
  ErrorResponse,
} from "../../../../../lib/booking-lookup";
import { rateLimitGuard } from "../../../../../lib/rate-limit-guard";

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/**
 * Mark a booking as arrived.
 *
 * COALESCE(arrived_at, now()) preserves the original timestamp on repeated
 * calls, making the operation idempotent.
 *
 * Returns the updated booking joined with spot/bay display fields.
 * $1 = booking id (integer, internal)
 *
 * Fully parameterised — no string concatenation (SEC-004).
 */
const ARRIVE_SQL = `
  WITH updated AS (
    UPDATE bookings
    SET    arrived_at = COALESCE(arrived_at, now())
    WHERE  id = $1
    RETURNING
      id,
      reference_code,
      status,
      lower(window_at)::text  AS window_start,
      upper(window_at)::text  AS window_end,
      amount_paise,
      arrived_at::text        AS arrived_at,
      phone_verified,
      bay_id
  )
  SELECT
    u.id,
    u.reference_code,
    u.status,
    u.window_start,
    u.window_end,
    u.amount_paise,
    u.arrived_at,
    u.phone_verified,
    s.name         AS spot_name,
    b.label        AS bay_label,
    s.address_line AS address_line
  FROM updated u
  JOIN bays  b ON b.id = u.bay_id
  JOIN spots s ON s.id = b.spot_id
`;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/bookings/[reference_code]/arrive
 *
 * 200  → Booking schema (arrived_at is set; idempotent on repeat)
 * 404  → identical body for malformed or unknown reference_code
 * 409  → booking status is not 'confirmed'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference_code: string }> },
): Promise<NextResponse<BookingResponse | ErrorResponse>> {
  // Mutating an existing booking. Scope 'mutate' (lib/rate-limit.ts).
  const limited = await rateLimitGuard<BookingResponse | ErrorResponse>(request, "mutate");
  if (limited) return limited;

  const { reference_code } = await params;

  // -------------------------------------------------------------------------
  // 1. Validate the reference_code pattern (SEC-003).
  //    Malformed code → same 404 as unknown code (openapi.yaml).
  // -------------------------------------------------------------------------
  if (!isValidReferenceCode(reference_code)) {
    return notFound();
  }

  // -------------------------------------------------------------------------
  // 2. Look up the current booking state.
  // -------------------------------------------------------------------------
  const row = await findBookingByCode(reference_code);

  if (row === null) {
    return notFound();
  }

  // -------------------------------------------------------------------------
  // 3. Guard: arrival can only be recorded against a confirmed booking.
  //    'pending' → not yet paid; 'cancelled' / 'expired' → terminal states.
  //    Returns 409 for all non-confirmed statuses (openapi.yaml).
  // -------------------------------------------------------------------------
  if (row.status !== "confirmed") {
    return conflict(
      "not_confirmed",
      "Arrival can only be recorded for a confirmed booking.",
    );
  }

  // -------------------------------------------------------------------------
  // 4. Update arrived_at idempotently.
  //    COALESCE preserves the original timestamp if already set, so a second
  //    call is a no-op and still returns 200 with the same body (openapi.yaml:
  //    "idempotent so a second call returns 200 not an error").
  //    No transaction wrapper needed: a single UPDATE is atomic in Postgres.
  // -------------------------------------------------------------------------
  const result = await pool.query<{
    id: number;
    reference_code: string;
    status: "pending" | "confirmed" | "cancelled" | "expired";
    window_start: string;
    window_end: string;
    amount_paise: number;
    arrived_at: string | null;
    phone_verified: boolean;
    spot_name: string;
    bay_label: string;
    address_line: string;
  }>(ARRIVE_SQL, [row.id]);

  const updated = result.rows[0]!;

  // -------------------------------------------------------------------------
  // 5. Return 200 with the Booking schema (ARCH-002).
  //    toBookingResponse normalises timestamptz strings to ISO 8601 UTC.
  // -------------------------------------------------------------------------
  return NextResponse.json<BookingResponse>(toBookingResponse(updated), {
    status: 200,
  });
}
