/**
 * Tests for POST /api/bookings/[reference_code]/arrive
 * (app/api/bookings/[reference_code]/arrive/route.ts)
 *
 * All DB access is mocked (lib/booking-lookup + lib/db pool) so no database
 * is needed.
 *
 * Contract under test (openapi.yaml  →  markArrival):
 *   200  confirmed booking → Booking schema, arrived_at set (idempotent)
 *   404  malformed code  → IDENTICAL body to unknown code
 *   404  unknown code    → IDENTICAL body to malformed code
 *   409  booking is not 'confirmed'
 *
 * Test catalogue
 * ─────────────────────────────────────────────────────────────────────────
 * Validation / 404
 *   1.  Malformed code → 404 booking_not_found
 *   2.  Valid-pattern unknown code → 404 booking_not_found
 *   3.  Malformed 404 body === unknown 404 body (security invariant)
 *
 * Status guard / 409
 *   4.  Booking 'pending' → 409 not_confirmed
 *   5.  Booking 'cancelled' → 409 not_confirmed
 *   6.  Booking 'expired' → 409 not_confirmed
 *   7.  DB UPDATE is NOT called when booking is non-confirmed
 *
 * Happy path / 200
 *   8.  Confirmed booking, no prior arrived_at → 200, arrived_at is a string
 *   9.  All required Booking schema fields present
 *  10.  Idempotent: confirmed booking with arrived_at already set → 200 (not 409)
 *  11.  Idempotent: original arrived_at timestamp is preserved on repeat call
 *  12.  UPDATE SQL uses COALESCE so arrived_at is not overwritten
 *  13.  No personal data in response body
 *
 * Error schema (ARCH-002)
 *  14.  404 body has exactly { error, message }
 *  15.  409 body has exactly { error, message }
 *  16.  error fields are stable machine-readable tokens
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoist mocks.
// ---------------------------------------------------------------------------
const { mockFindBookingByCode, mockQuery } = vi.hoisted(() => ({
  mockFindBookingByCode: vi.fn(),
  mockQuery: vi.fn(),
}));

// The rate-limit guard talks to Postgres and this suite mocks the pool, so
// without this the guard throws, fails open (correctly), and its attempted
// query pollutes the call counts these tests assert on. The guard has its own
// tests; the wiring assertion below is what proves this route still calls it.
vi.mock("../../../../../../lib/rate-limit-guard", () => ({
  rateLimitGuard: vi.fn(async () => null),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../../../../../lib/booking-lookup", async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import("../../../../../../lib/booking-lookup")
    >();
  return { ...real, findBookingByCode: mockFindBookingByCode };
});

vi.mock("../../../../../../lib/db", () => ({
  default: { query: mockQuery },
}));

import { POST } from "../route";
import { rateLimitGuard } from "../../../../../../lib/rate-limit-guard";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_CODE = "A1B2C3D4E5";

const CONFIRMED_ROW = {
  id: 42,
  reference_code: VALID_CODE,
  status: "confirmed" as const,
  window_start: "2026-10-01T04:30:00.000Z",
  window_end: "2026-10-01T06:30:00.000Z",
  amount_paise: 8000,
  spot_name: "Cyber Heights Visitor Bay",
  bay_label: "B-12",
  address_line: "Cyber Heights, Gachibowli, Hyderabad",
  arrived_at: null,
};

const ARRIVED_AT = "2026-10-01T05:00:00.000Z";

const ARRIVED_RESULT_ROW = {
  ...CONFIRMED_ROW,
  arrived_at: ARRIVED_AT,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePOST(code: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/bookings/${encodeURIComponent(code)}/arrive`,
    { method: "POST" },
  );
}

function makeParams(
  code: string,
): { params: Promise<{ reference_code: string }> } {
  return { params: Promise.resolve({ reference_code: code }) };
}

beforeEach(() => {
  mockFindBookingByCode.mockReset();
  mockQuery.mockReset();
});

// ===========================================================================
// 1–3  Validation / 404
// ===========================================================================
describe("validation / 404", () => {
  it("1. malformed code (too short) → 404", async () => {
    const res = await POST(makePOST("TOOSHORT"), makeParams("TOOSHORT"));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).not.toHaveBeenCalled();
  });

  it("2. valid-pattern but unknown code → 404", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(404);
  });

  it("3. malformed 404 body === unknown 404 body (security invariant)", async () => {
    const malformedRes = await POST(
      makePOST("TOOSHORT"),
      makeParams("TOOSHORT"),
    );
    const malformedBody = await malformedRes.json();

    mockFindBookingByCode.mockResolvedValueOnce(null);
    const unknownRes = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const unknownBody = await unknownRes.json();

    expect(malformedBody).toEqual(unknownBody);
    expect(malformedRes.status).toBe(unknownRes.status);
  });
});

// ===========================================================================
// 4–7  Status guard / 409
// ===========================================================================
describe("status guard / 409", () => {
  it("4. booking 'pending' → 409 not_confirmed", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...CONFIRMED_ROW,
      status: "pending",
    });
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("not_confirmed");
  });

  it("5. booking 'cancelled' → 409 not_confirmed", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...CONFIRMED_ROW,
      status: "cancelled",
    });
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("not_confirmed");
  });

  it("6. booking 'expired' → 409 not_confirmed", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...CONFIRMED_ROW,
      status: "expired",
    });
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(409);
  });

  it("7. pool.query UPDATE is NOT called when booking is non-confirmed", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...CONFIRMED_ROW,
      status: "pending",
    });
    await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 8–13  Happy path / 200
// ===========================================================================
describe("happy path / 200", () => {
  it("8. confirmed booking with no prior arrived_at → 200, arrived_at is set", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(CONFIRMED_ROW);
    mockQuery.mockResolvedValueOnce({ rows: [ARRIVED_RESULT_ROW] });

    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.arrived_at).toBe("string");
  });

  it("9. all required Booking schema fields present in 200 response", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(CONFIRMED_ROW);
    mockQuery.mockResolvedValueOnce({ rows: [ARRIVED_RESULT_ROW] });

    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(body).toHaveProperty("reference_code");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("window");
    expect(body.window).toHaveProperty("start");
    expect(body.window).toHaveProperty("end");
    expect(body).toHaveProperty("amount_paise");
    expect(body).toHaveProperty("spot_name");
    expect(body).toHaveProperty("bay_label");
    expect(body).toHaveProperty("address_line");
    expect(body).toHaveProperty("arrived_at");
  });

  it("10. idempotent: confirmed booking with arrived_at already set → 200 (not 409)", async () => {
    // Simulate a booking that was already arrived — second call should still
    // return 200, not an error.
    mockFindBookingByCode.mockResolvedValueOnce({
      ...CONFIRMED_ROW,
      arrived_at: ARRIVED_AT, // already set
    });
    mockQuery.mockResolvedValueOnce({ rows: [ARRIVED_RESULT_ROW] });

    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(200);
  });

  it("11. idempotent: original arrived_at timestamp is preserved, not overwritten", async () => {
    const firstArrival = "2026-10-01T05:00:00.000Z";
    // The DB row already has arrived_at set (COALESCE preserves it).
    mockFindBookingByCode.mockResolvedValueOnce({
      ...CONFIRMED_ROW,
      arrived_at: firstArrival,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...ARRIVED_RESULT_ROW, arrived_at: firstArrival }],
    });

    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(new Date(body.arrived_at).getTime()).toBe(
      new Date(firstArrival).getTime(),
    );
  });

  it("12. UPDATE SQL contains COALESCE (idempotency guard)", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(CONFIRMED_ROW);
    mockQuery.mockResolvedValueOnce({ rows: [ARRIVED_RESULT_ROW] });

    await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql.toUpperCase()).toContain("COALESCE");
  });

  it("13. no personal data fields in 200 response body", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(CONFIRMED_ROW);
    mockQuery.mockResolvedValueOnce({ rows: [ARRIVED_RESULT_ROW] });

    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(body).not.toHaveProperty("driver_phone");
    expect(body).not.toHaveProperty("driver_name");
    expect(body).not.toHaveProperty("vehicle_reg");
  });
});

// ===========================================================================
// 14–16  Error schema (ARCH-002)
// ===========================================================================
describe("error schema (ARCH-002)", () => {
  it("14. 404 body has exactly { error, message }", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("15. 409 body has exactly { error, message }", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...CONFIRMED_ROW,
      status: "pending",
    });
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("16. error fields are stable machine-readable tokens (no spaces)", async () => {
    // 404
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const res404 = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect((await res404.json()).error).toMatch(/^\w+$/);

    // 409
    mockFindBookingByCode.mockResolvedValueOnce({
      ...CONFIRMED_ROW,
      status: "pending",
    });
    const res409 = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect((await res409.json()).error).toMatch(/^\w+$/);
  });
});


/**
 * The guard is mocked above, which means nothing else in this file would notice
 * if the route stopped calling it — the mock would make an unthrottled endpoint
 * look tested. This is the assertion that stops that.
 */
describe("rate limiting is wired in", () => {
  it("calls the guard with the 'mutate' scope, before anything else", async () => {
    vi.mocked(rateLimitGuard).mockClear();
    // A malformed code, so the route returns 404 without needing a database
    // row. That the guard is still called is the point: throttling must happen
    // before validation, or an attacker gets free validation attempts.
    await POST(makePOST("TOOSHORT"), makeParams("TOOSHORT"));
    expect(rateLimitGuard).toHaveBeenCalledWith(expect.anything(), "mutate");
  });

  it("returns the guard's 429 when the caller is throttled", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(rateLimitGuard).mockResolvedValueOnce(
      NextResponse.json({ error: "rate_limited", message: "no" }, { status: 429 }),
    );
    const res = await POST(makePOST("TOOSHORT"), makeParams("TOOSHORT"));
    expect(res.status).toBe(429);
  });
});
