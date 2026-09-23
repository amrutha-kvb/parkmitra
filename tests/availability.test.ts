/**
 * Availability against a REAL database. Not mocked — the half-open window
 * semantics live in Postgres, so mocking would test nothing (plan/test-strategy.md).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pool from "../lib/db";
import { searchAvailability } from "../lib/availability";

const W = (s: string, e: string) => ({ start: s, end: e });
let bayId: number;
let areaSlug: string;

beforeAll(async () => {
  const { rows } = await pool.query(
    `SELECT b.id AS bay_id, a.slug
       FROM bays b JOIN spots s ON s.id=b.spot_id JOIN areas a ON a.id=s.area_id
      ORDER BY b.id LIMIT 1`);
  bayId = rows[0].bay_id;
  areaSlug = rows[0].slug;
  await pool.query(`DELETE FROM bookings`);
});

afterAll(async () => { await pool.query(`DELETE FROM bookings`); await pool.end(); });

async function book(start: string, end: string, status = "confirmed", ref = Math.random().toString(36).slice(2,12).toUpperCase()) {
  await pool.query(
    `INSERT INTO bookings (bay_id,window_at,driver_phone,vehicle_reg,reference_code,amount_paise,status)
     VALUES ($1, tstzrange($2::timestamptz,$3::timestamptz,'[)'), '+919999999999','TS09AB1234',$4,8000,$5)`,
    [bayId, start, end, ref, status]);
}

const countBays = (r: any[], id: number) =>
  r.reduce((n, s) => n + (s.free_bays ?? 0), 0);

describe("availability", () => {
  it("an unbooked bay is offered", async () => {
    const r = await searchAvailability(areaSlug, "2026-09-24T10:00:00+05:30", "2026-09-24T12:00:00+05:30");
    expect(countBays(r, bayId)).toBeGreaterThan(0);
  });

  it("an overlapping booking removes that bay", async () => {
    const before = countBays(await searchAvailability(areaSlug,"2026-09-24T10:00:00+05:30","2026-09-24T12:00:00+05:30"), bayId);
    await book("2026-09-24T10:00:00+05:30", "2026-09-24T12:00:00+05:30");
    const after = countBays(await searchAvailability(areaSlug,"2026-09-24T10:00:00+05:30","2026-09-24T12:00:00+05:30"), bayId);
    expect(after).toBe(before - 1);
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
