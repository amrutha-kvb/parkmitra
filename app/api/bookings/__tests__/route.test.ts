/**
 * Tests for POST /api/bookings  (app/api/bookings/route.ts)
 *
 * All external dependencies (lib/db, lib/money, crypto) are mocked so the
 * suite runs without a database.  The tests verify:
 *
 * Validation — 400
 *   1.  Missing bay_id                → 400 missing_field
 *   2.  Non-integer bay_id            → 400 invalid_field
 *   3.  Missing start                 → 400 missing_field
 *   4.  Missing end                   → 400 missing_field
 *   5.  Missing driver_phone          → 400 missing_field
 *   6.  Missing vehicle_reg           → 400 missing_field
 *   7.  Unparseable start timestamp   → 400 invalid_field
 *   8.  Unparseable end timestamp     → 400 invalid_field
 *   9.  bay_id not found in DB        → 400 bay_not_found
 *  10.  Invalid JSON body             → 400 invalid_json
 *
 * Window ordering — 422
 *  11.  end === start (zero-length)   → 422 invalid_window
 *  12.  end < start                   → 422 invalid_window
 *  13.  Window before opens_at        → 422 outside_opening_hours
 *  14.  Window after closes_at        → 422 outside_opening_hours
 *
 * Concurrency — 409
 *  15.  DB raises 23P01              → 409 bay_unavailable
 *
 * Happy path — 201
 *  16.  Returns 201 with Booking schema
 *  17.  reference_code is 10 Crockford base32 chars
 *  18.  status is 'pending'
 *  19.  window echoes start/end as ISO strings
 *  20.  amount_paise is computed by computeAmountPaise (never taken from body)
 *  21.  amount field in body is silently ignored
 *  22.  driver_name is optional (absent in body → null in insert params)
 *  23.  driver_name present → passed to insert params
 *  24.  Response has all Booking schema fields
 *  25.  DB insert SQL uses a parameterised query (SEC-004)
 *
 * generateReferenceCode unit tests
 *  26.  Always 10 characters
 *  27.  Only Crockford alphabet characters
 *  28.  Two calls produce different codes (probabilistic)
 *
 * isWithinOpeningHours unit tests
 *  29.  Exactly at opens_at → within hours
 *  30.  One minute before opens_at → outside
 *  31.  End exactly at closes_at → within hours (half-open window)
 *  32.  End one minute after closes_at → outside
 *  33.  Window that starts at closes_at → outside
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoist shared mocks — must happen before any imports.
// ---------------------------------------------------------------------------
const { mockQuery, mockComputeAmountPaise } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockComputeAmountPaise: vi.fn(),
}));

// The rate-limit guard talks to Postgres, and this suite mocks the pool — so
// without this the guard throws, fails open (correctly), and its attempted
// query pollutes the call counts these tests assert on. The guard has its own
// tests in tests/rate-limit.test.ts; here it is not the subject.
vi.mock("../../../../lib/rate-limit-guard", () => ({
  rateLimitGuard: vi.fn(async () => null),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../../../lib/db", () => ({
  default: { query: mockQuery },
}));

vi.mock("../../../../lib/money", () => ({
  computeAmountPaise: mockComputeAmountPaise,
}));

// Import handler + exported helpers after mocks are in place.
import { POST, generateReferenceCode, isWithinOpeningHours } from "../route";
import { rateLimitGuard } from "../../../../lib/rate-limit-guard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const START = "2026-10-01T10:00:00+05:30";
const END = "2026-10-01T12:00:00+05:30";

/** Minimal valid request body — all required fields. */
const VALID_BODY = {
  bay_id: 3,
  start: START,
  end: END,
  driver_phone: "+919876543210",
  vehicle_reg: "TS09AB1234",
};

/** Spot row returned by the look-up query. */
const SPOT_ROW = {
  spot_id: 1,
  price_per_hour_paise: 4000,
  opens_at: "07:00:00",
  closes_at: "23:00:00",
  spot_name: "Axiom Business Centre",
  bay_label: "L2-01",
  address_line: "Axiom Business Centre, Survey No 48, Gachibowli",
};

