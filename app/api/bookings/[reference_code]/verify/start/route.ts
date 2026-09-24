/**
 * POST /api/bookings/{reference_code}/verify/start
 *
 * Send an OTP to the phone number on the booking. The phone is read from
 * the booking row on the server side — it is NEVER accepted as a request
 * parameter. This prevents the phone-number oracle attack (ADR-002,
 * threat model T1).
 *
 * The response is deliberately identical whether the booking exists or not.
 * A known reference_code and an unknown one produce byte-identical 200
 * bodies so an attacker cannot use this endpoint to confirm valid codes.
 *
 * In non-production environments a `_dev_code` field is included in EVERY
 * response (known and unknown bookings alike) so the e2e suite can complete
 * the OTP flow without an SMS provider. The field is a random 6-digit
 * string for unknown bookings and the real OTP for known ones — structurally
 * identical, so indistinguishability holds.
 *
 * Personal data is NEVER included in an error body (SEC-003).
 * All SQL is fully parameterised (SEC-004).
 */

import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import {
  isValidReferenceCode,
  findBookingByCode,
  type ErrorResponse,
} from "../../../../../../lib/booking-lookup";
import { rateLimitGuard } from "../../../../../../lib/rate-limit-guard";
import { createOtp } from "../../../../../../lib/otp";

interface StartResponse {
  message: string;
  _dev_code?: string;
}

const IS_DEV = process.env.NODE_ENV !== "production";

function randomDevCode(): string {
  return String(randomInt(1_000_000)).padStart(6, "0");
}

function buildResponse(devCode: string): StartResponse {
  const body: StartResponse = {
    message: "If this booking exists, a verification code has been sent.",
  };
  if (IS_DEV) body._dev_code = devCode;
  return body;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reference_code: string }> },
): Promise<NextResponse<StartResponse | ErrorResponse>> {
  const limited = await rateLimitGuard<StartResponse | ErrorResponse>(request, "verify");
  if (limited) return limited;

  const { reference_code } = await params;

  if (!isValidReferenceCode(reference_code)) {
    return NextResponse.json<StartResponse>(buildResponse(randomDevCode()), { status: 200 });
  }

  const row = await findBookingByCode(reference_code);

  if (row === null) {
    return NextResponse.json<StartResponse>(buildResponse(randomDevCode()), { status: 200 });
  }

  if (row.status === "cancelled") {
    return NextResponse.json<StartResponse>(buildResponse(randomDevCode()), { status: 200 });
  }

  const { otp } = await createOtp(row.id);

  return NextResponse.json<StartResponse>(buildResponse(otp), { status: 200 });
}
