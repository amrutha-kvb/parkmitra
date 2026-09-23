/**
 * Tests for lib/availability.ts
 *
 * Strategy: mock the pg Pool so every test runs without a real database while
 * still exercising all observable contracts:
 *
 *   1. SQL structure — the correct parameterised query is issued with the
 *      right three arguments in the right order.
 *   2. Return shape — the mapped result matches SpotAvailability / openapi.yaml
 *      exactly (all required fields present, correct types).
 *   3. estimated_total_paise — computed by computeAmountPaise (round-up hours),
 *      NOT accepted from the DB row.
 *   4. Empty result — a valid, zero-length array when no spots qualify.
 *   5. Half-open window invariant — verified by checking the tstzrange('[)')
 *      literal in the query string.
 *   6. Single-query invariant — pool.query is called exactly once per
 *      searchAvailability invocation.
 *   7. DB errors propagate — a pool rejection rejects the caller's promise.
 *   8. free_bays ≥ 1 — any row returned from DB is mapped faithfully; the
 *      HAVING clause in SQL enforces the minimum, so we test that the mapper
 *      does not silently alter the count.
 *   9. kind union — all five spot kinds round-trip correctly.
 *  10. Multi-spot result — multiple rows are all mapped and returned.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock lib/db.ts BEFORE importing the module under test.
//
// vi.mock() is hoisted to the top of the file by vitest's transformer, which
// means its factory runs before any `const` declarations in this module.  To
// share the spy between the factory and the test body we must also hoist the
// spy declaration with vi.hoisted() — that runs in the same hoisted zone.
// ---------------------------------------------------------------------------
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../db.js", () => ({
  default: { query: mockQuery },
}));

// Now import the module under test (pool mock is already in place).
import { searchAvailability, type SpotAvailability } from "../availability.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake DB row the way pg would return it. */
function makeDbRow(overrides: Partial<{
  spot_id: number;
  name: string;
  kind: SpotAvailability["kind"];
  address_line: string;
  lat: number;
  lng: number;
  price_per_hour_paise: number;
  free_bays: number;
}> = {}) {
  return {
    spot_id: 6,
    name: "Axiom Business Centre",
    kind: "office" as SpotAvailability["kind"],
    address_line: "Axiom Business Centre, Survey No 48, Gachibowli",
    lat: 17.437,
    lng: 78.3502,
    price_per_hour_paise: 4000,
    free_bays: 3,
    ...overrides,
  };
}

/** Wrap a row array in the shape pg's QueryResult uses. */
const pgResult = (rows: ReturnType<typeof makeDbRow>[]) => ({ rows });

// Canonical window used in most tests — 2 hours, so billing is clean.
const START = "2026-10-01T10:00:00+05:30";
const END = "2026-10-01T12:00:00+05:30";
const SLUG = "gachibowli";

// ---------------------------------------------------------------------------
// Reset spy state between tests.
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockQuery.mockReset();
});

// ---------------------------------------------------------------------------
// 1. SQL structure and parameter binding
// ---------------------------------------------------------------------------
describe("SQL query structure", () => {
  it("calls pool.query exactly once", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([]));
    await searchAvailability(SLUG, START, END);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("passes areaSlug as $1, startIso as $2, endIso as $3", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([]));
    await searchAvailability(SLUG, START, END);

    const [_sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([SLUG, START, END]);
  });

  it("uses a half-open range literal '[)' in the query", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([]));
    await searchAvailability(SLUG, START, END);

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    // The tstzrange third argument '[)' is what makes the window half-open.
    expect(sql).toContain("'[)'");
  });

  it("uses the && operator for overlap detection", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([]));
    await searchAvailability(SLUG, START, END);

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("&&");
  });

  it("filters out cancelled bookings in the query", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([]));
    await searchAvailability(SLUG, START, END);

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("cancelled");
  });

  it("references is_active for spots in the query", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([]));
    await searchAvailability(SLUG, START, END);

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("is_active");
  });

  it("does not interpolate user input into the SQL string (SEC-004)", async () => {
    const maliciousSlug = "'; DROP TABLE spots; --";
    mockQuery.mockResolvedValueOnce(pgResult([]));
    await searchAvailability(maliciousSlug, START, END);

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    // The slug must not appear in the SQL text — it travels as a parameter.
    expect(sql).not.toContain(maliciousSlug);
  });
});

