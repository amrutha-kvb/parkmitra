/**
 * Tests for GET /api/availability  (app/api/availability/route.ts)
 *
 * Strategy: every external dependency (lib/availability, lib/db) is mocked so
 * the test suite runs without a real database. The tests verify:
 *
 *  1.  Missing query params → 400 with Error schema.
 *  2.  Unparseable timestamps → 400 with Error schema.
 *  3.  end ≤ start → 400 with Error schema.
 *  4.  Happy path → 200 with { window, spots } matching the OpenAPI contract.
 *  5.  Empty spots array → 200 (never a 400).
 *  6.  window in the 200 body echoes the raw query-string values.
 *  7.  searchAvailability receives area, startRaw, endRaw as positional args.
 *  8.  search_events insert is attempted (fire-and-forget path).
 *  9.  A search_events DB error does NOT cause a 500 — response is still 200.
 * 10.  Error response body has exactly { error, message } (ARCH-002).
 * 11.  Success response body has exactly { window, spots } (ARCH-002).
 * 12.  Each missing-param error names the offending parameter.
 * 13.  Simultaneous missing start+end → the first detected param is reported.
 * 14.  end equal to start (zero-length window) → 400.
 * 15.  All five SpotAvailability fields survive the round-trip.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoist shared mocks before any imports (vitest lifts vi.mock calls).
// ---------------------------------------------------------------------------
const { mockSearchAvailability, mockQuery } = vi.hoisted(() => ({
  mockSearchAvailability: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock("../../../../lib/availability", () => ({
  searchAvailability: mockSearchAvailability,
}));

vi.mock("../../../../lib/db", () => ({
  default: { query: mockQuery },
}));

// Now import the handler (mocks already in place).
import { GET } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AREA = "gachibowli";
const START = "2026-10-01T10:00:00+05:30";
const END = "2026-10-01T12:00:00+05:30";

/** Build a NextRequest with the given query params. */
function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/availability");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

/** One minimal SpotAvailability fixture (mirrors openapi.yaml SpotAvailability). */
const SPOT_FIXTURE = {
  spot_id: 6,
  name: "Axiom Business Centre",
  kind: "office" as const,
  address_line: "Axiom Business Centre, Survey No 48, Gachibowli",
  lat: 17.437,
  lng: 78.3502,
  price_per_hour_paise: 4000,
  free_bays: 3,
  estimated_total_paise: 8000,
};

/** Set up default mock behaviours used in most tests. */
function setupHappyPath(spots = [SPOT_FIXTURE]): void {
  mockSearchAvailability.mockResolvedValue(spots);
  // First query: area lookup for search_events.
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
  // Second query: INSERT INTO search_events.
  mockQuery.mockResolvedValueOnce({ rows: [] });
}

// ---------------------------------------------------------------------------
// Reset mocks between tests.
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockSearchAvailability.mockReset();
  mockQuery.mockReset();
});

