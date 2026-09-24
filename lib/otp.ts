import { createHash, randomInt } from "crypto";
import pool from "./db";

const OTP_DIGITS = 6;
const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateOtp(): string {
  const max = 10 ** OTP_DIGITS;
  return String(randomInt(max)).padStart(OTP_DIGITS, "0");
}

export interface CreateOtpResult {
  otp: string;
  expires_at: Date;
}

export async function createOtp(bookingId: number): Promise<CreateOtpResult> {
  const otp = generateOtp();
  const code_hash = hashOtp(otp);
  const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the parent booking row so concurrent resends serialise here
    // rather than racing through DELETE+INSERT and hitting the UNIQUE
    // constraint on phone_otp.booking_id.
    await client.query(
      `SELECT id FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId],
    );

    await client.query(
      `DELETE FROM phone_otp WHERE booking_id = $1`,
      [bookingId],
    );

    await client.query(
      `INSERT INTO phone_otp (booking_id, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [bookingId, code_hash, expires_at],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { otp, expires_at };
}

export type VerifyResult =
  | { verified: true }
  | { verified: false; reason: "invalid_otp" };

/**
 * Verify an OTP guess against the stored hash.
 *
 * Attempt counting is atomic: SELECT ... FOR UPDATE locks the row before
 * reading, so concurrent guesses serialise through the lock rather than
 * racing through a read-then-write gap. The CHECK constraint on attempts
 * is a backstop — the application enforces the limit before incrementing,
 * but if a bug bypasses that, Postgres rejects the row rather than storing
 * an illegal count.
 */
export async function verifyOtp(
  bookingId: number,
  guess: string,
): Promise<VerifyResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{
      id: number;
      code_hash: string;
      expires_at: Date;
      attempts: number;
      used: boolean;
    }>(
      `SELECT id, code_hash, expires_at, attempts, used
       FROM phone_otp
       WHERE booking_id = $1
       FOR UPDATE`,
      [bookingId],
    );

    if (rows.length === 0) {
      await client.query("COMMIT");
      return { verified: false, reason: "invalid_otp" };
    }

    const row = rows[0];

    if (row.used || row.attempts >= MAX_ATTEMPTS || row.expires_at <= new Date()) {
      await client.query("COMMIT");
      return { verified: false, reason: "invalid_otp" };
    }

    const guessHash = hashOtp(guess);

    if (guessHash === row.code_hash) {
      await client.query(
        `UPDATE phone_otp SET used = true, attempts = attempts + 1 WHERE id = $1`,
        [row.id],
      );
      await client.query(
        `UPDATE bookings SET phone_verified = true WHERE id = $1`,
        [bookingId],
      );
      await client.query("COMMIT");
      return { verified: true };
    }

    await client.query(
      `UPDATE phone_otp SET attempts = attempts + 1 WHERE id = $1`,
      [row.id],
    );
    await client.query("COMMIT");
    return { verified: false, reason: "invalid_otp" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