// ---------------------------------------------------------------------------
// 2. Return shape — exact match to SpotAvailability / openapi.yaml
// ---------------------------------------------------------------------------
describe("return shape", () => {
  it("maps all required SpotAvailability fields from the DB row", async () => {
    const row = makeDbRow();
    mockQuery.mockResolvedValueOnce(pgResult([row]));
    const results = await searchAvailability(SLUG, START, END);

    expect(results).toHaveLength(1);
    const spot = results[0]!;

    // Every required field from the OpenAPI schema must be present.
    expect(spot).toHaveProperty("spot_id");
    expect(spot).toHaveProperty("name");
    expect(spot).toHaveProperty("kind");
    expect(spot).toHaveProperty("address_line");
    expect(spot).toHaveProperty("lat");
    expect(spot).toHaveProperty("lng");
    expect(spot).toHaveProperty("price_per_hour_paise");
    expect(spot).toHaveProperty("free_bays");
    expect(spot).toHaveProperty("estimated_total_paise");
  });

  it("maps scalar values correctly from the DB row", async () => {
    const row = makeDbRow({
      spot_id: 6,
      name: "Axiom Business Centre",
      kind: "office",
      address_line: "Axiom Business Centre, Survey No 48, Gachibowli",
      lat: 17.437,
      lng: 78.3502,
      price_per_hour_paise: 4000,
      free_bays: 3,
    });
    mockQuery.mockResolvedValueOnce(pgResult([row]));
    const [spot] = await searchAvailability(SLUG, START, END);

    expect(spot!.spot_id).toBe(6);
    expect(spot!.name).toBe("Axiom Business Centre");
    expect(spot!.kind).toBe("office");
    expect(spot!.address_line).toBe(
      "Axiom Business Centre, Survey No 48, Gachibowli",
    );
    expect(spot!.lat).toBe(17.437);
    expect(spot!.lng).toBe(78.3502);
    expect(spot!.price_per_hour_paise).toBe(4000);
    expect(spot!.free_bays).toBe(3);
  });

  it("returns spot_id as a number (not a string)", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([makeDbRow({ spot_id: 6 })]));
    const [spot] = await searchAvailability(SLUG, START, END);
    expect(typeof spot!.spot_id).toBe("number");
  });

  it("returns lat/lng as numbers (not strings)", async () => {
    mockQuery.mockResolvedValueOnce(
      pgResult([makeDbRow({ lat: 17.437, lng: 78.3502 })]),
    );
    const [spot] = await searchAvailability(SLUG, START, END);
    expect(typeof spot!.lat).toBe("number");
    expect(typeof spot!.lng).toBe("number");
  });

  it("returns price_per_hour_paise as an integer", async () => {
    mockQuery.mockResolvedValueOnce(
      pgResult([makeDbRow({ price_per_hour_paise: 4000 })]),
    );
    const [spot] = await searchAvailability(SLUG, START, END);
    expect(Number.isInteger(spot!.price_per_hour_paise)).toBe(true);
  });

  it("returns free_bays as an integer", async () => {
    mockQuery.mockResolvedValueOnce(
      pgResult([makeDbRow({ free_bays: 5 })]),
    );
    const [spot] = await searchAvailability(SLUG, START, END);
    expect(Number.isInteger(spot!.free_bays)).toBe(true);
  });

  it("returns estimated_total_paise as an integer", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([makeDbRow()]));
    const [spot] = await searchAvailability(SLUG, START, END);
    expect(Number.isInteger(spot!.estimated_total_paise)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. estimated_total_paise — computed by computeAmountPaise, not from DB
// ---------------------------------------------------------------------------
describe("estimated_total_paise computation", () => {
  it("equals price_per_hour_paise × billable hours for an exact-hour window", async () => {
    // 2-hour window, 4000 paise/hr → 8000 paise
    mockQuery.mockResolvedValueOnce(
      pgResult([makeDbRow({ price_per_hour_paise: 4000 })]),
    );
    const [spot] = await searchAvailability(
      SLUG,
      "2026-10-01T10:00:00+05:30",
      "2026-10-01T12:00:00+05:30",
    );
    expect(spot!.estimated_total_paise).toBe(8000);
  });

  it("rounds a fractional hour UP (90-minute window bills as 2 hours)", async () => {
    // ADR-003 billing rule: ceil(90 min / 60 min) = 2 hours
    mockQuery.mockResolvedValueOnce(
      pgResult([makeDbRow({ price_per_hour_paise: 4000 })]),
    );
    const [spot] = await searchAvailability(
      SLUG,
      "2026-10-01T10:00:00+05:30",
      "2026-10-01T11:30:00+05:30",
    );
    // 2 hours × 4000 paise = 8000 paise
    expect(spot!.estimated_total_paise).toBe(8000);
  });

  it("rounds a 61-minute window UP to 2 hours", async () => {
    mockQuery.mockResolvedValueOnce(
      pgResult([makeDbRow({ price_per_hour_paise: 5000 })]),
    );
    const [spot] = await searchAvailability(
      SLUG,
      "2026-10-01T10:00:00+05:30",
      "2026-10-01T11:01:00+05:30",
    );
    // ceil(61/60) = 2 hours × 5000 = 10000 paise
    expect(spot!.estimated_total_paise).toBe(10000);
  });

  it("uses the row's own price_per_hour_paise, not a hardcoded value", async () => {
    mockQuery.mockResolvedValueOnce(
      pgResult([makeDbRow({ price_per_hour_paise: 6000 })]),
    );
    const [spot] = await searchAvailability(
      SLUG,
      "2026-10-01T10:00:00+05:30",
      "2026-10-01T12:00:00+05:30",
    );
    // 2 hours × 6000 = 12000 paise
    expect(spot!.estimated_total_paise).toBe(12000);
  });

  it("does NOT include a DB-side estimated_total in the mapped output", async () => {
    // Ensure the mapper ignores any stale 'estimated_total_paise' column that
    // might appear from an old query version — the value must always come from
    // computeAmountPaise.
    const rowWithStaleEstimate = {
      ...makeDbRow({ price_per_hour_paise: 4000, free_bays: 1 }),
      // Simulate a DB column with a wrong value — should be ignored.
      estimated_total_paise: 999999,
    };
    mockQuery.mockResolvedValueOnce(pgResult([rowWithStaleEstimate]));
    const [spot] = await searchAvailability(
      SLUG,
      "2026-10-01T10:00:00+05:30",
      "2026-10-01T12:00:00+05:30",
    );
    // Must equal 2h × 4000 = 8000, NOT 999999.
    expect(spot!.estimated_total_paise).toBe(8000);
  });
});

// ---------------------------------------------------------------------------
// 4. Empty result
// ---------------------------------------------------------------------------
describe("empty result", () => {
  it("returns an empty array when no rows are returned", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([]));
    const results = await searchAvailability(SLUG, START, END);
    expect(results).toEqual([]);
  });

  it("returns an array (not null or undefined) for an unknown slug", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([]));
    const results = await searchAvailability("nonexistent-area", START, END);
    expect(Array.isArray(results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. free_bays fidelity
// ---------------------------------------------------------------------------
describe("free_bays fidelity", () => {
  it("preserves the free_bays count from the DB row unchanged", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([makeDbRow({ free_bays: 7 })]));
    const [spot] = await searchAvailability(SLUG, START, END);
    expect(spot!.free_bays).toBe(7);
  });

  it("works when free_bays is 1 (minimum per openapi.yaml)", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([makeDbRow({ free_bays: 1 })]));
    const [spot] = await searchAvailability(SLUG, START, END);
    expect(spot!.free_bays).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. All five spot kinds round-trip correctly
// ---------------------------------------------------------------------------
describe("spot kind union", () => {
  const kinds: SpotAvailability["kind"][] = [
    "mall",
    "apartment",
    "office",
    "gym",
    "commercial",
  ];

  for (const kind of kinds) {
    it(`passes kind="${kind}" through unchanged`, async () => {
      mockQuery.mockResolvedValueOnce(pgResult([makeDbRow({ kind })]));
      const [spot] = await searchAvailability(SLUG, START, END);
      expect(spot!.kind).toBe(kind);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Multi-spot result
// ---------------------------------------------------------------------------
describe("multi-spot result", () => {
  it("maps all rows when the DB returns multiple spots", async () => {
    const rows = [
      makeDbRow({ spot_id: 4, name: "Prism Sports Hub", kind: "gym", price_per_hour_paise: 2500, free_bays: 2 }),
      makeDbRow({ spot_id: 5, name: "Ovation Square Open-Air Lot", kind: "commercial", price_per_hour_paise: 2000, free_bays: 8 }),
      makeDbRow({ spot_id: 6, name: "Axiom Business Centre", kind: "office", price_per_hour_paise: 4000, free_bays: 3 }),
    ];
    mockQuery.mockResolvedValueOnce(pgResult(rows));
    const results = await searchAvailability(SLUG, START, END);

    expect(results).toHaveLength(3);
    expect(results.map((s) => s.spot_id)).toEqual([4, 5, 6]);
    expect(results.map((s) => s.name)).toEqual([
      "Prism Sports Hub",
      "Ovation Square Open-Air Lot",
      "Axiom Business Centre",
    ]);
    expect(results.map((s) => s.free_bays)).toEqual([2, 8, 3]);
  });

  it("computes estimated_total_paise independently per spot using each spot's rate", async () => {
    // 2-hour window; spot A at 2500/hr → 5000, spot B at 4000/hr → 8000
    const rows = [
      makeDbRow({ spot_id: 4, price_per_hour_paise: 2500, free_bays: 1 }),
      makeDbRow({ spot_id: 6, price_per_hour_paise: 4000, free_bays: 1 }),
    ];
    mockQuery.mockResolvedValueOnce(pgResult(rows));
    const results = await searchAvailability(
      SLUG,
      "2026-10-01T10:00:00+05:30",
      "2026-10-01T12:00:00+05:30",
    );

    expect(results[0]!.estimated_total_paise).toBe(5000);
    expect(results[1]!.estimated_total_paise).toBe(8000);
  });
});

// ---------------------------------------------------------------------------
// 8. DB errors propagate
// ---------------------------------------------------------------------------
describe("error propagation", () => {
  it("rejects with the pool error when query fails", async () => {
    const dbError = new Error("connection refused");
    mockQuery.mockRejectedValueOnce(dbError);

    await expect(searchAvailability(SLUG, START, END)).rejects.toThrow(
      "connection refused",
    );
  });
});

// ---------------------------------------------------------------------------
// 9. No extra fields beyond the SpotAvailability schema
// ---------------------------------------------------------------------------
describe("output shape hygiene", () => {
  it("does not leak extra DB columns into the returned object", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([makeDbRow()]));
    const [spot] = await searchAvailability(SLUG, START, END);

    const allowedKeys = new Set<string>([
      "spot_id",
      "name",
      "kind",
      "address_line",
      "lat",
      "lng",
      "price_per_hour_paise",
      "free_bays",
      "estimated_total_paise",
    ]);

    for (const key of Object.keys(spot!)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });

  it("result has exactly nine keys (matching SpotAvailability)", async () => {
    mockQuery.mockResolvedValueOnce(pgResult([makeDbRow()]));
    const [spot] = await searchAvailability(SLUG, START, END);
    expect(Object.keys(spot!)).toHaveLength(9);
  });
});