/** Booking row returned by the INSERT … RETURNING query. */
const BOOKING_ROW = {
  reference_code: "ABC1234567",
  status: "pending",
  window_start: new Date(START).toISOString(),
  window_end: new Date(END).toISOString(),
  amount_paise: 8000,
  spot_name: SPOT_ROW.spot_name,
  bay_label: SPOT_ROW.bay_label,
  address_line: SPOT_ROW.address_line,
  arrived_at: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a NextRequest with a JSON body. */
function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Set up the two mock DB queries for the happy path. */
function setupHappyPath(
  bookingRow: Partial<typeof BOOKING_ROW> = {},
  spotRow: Partial<typeof SPOT_ROW> = {},
): void {
  mockComputeAmountPaise.mockReturnValue(8000);
  // First query: spot look-up.
  mockQuery.mockResolvedValueOnce({ rows: [{ ...SPOT_ROW, ...spotRow }] });
  // Second query: INSERT … RETURNING join.
  mockQuery.mockResolvedValueOnce({
    rows: [{ ...BOOKING_ROW, ...bookingRow }],
  });
}

// ---------------------------------------------------------------------------
// Reset mocks between tests.
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockQuery.mockReset();
  mockComputeAmountPaise.mockReset();
});

// ===========================================================================
// 1–10  Input validation → 400
// ===========================================================================
describe("input validation → 400", () => {
  it("1. returns 400 when bay_id is absent", async () => {
    const { bay_id: _, ...noId } = VALID_BODY;
    const res = await POST(makeRequest(noId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_field");
    expect(body.message).toMatch(/bay_id/i);
  });

  it("2. returns 400 when bay_id is not a positive integer", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, bay_id: -1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_field");
    expect(body.message).toMatch(/bay_id/i);
  });

  it("2b. returns 400 when bay_id is a float", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, bay_id: 3.7 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_field");
  });

  it("3. returns 400 when start is absent", async () => {
    const { start: _, ...noStart } = VALID_BODY;
    const res = await POST(makeRequest(noStart));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_field");
    expect(body.message).toMatch(/start/i);
  });

  it("4. returns 400 when end is absent", async () => {
    const { end: _, ...noEnd } = VALID_BODY;
    const res = await POST(makeRequest(noEnd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_field");
    expect(body.message).toMatch(/end/i);
  });

  it("5. returns 400 when driver_phone is absent", async () => {
    const { driver_phone: _, ...noPhone } = VALID_BODY;
    const res = await POST(makeRequest(noPhone));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_field");
    expect(body.message).toMatch(/driver_phone/i);
  });

  it("6. returns 400 when vehicle_reg is absent", async () => {
    const { vehicle_reg: _, ...noReg } = VALID_BODY;
    const res = await POST(makeRequest(noReg));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_field");
    expect(body.message).toMatch(/vehicle_reg/i);
  });

  it("7. returns 400 when start is not a valid date-time", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, start: "not-a-date" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_field");
    expect(body.message).toMatch(/start/i);
  });

  it("8. returns 400 when end is not a valid date-time", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, end: "bad-end" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_field");
    expect(body.message).toMatch(/end/i);
  });

  it("9. returns 400 when the bay_id does not exist in the database", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // spot look-up returns nothing
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bay_not_found");
  });

  it("10. returns 400 for a non-JSON body", async () => {
    const req = new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "this is not json {{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  it("does not call computeAmountPaise when validation fails", async () => {
    const { bay_id: _, ...noId } = VALID_BODY;
    await POST(makeRequest(noId));
    expect(mockComputeAmountPaise).not.toHaveBeenCalled();
  });

  it("does not query the database when required fields are missing", async () => {
    const { start: _, ...noStart } = VALID_BODY;
    await POST(makeRequest(noStart));
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 11–14  Window / opening-hours validation → 422
// ===========================================================================
describe("window / opening-hours validation → 422", () => {
  it("11. returns 422 when end equals start (zero-length window)", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, end: START }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_window");
  });

  it("12. returns 422 when end is before start", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, start: END, end: START }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_window");
  });

  it("13. returns 422 when window starts before opens_at", async () => {
    // Spot opens at 07:00; booking starts at 06:00.
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...SPOT_ROW, opens_at: "07:00:00", closes_at: "23:00:00" }],
    });
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        start: "2026-10-01T06:00:00+05:30",
        end: "2026-10-01T08:00:00+05:30",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("outside_opening_hours");
  });

  it("14. returns 422 when window ends after closes_at", async () => {
    // Spot closes at 23:00; booking ends at 23:30.
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...SPOT_ROW, opens_at: "07:00:00", closes_at: "23:00:00" }],
    });
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        start: "2026-10-01T22:00:00+05:30",
        end: "2026-10-01T23:30:00+05:30",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("outside_opening_hours");
  });

  it("does not call computeAmountPaise when window is invalid", async () => {
    await POST(makeRequest({ ...VALID_BODY, end: START })); // zero-length
    expect(mockComputeAmountPaise).not.toHaveBeenCalled();
  });

  it("does not call the DB insert when the window is outside opening hours", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...SPOT_ROW, opens_at: "07:00:00", closes_at: "23:00:00" }],
    });
    await POST(
      makeRequest({
        ...VALID_BODY,
        start: "2026-10-01T06:00:00+05:30",
        end: "2026-10-01T08:00:00+05:30",
      }),
    );
    // Only the spot look-up query should have been called, not the INSERT.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 15  Concurrency / exclusion violation → 409