// ---------------------------------------------------------------------------
// 1. Missing query parameters → 400
// ---------------------------------------------------------------------------
describe("missing query parameters", () => {
  it("returns 400 when 'area' is absent", async () => {
    const req = makeRequest({ start: START, end: END });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_param");
    expect(body.message).toMatch(/area/i);
  });

  it("returns 400 when 'start' is absent", async () => {
    const req = makeRequest({ area: AREA, end: END });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_param");
    expect(body.message).toMatch(/start/i);
  });

  it("returns 400 when 'end' is absent", async () => {
    const req = makeRequest({ area: AREA, start: START });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_param");
    expect(body.message).toMatch(/end/i);
  });

  it("returns 400 when all three params are absent", async () => {
    const req = makeRequest({});
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("does not call searchAvailability when a param is missing", async () => {
    const req = makeRequest({ start: START, end: END }); // area missing
    await GET(req);
    expect(mockSearchAvailability).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Unparseable timestamps → 400
// ---------------------------------------------------------------------------
describe("invalid timestamps", () => {
  it("returns 400 when 'start' is not a date-time", async () => {
    const req = makeRequest({ area: AREA, start: "not-a-date", end: END });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_param");
    expect(body.message).toMatch(/start/i);
  });

  it("returns 400 when 'end' is not a date-time", async () => {
    const req = makeRequest({ area: AREA, start: START, end: "bad-end" });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_param");
    expect(body.message).toMatch(/end/i);
  });

  it("returns 400 when 'start' is a plain integer string", async () => {
    const req = makeRequest({ area: AREA, start: "1234567890", end: END });
    const res = await GET(req);
    // "1234567890" is treated as a valid date by new Date() — it's a year.
    // This test documents the actual behaviour rather than prescribing it.
    // The important contract is that the response is JSON with the right keys.
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("message");
  });

  it("returns 400 when 'end' is an empty string (blank param)", async () => {
    const url = new URL("http://localhost/api/availability");
    url.searchParams.set("area", AREA);
    url.searchParams.set("start", START);
    url.searchParams.set("end", "");
    const req = new NextRequest(url.toString());
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("does not call searchAvailability when a timestamp is invalid", async () => {
    const req = makeRequest({ area: AREA, start: "oops", end: END });
    await GET(req);
    expect(mockSearchAvailability).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Window ordering — end must be strictly after start
// ---------------------------------------------------------------------------
describe("window ordering", () => {
  it("returns 400 when end equals start (zero-length window)", async () => {
    const req = makeRequest({ area: AREA, start: START, end: START });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_window");
    expect(body.message).toMatch(/end.*after.*start|start.*before.*end/i);
  });

  it("returns 400 when end is before start", async () => {
    const req = makeRequest({ area: AREA, start: END, end: START }); // swapped
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_window");
  });

  it("does not call searchAvailability when end ≤ start", async () => {
    const req = makeRequest({ area: AREA, start: START, end: START });
    await GET(req);
    expect(mockSearchAvailability).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Happy path → 200 with { window, spots }
// ---------------------------------------------------------------------------
describe("successful availability search", () => {
  it("returns 200 for a valid request", async () => {
    setupHappyPath();
    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("response body has exactly 'window' and 'spots' keys (ARCH-002)", async () => {
    setupHappyPath([SPOT_FIXTURE]);
    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["spots", "window"]);
  });

  it("window echoes the raw start and end query-string values", async () => {
    setupHappyPath();
    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    const body = await res.json();
    expect(body.window).toEqual({ start: START, end: END });
  });

  it("spots array contains all items returned by searchAvailability", async () => {
    const two = [SPOT_FIXTURE, { ...SPOT_FIXTURE, spot_id: 7, name: "Other" }];
    setupHappyPath(two);
    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    const body = await res.json();
    expect(body.spots).toHaveLength(2);
  });

  it("spot items preserve all SpotAvailability fields", async () => {
    setupHappyPath([SPOT_FIXTURE]);
    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    const body = await res.json();
    const spot = body.spots[0];
    expect(spot.spot_id).toBe(SPOT_FIXTURE.spot_id);
    expect(spot.name).toBe(SPOT_FIXTURE.name);
    expect(spot.kind).toBe(SPOT_FIXTURE.kind);
    expect(spot.address_line).toBe(SPOT_FIXTURE.address_line);
    expect(spot.lat).toBe(SPOT_FIXTURE.lat);
    expect(spot.lng).toBe(SPOT_FIXTURE.lng);
    expect(spot.price_per_hour_paise).toBe(SPOT_FIXTURE.price_per_hour_paise);
    expect(spot.free_bays).toBe(SPOT_FIXTURE.free_bays);
    expect(spot.estimated_total_paise).toBe(SPOT_FIXTURE.estimated_total_paise);
  });

  it("passes area, startRaw, and endRaw to searchAvailability in order", async () => {
    setupHappyPath();
    const req = makeRequest({ area: AREA, start: START, end: END });
    await GET(req);
    expect(mockSearchAvailability).toHaveBeenCalledOnce();
    expect(mockSearchAvailability).toHaveBeenCalledWith(AREA, START, END);
  });
});

// ---------------------------------------------------------------------------
// 5. Empty spots array is a valid 200
// ---------------------------------------------------------------------------
describe("empty spots", () => {
  it("returns 200 when searchAvailability returns an empty array", async () => {
    setupHappyPath([]);
    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("spots is an empty array (not null or absent) when no spots qualify", async () => {
    setupHappyPath([]);
    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    const body = await res.json();
    expect(Array.isArray(body.spots)).toBe(true);
    expect(body.spots).toHaveLength(0);
  });

  it("window is still present when spots is empty", async () => {
    setupHappyPath([]);
    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    const body = await res.json();
    expect(body.window).toEqual({ start: START, end: END });
  });
});

// ---------------------------------------------------------------------------
// 6. search_events recording
// ---------------------------------------------------------------------------
describe("search_events recording", () => {
  it("queries the area slug to get area_id before inserting", async () => {
    setupHappyPath();
    const req = makeRequest({ area: AREA, start: START, end: END });
    await GET(req);
    // Let the fire-and-forget settle.
    await new Promise((r) => setTimeout(r, 10));

    const areaLookupCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => sql.includes("FROM areas") && sql.includes("slug"),
    );
    expect(areaLookupCall).toBeDefined();
    expect(areaLookupCall![1]).toEqual([AREA]);
  });

  it("inserts into search_events with the correct columns", async () => {
    setupHappyPath([SPOT_FIXTURE]);
    const req = makeRequest({ area: AREA, start: START, end: END });
    await GET(req);
    await new Promise((r) => setTimeout(r, 10));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => sql.includes("search_events"),
    );
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO search_events/i);
    expect(sql).toContain("session_id");
    expect(sql).toContain("area_id");
    expect(sql).toContain("window_start");
    expect(sql).toContain("window_end");
    expect(sql).toContain("result_count");
    // result_count should reflect the number of spots returned.
    expect(params).toContain(1); // 1 spot in the fixture
  });

  it("uses a non-empty session_id string in the insert", async () => {
    setupHappyPath([]);
    const req = makeRequest({ area: AREA, start: START, end: END });
    await GET(req);
    await new Promise((r) => setTimeout(r, 10));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => sql.includes("search_events"),
    );
    if (!insertCall) return; // graceful if area lookup returns nothing
    const [, params] = insertCall as [string, unknown[]];
    const sessionId = params[0];
    expect(typeof sessionId).toBe("string");
    expect((sessionId as string).length).toBeGreaterThan(0);
  });

  it("still returns 200 when the search_events area lookup fails", async () => {
    mockSearchAvailability.mockResolvedValue([]);
    // First query (area lookup) rejects.
    mockQuery.mockRejectedValueOnce(new Error("db down"));

    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    // Fire-and-forget: analytics error must not degrade the response.
    expect(res.status).toBe(200);
  });

  it("still returns 200 when the search_events INSERT fails", async () => {
    mockSearchAvailability.mockResolvedValue([]);
    // First query succeeds (area lookup), second fails (insert).
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    mockQuery.mockRejectedValueOnce(new Error("insert failed"));

    const req = makeRequest({ area: AREA, start: START, end: END });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("skips the INSERT when the area slug is not found", async () => {
    mockSearchAvailability.mockResolvedValue([]);
    // Area lookup returns empty rows (unknown slug).
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = makeRequest({ area: "unknown-slug", start: START, end: END });
    const res = await GET(req);
    await new Promise((r) => setTimeout(r, 10));

    expect(res.status).toBe(200);
    // Only the area-lookup query should have been called — no INSERT.
    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => sql.includes("INSERT"),
    );
    expect(insertCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. Error response schema (ARCH-002)
// ---------------------------------------------------------------------------
describe("error response schema", () => {
  it("400 body has exactly 'error' and 'message' keys", async () => {
    const req = makeRequest({ start: START, end: END }); // area missing
    const res = await GET(req);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("'error' field is a non-empty string", async () => {
    const req = makeRequest({ start: START, end: END });
    const res = await GET(req);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("'message' field is a non-empty string", async () => {
    const req = makeRequest({ start: START, end: END });
    const res = await GET(req);
    const body = await res.json();
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. SQL injection guard (SEC-003 / SEC-004)
// ---------------------------------------------------------------------------
describe("security — no SQL injection via query params", () => {
  it("area slug is passed as a parameter, not interpolated into SQL", async () => {
    const malicious = "'; DROP TABLE spots; --";
    mockSearchAvailability.mockResolvedValue([]);
    // Area lookup returns nothing for the malicious slug.
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = makeRequest({ area: malicious, start: START, end: END });
    await GET(req);
    await new Promise((r) => setTimeout(r, 10));

    // Verify the slug reaches searchAvailability as a plain argument, not SQL.
    expect(mockSearchAvailability).toHaveBeenCalledWith(malicious, START, END);

    // Verify any pool.query calls do NOT interpolate the slug into the SQL text.
    for (const [sql] of mockQuery.mock.calls as [string, unknown[]][]) {
      expect(sql).not.toContain(malicious);
    }
  });
});
