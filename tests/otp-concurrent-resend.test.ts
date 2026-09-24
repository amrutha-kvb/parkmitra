/**
 * Concurrency proof for OTP resend.
 *
 * The claim: 10 simultaneous createOtp calls for the same booking all
 * succeed (no UNIQUE-violation 500s) and exactly one OTP row survives.
 * The surviving row is verifiable — it belongs to whichever caller
 * committed last.
 *
 * Without the fix (no transaction, no row lock), concurrent resends race
 * through DELETE+INSERT: two INSERTs hit the UNIQUE(booking_id) constraint
 * and one throws, surfacing as a 500 to the driver. With the fix, each
 * caller locks the booking row first, so they serialise: the second waits,
 * then deletes the first's row and inserts its own.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import pool from "../lib/db";
import { createOtp, hashOtp } from "../lib/otp";

const RACERS = 10;

let bookingId: number;

async function cleanup() {
  await pool.query("DELETE FROM phone_otp");
}

beforeAll(async () => {
  const { rows: bayRows } = await pool.query(
    "SELECT id FROM bays ORDER BY id LIMIT 1",
  );
  if (!bayRows.length) throw new Error("seed data missing");
  const bayId = bayRows[0].id;

  const { rows: bookingRows } = await pool.query<{ id: number }>(
    `INSERT INTO bookings
       (bay_id, window_at, driver_phone, vehicle_reg, reference_code, amount_paise, status)
     VALUES ($1, tstzrange('2026-12-02T10:00:00+05:30'::timestamptz,
                           '2026-12-02T12:00:00+05:30'::timestamptz, '[)'),
             '+919999999999', 'TS09AB1234', 'OTPRESEND1', 8000, 'pending')
     RETURNING id`,
    [bayId],
  );
  bookingId = bookingRows[0].id;
});

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.query("DELETE FROM bookings WHERE reference_code = 'OTPRESEND1'");
  await pool.end();
});

describe("OTP concurrent resend", () => {
  it(`${RACERS} simultaneous createOtp calls: all succeed, exactly 1 row survives`, async () => {
    const results = await Promise.allSettled(
      Array.from({ length: RACERS }, () => createOtp(bookingId)),
    );

    // Every call must resolve, not reject. A UNIQUE violation surfacing as
    // a rejected promise is exactly the bug the fix prevents.
    const failures = results.filter((r) => r.status === "rejected");
    expect(failures).toHaveLength(0);

    // Exactly one OTP row must exist.
    const { rows } = await pool.query<{ code_hash: string }>(
      "SELECT code_hash FROM phone_otp WHERE booking_id = $1",
      [bookingId],
    );
    expect(rows).toHaveLength(1);

    // The surviving row must match one of the returned OTP codes.
    const otps = results
      .filter((r): r is PromiseFulfilledResult<{ otp: string; expires_at: Date }> =>
        r.status === "fulfilled",
      )
      .map((r) => r.value.otp);

    const survivingHash = rows[0].code_hash;
    const matchingOtp = otps.find((otp) => hashOtp(otp) === survivingHash);
    expect(matchingOtp).toBeDefined();
  });

  it("surviving OTP is verifiable", async () => {
    // Sequential call so we know the exact code.
    const { otp } = await createOtp(bookingId);

    // Verify it works.
    const { verifyOtp } = await import("../lib/otp");
    const result = await verifyOtp(bookingId, otp);
    expect(result.verified).toBe(true);
  });
});
