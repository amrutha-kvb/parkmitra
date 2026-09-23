/**
 * The test that proves the product's one promise: a booked bay is yours.
 *
 * This is the failure that only appears under concurrency, so a sequential test
 * would pass against a completely broken implementation. Ten genuinely parallel
 * inserts race for the same bay and the same window; the database must admit
 * exactly one.
 *
 * Correctness here lives in the schema, not in application code (ADR-001) — so
 * this test is also the guard on that decision. Delete the exclusion constraint
 * and it must go red; if it stays green, it was never testing anything.
 *
 * Written by hand rather than through niha: Guardian refused both phrasings
 * needed to ask for it — `../lib/db` as "path_traversal" and the cleanup
 * statement as "sql" (finding F-09, #1027). Declared in field/tool-switches.md.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pool from "../lib/db";

const WINDOW_START = "2026-09-24T18:00:00+05:30";
const WINDOW_END = "2026-09-24T20:00:00+05:30";
const RACERS = 10;

let bayId: number;

async function clearBookings() {
  await pool.query("TRUNCATE bookings RESTART IDENTITY CASCADE");
}

beforeAll(async () => {
  const { rows } = await pool.query("SELECT id FROM bays ORDER BY id LIMIT 1");
  if (!rows.length) throw new Error("seed data missing — run scripts/db-reset.sh");
  bayId = rows[0].id;
  await clearBookings();
});

afterAll(async () => {
  await clearBookings();
  await pool.end();
});

function bookOnce(n: number) {
  // Each racer gets its own reference code; only the window collides.
  return pool.query(
    `INSERT INTO bookings
       (bay_id, window_at, driver_phone, vehicle_reg, reference_code, amount_paise, status)
     VALUES ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'),
             '+919999999999', 'TS09AB1234', $4, 8000, 'confirmed')`,
    [bayId, WINDOW_START, WINDOW_END, `RACER${String(n).padStart(5, "0")}`],
  );
}

describe("the booking guarantee, under concurrency", () => {
  it(`admits exactly one of ${RACERS} simultaneous bookings for the same bay and window`, async () => {
    const results = await Promise.allSettled(
      Array.from({ length: RACERS }, (_, i) => bookOnce(i + 1)),
    );

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(RACERS - 1);

    // Every loser must lose for the RIGHT reason. A deadlock or a timeout would
    // also produce nine rejections while meaning something entirely different.
    for (const l of lost) {
      expect(l.reason.code).toBe("23P01"); // exclusion_violation
    }

    // And the database agrees there is exactly one.
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM bookings WHERE bay_id = $1",
      [bayId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("allows a back-to-back booking starting exactly when the first ends", async () => {
    // Half-open [start, end): 20:00 does not overlap a window ending at 20:00.
    // If this fails, every handover minute becomes a false conflict.
    await expect(
      pool.query(
        `INSERT INTO bookings
           (bay_id, window_at, driver_phone, vehicle_reg, reference_code, amount_paise, status)
         VALUES ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'),
                 '+919999999999', 'TS09AB1234', 'ADJACENT01', 8000, 'confirmed')`,
        [bayId, WINDOW_END, "2026-09-24T22:00:00+05:30"],
      ),
    ).resolves.toBeDefined();
  });
});
