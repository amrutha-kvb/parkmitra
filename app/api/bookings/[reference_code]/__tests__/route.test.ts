/**
 * Tests for GET /api/bookings/[reference_code]
 * (app/api/bookings/[reference_code]/route.ts)
 *
 * All DB access is mocked via lib/booking-lookup so no database is needed.
 *
 * Contract under test (openapi.yaml  →  getBooking):
 *   200  booking found → full Booking schema body
 *   404  malformed code → IDENTICAL body to unknown code (security invariant)
 *   404  unknown code  → IDENTICAL body to malformed code
 *
 * Test catalogue
 * ─────────────────────────────────────────────────────────────────────────
 * Validation / 404
 *   1.  Code shorter than 10 chars → 404 booking_not_found
 *   2.  Code longer  than 10 chars → 404 booking_not_found
 *   3.  Code with invalid char (lowercase) → 404 booking_not_found
 *   4.  Code with excluded char 'I' → 404 booking_not_found
 *   5.  Code with excluded char 'L' → 404 booking_not_found
 *   6.  Code with excluded char 'O' → 404 booking_not_found
 *   7.  Code with excluded char 'U' → 404 booking_not_found
 *   8.  Empty string → 404 booking_not_found
 *   9.  Valid-pattern but unknown code → 404 booking_not_found
 *  10.  Malformed 404 body === unknown 404 body (security invariant)
 *
 * Happy path / 200
 *  11.  Known code → 200 with all required Booking schema fields
 *  12.  status field echoes DB value
 *  13.  window.start and window.end are ISO 8601 UTC strings
 *  14.  arrived_at is null when unset
 *  15.  arrived_at is an ISO string when set
 *  16.  No personal data fields in the response body
 *
 * Error schema (ARCH-002)
 *  17.  404 body has exactly { error, message }
 *  18.  error field is a stable machine-readable token (no spaces)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoist mocks before any imports.
// ---------------------------------------------------------------------------
const { mockFindBookingByCode, mockCheckRateLimit } = vi.hoisted(() => ({
  mockFindBookingByCode: vi.fn(),
  mockCheckRateLimit: vi.fn(),
}));

vi.mock("../../../../../lib/booking-lookup", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../../../../lib/booking-lookup")>();
  return { ...real, findBookingByCode: mockFindBookingByCode };
});

vi.mock("../../../../../lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// Import the handler AFTER the mock is in place.
import { GET } from "../route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_CODE = "A1B2C3D4E5"; // matches ^[0-9A-HJKMNP-TV-Z]{10}$

const BOOKING_ROW = {
  id: 42,
  reference_code: VALID_CODE,
  status: "pending" as const,
  window_start: "2026-10-01T04:30:00.000Z", // 10:00 IST
  window_end: "2026-10-01T06:30:00.000Z",   // 12:00 IST
  amount_paise: 8000,
  spot_name: "Cyber Heights Visitor Bay",
  bay_label: "B-12",
  address_line: "Cyber Heights, Gachibowli, Hyderabad",
  arrived_at: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGET(code: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/bookings/${encodeURIComponent(code)}`,
  );
}

function makeParams(
  code: string,
): { params: Promise<{ reference_code: string }> } {
  return { params: Promise.resolve({ reference_code: code }) };
}

beforeEach(() => {
  mockFindBookingByCode.mockReset();
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

// ===========================================================================
// 1–10  Validation / 404
// ===========================================================================
describe("validation / 404", () => {
  it("1. code shorter than 10 chars → 404", async () => {
    const res = await GET(makeGET("A1B2C3D4E"), makeParams("A1B2C3D4E"));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).not.toHaveBeenCalled();
  });

  it("2. code longer than 10 chars → 404", async () => {
    const code = "A1B2C3D4E5F";
    const res = await GET(makeGET(code), makeParams(code));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).not.toHaveBeenCalled();
  });

  it("3. code with lowercase letter → 404", async () => {
    const code = "a1B2C3D4E5";
    const res = await GET(makeGET(code), makeParams(code));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).not.toHaveBeenCalled();
  });

  it("4. code containing 'I' (Crockford exclusion) → 404", async () => {
    const code = "A1B2C3D4EI";
    const res = await GET(makeGET(code), makeParams(code));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).not.toHaveBeenCalled();
  });

  it("5. code containing 'L' (Crockford exclusion) → 404", async () => {
    const code = "A1B2C3D4EL";
    const res = await GET(makeGET(code), makeParams(code));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).not.toHaveBeenCalled();
  });

  it("6. code containing 'O' (Crockford exclusion) → 404", async () => {
    const code = "A1B2C3D4EO";
    const res = await GET(makeGET(code), makeParams(code));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).not.toHaveBeenCalled();
  });

  it("7. code containing 'U' (Crockford exclusion) → 404", async () => {
    const code = "A1B2C3D4EU";
    const res = await GET(makeGET(code), makeParams(code));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).not.toHaveBeenCalled();
  });

  it("8. empty string → 404", async () => {
    const res = await GET(makeGET(""), makeParams(""));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).not.toHaveBeenCalled();
  });

  it("9. valid-pattern but unknown code → 404", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(404);
    expect(mockFindBookingByCode).toHaveBeenCalledWith(VALID_CODE);
  });

  it("10. malformed-code 404 body is identical to unknown-code 404 body (security invariant)", async () => {
    // Malformed code (too short)
    const malformedRes = await GET(
      makeGET("TOOSHORT"),
      makeParams("TOOSHORT"),
    );
    const malformedBody = await malformedRes.json();

    // Unknown code (valid pattern, DB returns null)
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const unknownRes = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    const unknownBody = await unknownRes.json();

    expect(malformedBody).toEqual(unknownBody);
    expect(malformedRes.status).toBe(unknownRes.status);
  });
});

// ===========================================================================
// 11–16  Happy path / 200
// ===========================================================================
describe("happy path / 200", () => {
  it("11. known code → 200 with all required Booking schema fields", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(BOOKING_ROW);
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(200);
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

  it("12. status field echoes the DB value", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...BOOKING_ROW,
      status: "confirmed",
    });
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(body.status).toBe("confirmed");
  });

  it("13. window.start and window.end are ISO 8601 UTC strings", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(BOOKING_ROW);
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(body.window.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(body.window.end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Round-trips must preserve the instant.
    expect(new Date(body.window.start).getTime()).toBe(
      new Date(BOOKING_ROW.window_start).getTime(),
    );
    expect(new Date(body.window.end).getTime()).toBe(
      new Date(BOOKING_ROW.window_end).getTime(),
    );
  });

  it("14. arrived_at is null when the booking has not arrived", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...BOOKING_ROW,
      arrived_at: null,
    });
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(body.arrived_at).toBeNull();
  });

  it("15. arrived_at is an ISO string when set", async () => {
    const arrivedAt = "2026-10-01T05:00:00.000Z";
    mockFindBookingByCode.mockResolvedValueOnce({
      ...BOOKING_ROW,
      arrived_at: arrivedAt,
    });
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(typeof body.arrived_at).toBe("string");
    expect(new Date(body.arrived_at).getTime()).toBe(
      new Date(arrivedAt).getTime(),
    );
  });

  it("16. no personal data fields in the response body", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(BOOKING_ROW);
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(body).not.toHaveProperty("driver_phone");
    expect(body).not.toHaveProperty("driver_name");
    expect(body).not.toHaveProperty("vehicle_reg");
  });
});

// ===========================================================================
// 17–18  Error schema (ARCH-002)
// ===========================================================================
// ===========================================================================
// 19  Fail-open (rate limiter unavailable)
// ===========================================================================
describe("fail-open", () => {
  it("19. limiter throwing does not block a legitimate lookup", async () => {
    mockCheckRateLimit.mockRejectedValueOnce(new Error("connection refused"));
    mockFindBookingByCode.mockResolvedValueOnce(BOOKING_ROW);
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reference_code).toBe(VALID_CODE);
  });

  it("20. limiter failure is logged so the operator knows", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCheckRateLimit.mockRejectedValueOnce(new Error("connection refused"));
    mockFindBookingByCode.mockResolvedValueOnce(BOOKING_ROW);
    await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    expect(spy).toHaveBeenCalledWith(
      "rate-limit check failed, proceeding without throttling:",
      "Error",
    );
    spy.mockRestore();
  });

  // SEC-001. A pg error can carry the connection string in its message or in
  // its attached properties, and server logs get shipped elsewhere. The
  // operator signal that matters is THAT the limiter failed, not the detail.
  // app/api/health/route.ts swallows errors entirely for the same reason.
  it("21. the logged value never contains the connection string", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCheckRateLimit.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED postgres://user:hunter2@db.example.com:5432/parkmitra"),
    );
    mockFindBookingByCode.mockResolvedValueOnce(BOOKING_ROW);
    await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("postgres://");
    expect(logged).not.toContain("hunter2");
    spy.mockRestore();
  });
});

describe("error schema (ARCH-002)", () => {
  it("17. 404 body has exactly { error, message }", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("18. error field is a stable machine-readable token (no spaces)", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const res = await GET(makeGET(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(body.error).toMatch(/^\w+$/);
  });
});