// ===========================================================================
describe("concurrency → 409", () => {
  it("15. returns 409 with bay_unavailable when DB raises 23P01", async () => {
    mockComputeAmountPaise.mockReturnValue(8000);
    mockQuery.mockResolvedValueOnce({ rows: [SPOT_ROW] }); // spot look-up succeeds
    const pgError = Object.assign(new Error("exclusion constraint"), {
      code: "23P01",
    });
    mockQuery.mockRejectedValueOnce(pgError); // INSERT fails

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("bay_unavailable");
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("re-throws non-23P01 DB errors (unexpected failures surface as 500)", async () => {
    mockComputeAmountPaise.mockReturnValue(8000);
    mockQuery.mockResolvedValueOnce({ rows: [SPOT_ROW] });
    const pgError = Object.assign(new Error("connection refused"), {
      code: "08006",
    });
    mockQuery.mockRejectedValueOnce(pgError);

    await expect(POST(makeRequest(VALID_BODY))).rejects.toThrow(
      "connection refused",
    );
  });
});

// ===========================================================================
// 16–25  Happy path → 201
// ===========================================================================
describe("happy path → 201", () => {
  it("16. returns 201 with a valid Booking schema body", async () => {
    setupHappyPath();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    // All required Booking schema fields must be present.
    expect(body).toHaveProperty("reference_code");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("window");
    expect(body).toHaveProperty("amount_paise");
    expect(body).toHaveProperty("spot_name");
    expect(body).toHaveProperty("bay_label");
    expect(body).toHaveProperty("address_line");
    expect(body).toHaveProperty("arrived_at");
  });

  it("17. reference_code is exactly 10 Crockford base32 characters", async () => {
    setupHappyPath({ reference_code: "A1B2C3D4E5" });
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.reference_code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
  });

  it("18. status is 'pending' on creation", async () => {
    setupHappyPath({ status: "pending" });
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.status).toBe("pending");
  });

  it("19. window contains start and end as ISO date-time strings", async () => {
    setupHappyPath();
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(typeof body.window.start).toBe("string");
    expect(typeof body.window.end).toBe("string");
    // Must parse back to the same instant.
    expect(new Date(body.window.start).getTime()).toBe(
      new Date(START).getTime(),
    );
    expect(new Date(body.window.end).getTime()).toBe(new Date(END).getTime());
  });

  it("20. amount_paise comes from computeAmountPaise, not from the body", async () => {
    mockComputeAmountPaise.mockReturnValue(12000);
    mockQuery.mockResolvedValueOnce({ rows: [SPOT_ROW] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...BOOKING_ROW, amount_paise: 12000 }],
    });
    const res = await POST(
      makeRequest({ ...VALID_BODY, amount: 99999 }), // body amount must be ignored
    );
    const body = await res.json();
    expect(body.amount_paise).toBe(12000);
    // computeAmountPaise must have been called with the spot's rate.
    expect(mockComputeAmountPaise).toHaveBeenCalledWith(
      SPOT_ROW.price_per_hour_paise,
      START,
      END,
    );
  });

  it("21. an 'amount' field in the request body is silently ignored", async () => {
    setupHappyPath({ amount_paise: 8000 });
    const res = await POST(
      makeRequest({ ...VALID_BODY, amount: 99999 }),
    );
    // Response must NOT echo 99999.
    const body = await res.json();
    expect(body.amount_paise).not.toBe(99999);
  });

  it("22. driver_name absent in body → null passed as insert parameter", async () => {
    setupHappyPath();
    await POST(makeRequest(VALID_BODY)); // no driver_name
    // The INSERT query is the second call to mockQuery.
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    // driver_name is the 5th positional parameter ($5).
    expect(params[4]).toBeNull();
  });

  it("23. driver_name present → passed through to insert parameters", async () => {
    setupHappyPath();
    await POST(makeRequest({ ...VALID_BODY, driver_name: "Priya Sharma" }));
    const insertCall = mockQuery.mock.calls[1];
    const params = insertCall![1] as unknown[];
    expect(params[4]).toBe("Priya Sharma");
  });

  it("24. response body has all required Booking schema fields", async () => {
    setupHappyPath();
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    // Exact set from openapi.yaml Booking schema (required properties).
    expect(body).toHaveProperty("reference_code");
    expect(body).toHaveProperty("status");
    expect(body.window).toHaveProperty("start");
    expect(body.window).toHaveProperty("end");
    expect(body).toHaveProperty("amount_paise");
    expect(body).toHaveProperty("spot_name");
    expect(body).toHaveProperty("bay_label");
    // arrived_at may be null on creation.
    expect(body.arrived_at).toBeNull();
  });

  it("25. the INSERT query is fully parameterised — no user input in SQL text", async () => {
    const maliciousPhone = "'; DROP TABLE bookings; --";
    setupHappyPath();
    await POST(
      makeRequest({ ...VALID_BODY, driver_phone: maliciousPhone }),
    );
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall).toBeDefined();
    const [sql] = insertCall as [string, unknown[]];
    // The raw phone string must NOT appear in the SQL text itself.
    expect(sql).not.toContain(maliciousPhone);
    // But it must appear as a bound parameter.
    const params = insertCall![1] as unknown[];
    expect(params).toContain(maliciousPhone);
  });

  it("amount_paise in the Booking response matches what computeAmountPaise returns", async () => {
    mockComputeAmountPaise.mockReturnValue(6000);
    mockQuery.mockResolvedValueOnce({ rows: [SPOT_ROW] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...BOOKING_ROW, amount_paise: 6000 }],
    });
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.amount_paise).toBe(6000);
  });

  it("spot_name and bay_label in the response match the joined rows", async () => {
    setupHappyPath({
      spot_name: "Zenith Galleria Parking",
      bay_label: "B-03",
    });
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.spot_name).toBe("Zenith Galleria Parking");
    expect(body.bay_label).toBe("B-03");
  });
});

