/**
 * Shared helpers for the three /bookings/{reference_code} route handlers.
 *
 * Responsibilities:
 *   - Validate the reference_code path parameter (SEC-003).
 *   - Fetch a booking row by reference_code (SEC-004: fully parameterised SQL).
 *   - Shape the raw DB row into the Booking response schema (ARCH-002).
 *   - Expose a single `notFound()` factory so all three handlers return an
 *     IDENTICAL 404 body regardless of whether the code never existed or is
 *     simply malformed (openapi.yaml: "Deliberately identical whether the
 *     code never existed or simply is not yours").
 *
 * Nothing in this module leaks personal data into error bodies (SEC-003,
 * openapi.yaml Error schema).
 */

import { NextResponse } from "next/server";
import pool from "./db";

// ---------------------------------------------------------------------------
// Public types — mirror the OpenAPI schemas exactly (ARCH-002).
// ---------------------------------------------------------------------------

/** The Booking schema as defined in openapi.yaml. */
export interface BookingResponse {
  reference_code: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  window: { start: string; end: string };
  amount_paise: number;
  spot_name: string;
  bay_label: string;
  address_line: string;
  arrived_at: string | null;
}

/** The Error schema as defined in openapi.yaml. */
export interface ErrorResponse {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Internal DB row type
// ---------------------------------------------------------------------------

/**
 * Columns returned by BOOKING_BY_CODE_SQL.
 * Named in snake_case as pg returns them.
 */
export interface BookingRow {
  id: number;
  reference_code: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  window_start: string;
  window_end: string;
  amount_paise: number;
  spot_name: string;
  bay_label: string;
  address_line: string;
  arrived_at: string | null;
  phone_verified: boolean;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Pattern from openapi.yaml:
 *   ^[0-9A-HJKMNP-TV-Z]{10}$
 *
 * Crockford base32: digits 0–9 and letters A–Z minus I, L, O, U.
 */
const REFERENCE_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/**
 * Returns true when `code` matches the openapi.yaml pattern.
 * Used by every route handler before touching the database.
 */
export function isValidReferenceCode(code: string): boolean {
  return REFERENCE_CODE_RE.test(code);
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/**
 * Fetch a booking by reference_code, joining bays and spots for the display
 * fields required by the Booking response schema.
 *
 * Fully parameterised — no string concatenation of user input (SEC-004).
 */
const BOOKING_BY_CODE_SQL = `
  SELECT
    bk.id                       AS id,
    bk.reference_code           AS reference_code,
    bk.status                   AS status,
    lower(bk.window_at)::text   AS window_start,
    upper(bk.window_at)::text   AS window_end,
    bk.amount_paise             AS amount_paise,
    bk.arrived_at::text         AS arrived_at,
    bk.phone_verified           AS phone_verified,
    s.name                      AS spot_name,
    b.label                     AS bay_label,
    s.address_line              AS address_line
  FROM bookings bk
  JOIN bays  b ON b.id = bk.bay_id
  JOIN spots s ON s.id = b.spot_id
  WHERE bk.reference_code = $1
`;

/**
 * Look up a booking by its reference_code.
 *
 * Returns the raw `BookingRow` when found, or `null` when no row matches.
 * The caller decides how to respond to null (always 404, whether the code
 * never existed or was malformed — the two must be indistinguishable).
 *
 * @param code  The reference_code path parameter (already validated).
 */
export async function findBookingByCode(
  code: string,
): Promise<BookingRow | null> {
  const result = await pool.query<BookingRow>(BOOKING_BY_CODE_SQL, [code]);
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

/**
 * The single canonical 404 body for all /bookings/{reference_code} routes.
 *
 * Identical whether the code never existed or is syntactically malformed —
 * distinguishing them would confirm valid codes to an attacker (openapi.yaml,
 * getBooking 404 description).
 *
 * No personal data, no internal state. (SEC-003)
 */
export function notFound(): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>(
    { error: "booking_not_found", message: "No booking found for that code." },
    { status: 404 },
  );
}

/**
 * Build a 409 Conflict response using the OpenAPI Error schema.
 * Used by /pay (already confirmed) and /arrive (not confirmed).
 */
export function conflict(
  error: string,
  message: string,
): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>({ error, message }, { status: 409 });
}

/**
 * Shape a raw `BookingRow` into the typed `BookingResponse` schema.
 *
 * The pg driver returns timestamptz columns as ISO strings; we normalise them
 * to strict UTC ISO 8601 via `new Date(...).toISOString()` so the response
 * format is consistent regardless of the server's local timezone.
 */
export function toBookingResponse(row: BookingRow): BookingResponse {
  return {
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
    arrived_at: row.arrived_at ? new Date(row.arrived_at).toISOString() : null,
  };
}
