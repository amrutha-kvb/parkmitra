/**
 * GET /api/bookings/{reference_code}
 *
 * Reads a booking by its reference_code.  The code is the authorisation —
 * there is no other read path (ADR-002, openapi.yaml getBooking).
 *
 * Security contract (openapi.yaml 404 description):
 *   The 404 body is IDENTICAL whether the code never existed or is
 *   syntactically malformed.  Distinguishing them would confirm valid codes
 *   to an attacker guessing by enumeration.  Both cases call `notFound()`.
 *
 * Personal data is NEVER included in an error body (SEC-003, openapi.yaml
 * Error schema description).
 *
 * @see design/openapi.yaml  →  /bookings/{reference_code}  →  GET  →  getBooking
 * @see design/adr/ADR-002.md  (reference_code as authorisation token)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isValidReferenceCode,
  findBookingByCode,
  toBookingResponse,
  notFound,
  BookingResponse,
  ErrorResponse,
} from "../../../../lib/booking-lookup";
import { checkRateLimit } from "../../../../lib/rate-limit";

/**
 * GET /api/bookings/[reference_code]
 *
 * 200  → Booking schema (openapi.yaml)
 * 404  → Error schema — identical for malformed and unknown codes
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reference_code: string }> },
): Promise<NextResponse<BookingResponse | ErrorResponse>> {
  const { reference_code } = await params;

  // -------------------------------------------------------------------------
  // 0. Rate-limit by client IP (threat-model T1, defence in depth).
  // -------------------------------------------------------------------------
  const ip = _request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? "127.0.0.1";
  try {
    const limit = await checkRateLimit(ip);
    if (!limit.allowed) {
      return NextResponse.json<ErrorResponse>(
        { error: "rate_limited", message: "Too many requests. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }
  } catch (err) {
    // Fail open: the rate limiter is defence in depth, not the barrier
    // (entropy is), so a limiter outage must not take down the lookup.
    //
    // Log the TYPE, never the error object. SEC-001: a pg error can carry the
    // connection string, and this is a server log that may be shipped
    // elsewhere. app/api/health/route.ts swallows errors entirely for the same
    // reason; the operator signal here is that it happened at all.
    console.error(
      "rate-limit check failed, proceeding without throttling:",
      err instanceof Error ? err.name : "unknown error",
    );
  }

  // -------------------------------------------------------------------------
  // 1. Validate the reference_code pattern (SEC-003).
  //    A malformed code returns the same 404 as an unknown code — no
  //    information is leaked about which codes exist (openapi.yaml).
  // -------------------------------------------------------------------------
  if (!isValidReferenceCode(reference_code)) {
    return notFound();
  }

  // -------------------------------------------------------------------------
  // 2. Fetch the booking. Returns null when no row matches.
  //    Fully parameterised query — no string concatenation (SEC-004).
  // -------------------------------------------------------------------------
  const row = await findBookingByCode(reference_code);

  if (row === null) {
    return notFound();
  }

  // -------------------------------------------------------------------------
  // 3. Shape and return the Booking schema (ARCH-002).
  //    toBookingResponse normalises timestamptz strings to ISO 8601 UTC.
  //    No personal data (driver_phone, driver_name, vehicle_reg) is included.
  // -------------------------------------------------------------------------
  return NextResponse.json<BookingResponse>(toBookingResponse(row), {
    status: 200,
  });
}
