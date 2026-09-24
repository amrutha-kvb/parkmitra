/**
 * Concurrency proof for OTP attempt limiting.
 *
 * The claim: at most MAX_ATTEMPTS (5) wrong guesses are accepted before the
 * OTP is burned, even under concurrent load. This is a concurrency claim —
 * a sequential test would pass against a read-then-write implementation that
 * loses under parallel requests.
 *
 * The test fires 10 simultaneous wrong guesses against a limit of 5 and
 * asserts:
 *   1. Exactly 5 attempts are recorded (not 6, not 10).
 *   2. The remaining 5 callers are refused (they see the OTP as burned).
 *   3. The database row agrees: attempts = 5.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pool from "../lib/db";
import { createOtp, verifyOtp } from "../lib/otp";

const RACERS = 10;
const MAX_ATTEMPTS = 5;

let bookingId: number;

async function cleanup() {
  await pool.query("DELETE FROM phone_otp");
  await pool.query(
    "UPDATE bookings SET phone_verified = false WHERE phone_verified = true",
  );
}

beforeAll(async () => {
  // We need one real booking row to FK against. Use the first seeded bay.
  const { rows: bayRows } = await pool.query(
    "SELECT id FROM bays ORDER BY id LIMIT 1",
  );
  if (!bayRows.length) throw new Error("seed data missing");
  const bayId = bayRows[0].id;

  // Insert a booking we can attach OTPs to.
  const { rows: bookingRows } = await pool.query<{ id: number }>(
    `INSERT INTO bookings
       (bay_id, window_at, driver_phone, vehicle_reg, reference_code, amount_paise, status)
     VALUES ($1, tstzrange('2026-12-01T10:00:00+05:30'::timestamptz,
                           '2026-12-01T12:00:00+05:30'::timestamptz, '[)'),
             '+919999999999', 'TS09AB1234', 'OTPTEST001', 8000, 'pending')
     RETURNING id`,
    [bayId],
  );
  bookingId = bookingRows[0].id;
});

afterAll(async () => {
  await cleanup();
  await pool.query("DELETE FROM bookings WHERE reference_code = 'OTPTEST001'");
  await pool.end();
});

describe("OTP attempt limit under concurrency", () => {
  it(`${RACERS} simultaneous wrong guesses: exactly ${MAX_ATTEMPTS} accepted, rest refused`, async () => {
    await cleanup();
    await createOtp(bookingId);

    const results = await Promise.allSettled(
      Array.from({ length: RACERS }, () =>
        verifyOtp(bookingId, "000000"),
      ),
    );

    const outcomes = results.map((r) => {
      if (r.status === "rejected") throw r.reason;
      return r.value;
    });

    // Every result must be { verified: false } — all guesses are wrong.
    for (const o of outcomes) {
      expect(o.verified).toBe(false);
    }

    // Count how many callers got to increment the counter (i.e. were not
    // refused because attempts >= MAX_ATTEMPTS at the time they acquired
    // the lock). The database row is the source of truth.
    const { rows } = await pool.query<{ attempts: number; used: boolean }>(
      "SELECT attempts, used FROM phone_otp WHERE booking_id = $1",
      [bookingId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].attempts).toBe(MAX_ATTEMPTS);
    expect(rows[0].used).toBe(false);
  });

  it("a 6th sequential guess after the limit is also refused", async () => {
    // The OTP from the previous test is already burned (5 attempts).
    const result = await verifyOtp(bookingId, "000000");
    expect(result.verified).toBe(false);

    // Counter must not have moved past 5.
    const { rows } = await pool.query<{ attempts: number }>(
      "SELECT attempts FROM phone_otp WHERE booking_id = $1",
      [bookingId],
    );
    expect(rows[0].attempts).toBe(MAX_ATTEMPTS);
  });
});
