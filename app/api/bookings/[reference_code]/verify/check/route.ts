/**
 * POST /api/bookings/{reference_code}/verify/check
 *
 * Verify a 6-digit OTP code. The OTP is looked up by booking_id (never by
 * phone number), and the response is identical for unknown bookings and
 * failed verifications — no oracle.
 *
 * Request body: { "code": "482917" }
 *
 * 200  → { verified: true }   — correct code, booking now phone_verified
 * 200  → { verified: false }  — wrong code, expired, max attempts, or
 *                                booking not found (indistinguishable)
 * 400  → missing or malformed code field
 * 429  → rate limited
 *
 * Personal data is NEVER included in a response body (SEC-003).
 * All SQL is fully parameterised (SEC-004).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isValidReferenceCode,
  findBookingByCode,
  type ErrorResponse,
} from "../../../../../../lib/booking-lookup";
import { rateLimitGuard } from "../../../../../../lib/rate-limit-guard";
import { verifyOtp } from "../../../../../../lib/otp";

interface CheckResponse {
  verified: boolean;
}

const FAILED_BODY: CheckResponse = { verified: false };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference_code: string }> },
): Promise<NextResponse<CheckResponse | ErrorResponse>> {
  const limited = await rateLimitGuard<CheckResponse | ErrorResponse>(request, "verify");
  if (limited) return limited;

  const { reference_code } = await params;

  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json<ErrorResponse>(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const { code } = body;

  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return NextResponse.json<ErrorResponse>(
      { error: "invalid_field", message: "'code' must be a 6-digit string." },
      { status: 400 },
    );
  }

  if (!isValidReferenceCode(reference_code)) {
    return NextResponse.json<CheckResponse>(FAILED_BODY, { status: 200 });
  }

  const row = await findBookingByCode(reference_code);

  if (row === null) {
    return NextResponse.json<CheckResponse>(FAILED_BODY, { status: 200 });
  }

  const result = await verifyOtp(row.id, code);

  return NextResponse.json<CheckResponse>(
    { verified: result.verified },
    { status: 200 },
  );
}
