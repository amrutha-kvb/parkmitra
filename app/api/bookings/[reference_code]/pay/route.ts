/**
 * POST /api/bookings/{reference_code}/pay
 *
 * Authorise payment through the configured provider (ADR-005), then
 * atomically record the payment and confirm the booking.
 *
 * The operation:
 *   1. Validates the reference_code path parameter.
 *   2. Looks up the booking — 404 for unknown or malformed code.
 *   3. Rejects with 409 if the booking is already confirmed, cancelled, or
 *      expired (already paid / no longer payable).
 *   4. Calls the payment provider's `authorise` method.
 *   5. In a single transaction:
 *      a. Inserts a row in `payments` with the provider's name and status.
 *      b. Updates `bookings.status` to 'confirmed'.
 *   6. Returns 200 with the updated Booking schema.
 *
 * The transaction guarantees atomicity: a concurrent second pay call will
 * read 'confirmed' status and return 409, never double-inserting a payment.
 *
 * Personal data is NEVER included in an error body (SEC-003).
 * All SQL is fully parameterised — no string concatenation (SEC-004).
 *
 * @see design/openapi.yaml  →  /bookings/{reference_code}/pay  →  POST  →  payBooking
 * @see design/adr/ADR-002.md  (reference_code as authorisation token)
 * @see design/adr/ADR-003.md  (money in integer paise)
 * @see design/adr/ADR-005-payment-provider-seam.md  (provider interface)
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
import { getPaymentProvider } from "../../../../../lib/payments/resolve";

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/**
 * Atomic pay transaction:
 *   1. Lock the booking row for update so a concurrent call waits.
 *   2. Insert a payment row with the provider name from $2.
 *   3. Set booking status to 'confirmed'.
 *   4. Return the updated booking joined with spot/bay display fields.
 *
 * All parameters are positional — no string concatenation (SEC-004).
 * $1 = booking id (integer, internal — never the reference_code in SQL values)
 * $2 = provider name (string from PaymentProvider.name)
 */
const PAY_TRANSACTION_SQL = `
  WITH locked AS (
    SELECT id, amount_paise
    FROM   bookings
    WHERE  id = $1
    FOR UPDATE
  ),
  payment AS (
    INSERT INTO payments (booking_id, amount_paise, provider, status)
    SELECT id, amount_paise, $2, 'paid'
    FROM   locked
    RETURNING booking_id
  ),
  updated AS (
    UPDATE bookings
    SET    status = 'confirmed'
    WHERE  id = (SELECT booking_id FROM payment)
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
 * POST /api/bookings/[reference_code]/pay
 *
 * 200  → Updated Booking schema (status = 'confirmed')
 * 404  → identical body for malformed or unknown reference_code
 * 409  → booking is already confirmed, cancelled, or expired
 * 422  → phone not verified, or payment provider declined the charge
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
  //    We need to check status before entering the transaction so we can
  //    return a clear 409 without starting unnecessary DB work.
  // -------------------------------------------------------------------------
  const row = await findBookingByCode(reference_code);

  if (row === null) {
    return notFound();
  }

  // -------------------------------------------------------------------------
  // 3. Guard: only a 'pending' booking may be paid.
  //    'confirmed' → already paid.
  //    'cancelled' / 'expired' → no longer payable.
  //    All three cases return 409 (openapi.yaml: "Already paid, or the
  //    booking is cancelled or expired").
  // -------------------------------------------------------------------------
  if (row.status !== "pending") {
    return conflict(
      "already_confirmed",
      "This booking has already been paid or is no longer payable.",
    );
  }

  // -------------------------------------------------------------------------
  // 4. Guard: phone must be verified before payment (migration 007).
  // -------------------------------------------------------------------------
  if (!row.phone_verified) {
    return NextResponse.json<ErrorResponse>(
      { error: "phone_not_verified", message: "Verify your phone number before paying." },
      { status: 422 },
    );
  }

  // -------------------------------------------------------------------------
  // 5. Authorise the payment through the configured provider (ADR-005).
  //    The provider is resolved once per cold start via PAYMENT_PROVIDER
  //    env var; defaults to "simulated" when unset.
  // -------------------------------------------------------------------------
  const provider = getPaymentProvider();
  const paymentResult = await provider.authorise({
    reference_code,
    amount_paise: row.amount_paise,
  });

  if (paymentResult.status === "failed") {
    return NextResponse.json<ErrorResponse>(
      { error: "payment_failed", message: "Payment was declined. Please try again." },
      { status: 422 },
    );
  }

  // -------------------------------------------------------------------------
  // 5. Execute the pay transaction atomically.
  //    Uses the internal booking id (never the reference_code as a SQL value)
  //    to avoid any join-key confusion. The CTE locks the row, inserts the
  //    payment with the provider's name, updates the status, and returns the
  //    refreshed booking — all in one round-trip (SEC-004: fully parameterised).
  // -------------------------------------------------------------------------
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{
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
    }>(PAY_TRANSACTION_SQL, [row.id, provider.name]);

    await client.query("COMMIT");

    const updated = result.rows[0]!;
    return NextResponse.json<BookingResponse>(toBookingResponse(updated), {
      status: 200,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