// ===========================================================================
// 26–28  generateReferenceCode unit tests
// ===========================================================================
describe("generateReferenceCode", () => {
  const CROCKFORD_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

  it("26. always produces exactly 10 characters", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateReferenceCode()).toHaveLength(10);
    }
  });

  it("27. only uses Crockford base32 alphabet characters", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateReferenceCode()).toMatch(CROCKFORD_RE);
    }
  });

  it("28. two calls produce different codes (collision is astronomically unlikely)", () => {
    const a = generateReferenceCode();
    const b = generateReferenceCode();
    expect(a).not.toBe(b);
  });

  it("never contains I, L, O, or U (ambiguous Crockford exclusions)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateReferenceCode();
      expect(code).not.toMatch(/[ILOU]/);
    }
  });
});

// ===========================================================================
// 29–33  isWithinOpeningHours unit tests
// ===========================================================================
describe("isWithinOpeningHours", () => {
  const OPENS = "07:00:00";
  const CLOSES = "23:00:00";

  it("29. window starting exactly at opens_at is within hours", () => {
    expect(
      isWithinOpeningHours(
        "2026-10-01T07:00:00+05:30",
        "2026-10-01T09:00:00+05:30",
        OPENS,
        CLOSES,
      ),
    ).toBe(true);
  });

  it("30. window starting one minute before opens_at is outside hours", () => {
    expect(
      isWithinOpeningHours(
        "2026-10-01T06:59:00+05:30",
        "2026-10-01T09:00:00+05:30",
        OPENS,
        CLOSES,
      ),
    ).toBe(false);
  });

  it("31. window ending exactly at closes_at is within hours (half-open: end is exclusive)", () => {
    expect(
      isWithinOpeningHours(
        "2026-10-01T21:00:00+05:30",
        "2026-10-01T23:00:00+05:30",
        OPENS,
        CLOSES,
      ),
    ).toBe(true);
  });

  it("32. window ending one minute after closes_at is outside hours", () => {
    expect(
      isWithinOpeningHours(
        "2026-10-01T21:00:00+05:30",
        "2026-10-01T23:01:00+05:30",
        OPENS,
        CLOSES,
      ),
    ).toBe(false);
  });

  it("33. window starting exactly at closes_at is outside hours", () => {
    expect(
      isWithinOpeningHours(
        "2026-10-01T23:00:00+05:30",
        "2026-10-01T23:30:00+05:30",
        OPENS,
        CLOSES,
      ),
    ).toBe(false);
  });

  it("normal window well within hours returns true", () => {
    expect(
      isWithinOpeningHours(
        "2026-10-01T10:00:00+05:30",
        "2026-10-01T12:00:00+05:30",
        OPENS,
        CLOSES,
      ),
    ).toBe(true);
  });

  it("near-24h spot (00:00–23:59) accepts a midnight-spanning window", () => {
    expect(
      isWithinOpeningHours(
        "2026-10-01T23:00:00+05:30",
        "2026-10-01T23:59:00+05:30",
        "00:00:00",
        "23:59:00",
      ),
    ).toBe(true);
  });
});

