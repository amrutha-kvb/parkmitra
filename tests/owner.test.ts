/**
 * Owner query layer against a REAL database. Not mocked — the capability
 * model and the isolation between owners live in the schema, so mocking
 * would test nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pool from "../lib/db";
import { createOwner, findOwnerByToken, listOwnerBookings } from "../lib/owner";

// Two spots in different areas. We need two to prove isolation.
let spotIdA: number;
let spotIdB: number;
let bayIdA: number;
let bayIdB: number;

async function cleanup() {
  await pool.query("TRUNCATE bookings RESTART IDENTITY CASCADE");
  await pool.query("DELETE FROM owners");
}

beforeAll(async () => {
  await cleanup();

  // Pick two spots that have bays — one from the first area, one from the last.
  const { rows } = await pool.query(
    `SELECT s.id AS spot_id, b.id AS bay_id
       FROM spots s
       JOIN bays b ON b.spot_id = s.id AND b.is_active
      WHERE s.is_active
      ORDER BY s.id`,
  );
  if (rows.length < 2) throw new Error("seed data needs at least two spots with bays");
  spotIdA = rows[0].spot_id;
  bayIdA = rows[0].bay_id;
  // Pick the last spot so the two are definitely different.
  spotIdB = rows[rows.length - 1].spot_id;
  bayIdB = rows[rows.length - 1].bay_id;
  if (spotIdA === spotIdB) throw new Error("need two distinct spots");
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("createOwner", () => {
  it("returns an owner row with a 10-char Crockford token", async () => {
    const owner = await createOwner(spotIdA, "+919876543210", "Test Owner A");
    expect(owner.spot_id).toBe(spotIdA);
    expect(owner.owner_token).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(owner.owner_phone).toBe("+919876543210");
    expect(owner.owner_name).toBe("Test Owner A");
    expect(owner.is_active).toBe(true);
  });

  it("accepts null phone and name", async () => {
    const owner = await createOwner(spotIdB, null, null);
    expect(owner.spot_id).toBe(spotIdB);
    expect(owner.owner_phone).toBeNull();
    expect(owner.owner_name).toBeNull();
  });

  it("rejects a second active owner for the same spot", async () => {
    // spotIdA already has an active owner from the first test.
    await expect(createOwner(spotIdA, null, null)).rejects.toThrow();
  });
});

describe("findOwnerByToken", () => {
  it("resolves a valid token to the owner and spot", async () => {
    const { rows } = await pool.query<{ owner_token: string }>(
      "SELECT owner_token FROM owners WHERE spot_id = $1 AND is_active",
      [spotIdA],
    );
    const token = rows[0]!.owner_token;
    const result = await findOwnerByToken(token);
    expect(result).not.toBeNull();
    expect(result!.spot_id).toBe(spotIdA);
    expect(result!.spot_name).toBeTruthy();
    expect(typeof result!.price_per_hour_paise).toBe("number");
    expect(typeof result!.total_bays).toBe("number");
    expect(typeof result!.active_bays).toBe("number");
    expect(result!.active_bays).toBeGreaterThan(0);
  });

  it("returns null for an unknown token", async () => {
    const result = await findOwnerByToken("ZZZZZZZZZZ");
    expect(result).toBeNull();
  });

  it("returns null for a revoked token", async () => {
    const { rows } = await pool.query<{ owner_token: string }>(
      "SELECT owner_token FROM owners WHERE spot_id = $1 AND is_active",
      [spotIdB],
    );
    const token = rows[0]!.owner_token;

    // Revoke it.
    await pool.query(
      "UPDATE owners SET is_active = false WHERE owner_token = $1",
      [token],
    );

    const result = await findOwnerByToken(token);
    expect(result).toBeNull();

    // Re-create so later tests have an active owner for spotIdB.
    await createOwner(spotIdB, null, "Replacement Owner B");
  });
});

describe("listOwnerBookings", () => {
  it("returns bookings for the owner's spot only", async () => {
    // Book on both spots.
    await pool.query(
      `INSERT INTO bookings
         (bay_id, window_at, driver_phone, vehicle_reg, reference_code, amount_paise, status)
       VALUES ($1, tstzrange('2026-10-01T10:00:00+05:30','2026-10-01T12:00:00+05:30','[)'),
               '+919111111111', 'TS01AA0001', 'OWNERTEST1', 5000, 'confirmed')`,
      [bayIdA],
    );
    await pool.query(
      `INSERT INTO bookings
         (bay_id, window_at, driver_phone, vehicle_reg, reference_code, amount_paise, status)
       VALUES ($1, tstzrange('2026-10-01T10:00:00+05:30','2026-10-01T12:00:00+05:30','[)'),
               '+919222222222', 'TS02BB0002', 'OWNERTEST2', 6000, 'confirmed')`,
      [bayIdB],
    );

    const bookingsA = await listOwnerBookings(spotIdA);
    const bookingsB = await listOwnerBookings(spotIdB);

    // Owner A sees only their booking.
    expect(bookingsA.length).toBe(1);
    expect(bookingsA[0]!.reference_code).toBe("OWNERTEST1");
    expect(bookingsA[0]!.driver_phone).toBe("+919111111111");

    // Owner B sees only their booking.
    expect(bookingsB.length).toBe(1);
    expect(bookingsB[0]!.reference_code).toBe("OWNERTEST2");
    expect(bookingsB[0]!.driver_phone).toBe("+919222222222");
  });

  it("excludes cancelled bookings", async () => {
    await pool.query(
      `INSERT INTO bookings
         (bay_id, window_at, driver_phone, vehicle_reg, reference_code, amount_paise, status)
       VALUES ($1, tstzrange('2026-10-02T10:00:00+05:30','2026-10-02T12:00:00+05:30','[)'),
               '+919333333333', 'TS03CC0003', 'OWNERTEST3', 5000, 'cancelled')`,
      [bayIdA],
    );

    const bookings = await listOwnerBookings(spotIdA);
    const codes = bookings.map((b) => b.reference_code);
    expect(codes).not.toContain("OWNERTEST3");
  });

  it("returns an empty array when the spot has no bookings", async () => {
    // Pick a spot that has no bookings by using a fresh cleanup scope.
    const { rows } = await pool.query(
      `SELECT s.id AS spot_id FROM spots s
        WHERE s.id <> $1 AND s.id <> $2 AND s.is_active
        LIMIT 1`,
      [spotIdA, spotIdB],
    );
    const emptySpotId = rows[0]!.spot_id;
    const bookings = await listOwnerBookings(emptySpotId);
    expect(bookings).toEqual([]);
  });
});
