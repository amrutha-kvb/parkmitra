/**
 * Availability against a REAL database. Not mocked — the half-open window
 * semantics live in Postgres, so mocking would test nothing (plan/test-strategy.md).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pool from "../lib/db";
import { searchAvailability } from "../lib/availability";

const W = (s: string, e: string) => ({ start: s, end: e });

/**
 * TRUNCATE ... CASCADE, not DELETE.
 *
 * `DELETE FROM bookings` fails the moment any booking has a payment row:
 *
 *   error: update or delete on table "bookings" violates foreign key
 *   constraint "payments_booking_id_fkey" on table "payments"
 *
 * Nothing in this file creates payments, so it passed against a database that
 * had only ever run this suite — and failed against one where anybody had
 * actually paid for a booking through the app or the e2e suite. That is the
 * worst shape of test bug: green in the place you run it, red for the next
 * person, and pointing at availability when the fault is the cleanup.
 *
 * Found by the fresh-clone check before v1.0.0.
 */
async function clearBookings() {
  await pool.query("TRUNCATE bookings RESTART IDENTITY CASCADE");
}
let bayId: number;
let areaSlug: string;

let bayLabel: string;

beforeAll(async () => {
  const { rows } = await pool.query(
    `SELECT b.id AS bay_id, b.label, a.slug
       FROM bays b JOIN spots s ON s.id=b.spot_id JOIN areas a ON a.id=s.area_id
      ORDER BY b.id LIMIT 1`);
  bayId = Number(rows[0].bay_id);
  bayLabel = rows[0].label;
  areaSlug = rows[0].slug;
  await clearBookings();
});

afterAll(async () => { await clearBookings(); await pool.end(); });

async function book(start: string, end: string, status = "confirmed", ref = Math.random().toString(36).slice(2,12).toUpperCase()) {
  await pool.query(
    `INSERT INTO bookings (bay_id,window_at,driver_phone,vehicle_reg,reference_code,amount_paise,status)
     VALUES ($1, tstzrange($2::timestamptz,$3::timestamptz,'[)'), '+919999999999','TS09AB1234',$4,8000,$5)`,
    [bayId, start, end, ref, status]);
}

const countBays = (r: any[], id: number) =>
  r.reduce((n, s) => n + (s.free_bays ?? 0), 0);

/** Find the spot containing bayId and return its bays array (or []). */
const findBaysArray = (r: any[], targetBayId: number): any[] => {
  for (const s of r) {
    if (Array.isArray(s.bays) && s.bays.some((b: any) => b.bay_id === targetBayId)) {
      return s.bays;
    }
  }
  return [];
};

describe("availability", () => {
  it("an unbooked bay is offered", async () => {
    const r = await searchAvailability(areaSlug, "2026-09-24T10:00:00+05:30", "2026-09-24T12:00:00+05:30");
    expect(countBays(r, bayId)).toBeGreaterThan(0);
  });

  it("each spot result carries a bays array with bay_id and label", async () => {
    const r = await searchAvailability(areaSlug, "2026-09-24T10:00:00+05:30", "2026-09-24T12:00:00+05:30");
    const bays = findBaysArray(r, bayId);
    expect(bays.length).toBeGreaterThan(0);
    for (const b of bays) {
      expect(typeof b.bay_id).toBe("number");
      expect(typeof b.label).toBe("string");
      expect(b.label.length).toBeGreaterThan(0);
    }
  });

  it("bays array is ordered by label", async () => {
    const r = await searchAvailability(areaSlug, "2026-09-24T10:00:00+05:30", "2026-09-24T12:00:00+05:30");
    for (const spot of r) {
      const labels: string[] = spot.bays.map((b: any) => b.label);
      const sorted = [...labels].sort();
      expect(labels).toEqual(sorted);
    }
  });

  it("bays array length equals free_bays count", async () => {
    const r = await searchAvailability(areaSlug, "2026-09-24T10:00:00+05:30", "2026-09-24T12:00:00+05:30");
    for (const spot of r) {
      expect(spot.bays.length).toBe(spot.free_bays);
    }
  });

  it("an overlapping booking removes that bay", async () => {
    const before = countBays(await searchAvailability(areaSlug,"2026-09-24T10:00:00+05:30","2026-09-24T12:00:00+05:30"), bayId);
    await book("2026-09-24T10:00:00+05:30", "2026-09-24T12:00:00+05:30");
    const afterResults = await searchAvailability(areaSlug,"2026-09-24T10:00:00+05:30","2026-09-24T12:00:00+05:30");
    const after = countBays(afterResults, bayId);
    expect(after).toBe(before - 1);
    // The booked bay must not appear in the bays array either.
    const bays = findBaysArray(afterResults, bayId);
    expect(bays.every((b: any) => b.bay_id !== bayId)).toBe(true);
  });

  it("HALF-OPEN: a bay booked 10:00-12:00 is still free for 12:00-14:00", async () => {
    const r = await searchAvailability(areaSlug, "2026-09-24T12:00:00+05:30", "2026-09-24T14:00:00+05:30");
    const total = countBays(r, bayId);
    await pool.query(`DELETE FROM bookings`);
    const baseline = countBays(await searchAvailability(areaSlug,"2026-09-24T12:00:00+05:30","2026-09-24T14:00:00+05:30"), bayId);
    expect(total).toBe(baseline);
  });

  it("a cancelled booking does not block the bay", async () => {
    await pool.query(`DELETE FROM bookings`);
    const baseline = countBays(await searchAvailability(areaSlug,"2026-09-24T10:00:00+05:30","2026-09-24T12:00:00+05:30"), bayId);
    await book("2026-09-24T10:00:00+05:30","2026-09-24T12:00:00+05:30","cancelled");
    const after = countBays(await searchAvailability(areaSlug,"2026-09-24T10:00:00+05:30","2026-09-24T12:00:00+05:30"), bayId);
    expect(after).toBe(baseline);
  });
});