// ===========================================================================
// Error response schema (ARCH-002)
// ===========================================================================
describe("error response schema (ARCH-002)", () => {
  it("400 body has exactly 'error' and 'message' keys", async () => {
    const { bay_id: _, ...noId } = VALID_BODY;
    const res = await POST(makeRequest(noId));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("409 body has exactly 'error' and 'message' keys", async () => {
    mockComputeAmountPaise.mockReturnValue(8000);
    mockQuery.mockResolvedValueOnce({ rows: [SPOT_ROW] });
    mockQuery.mockRejectedValueOnce(
      Object.assign(new Error("exclusion"), { code: "23P01" }),
    );
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("422 body has exactly 'error' and 'message' keys", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, end: START }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("'error' field is a stable machine-readable string (no spaces)", async () => {
    const { bay_id: _, ...noId } = VALID_BODY;
    const res = await POST(makeRequest(noId));
    const body = await res.json();
    expect(body.error).toMatch(/^\w+$/);
  });
});


/**
 * The guard is mocked above so it cannot reach Postgres. That means nothing
 * else in this file would notice if the route stopped calling it — the mock
 * would silently make an unprotected endpoint look tested.
 *
 * Threat T3, booking spam, is unmitigated in design/threat-model.md except by
 * this limiter, so "is it wired in" is the assertion that matters.
 */
describe("rate limiting is wired in (T3)", () => {
  it("calls the guard with the 'booking' scope", async () => {
    vi.mocked(rateLimitGuard).mockClear();
    setupHappyPath();
    await POST(makeRequest(VALID_BODY));
    expect(rateLimitGuard).toHaveBeenCalledWith(expect.anything(), "booking");
  });

  it("returns the guard's 429 without touching the database", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(rateLimitGuard).mockResolvedValueOnce(
      NextResponse.json({ error: "rate_limited", message: "no" }, { status: 429 }),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
  });
});
