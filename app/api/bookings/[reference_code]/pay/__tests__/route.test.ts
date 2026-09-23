/**
 * Tests for POST /api/bookings/[reference_code]/pay
 * (app/api/bookings/[reference_code]/pay/route.ts)
 *
 * All DB access is mocked (lib/booking-lookup + lib/db pool) so no database
 * is needed.
 *
 * Contract under test (openapi.yaml  →  payBooking):
 *   200  pending booking paid → Booking schema, status 'confirmed'
 *   404  malformed code  → IDENTICAL body to unknown code
 *   404  unknown code    → IDENTICAL body to malformed code
 *   409  already confirmed / cancelled / expired
 *
 * Test catalogue
 * ─────────────────────────────────────────────────────────────────────────
 * Validation / 404
 *   1.  Malformed code → 404 booking_not_found
 *   2.  Valid-pattern unknown code → 404 booking_not_found
 *   3.  Malformed 404 body === unknown 404 body (security invariant)
 *
 * Status guard / 409
 *   4.  Booking already 'confirmed' → 409 already_confirmed
 *   5.  Booking 'cancelled' → 409 already_confirmed
 *   6.  Booking 'expired' → 409 already_confirmed
 *   7.  DB is NOT queried for mutation when booking is non-pending
 *
 * Happy path / 200
 *   8.  Pending booking → 200, status is 'confirmed'
 *   9.  All required Booking schema fields present
 *  10.  payment INSERT uses provider='simulated', status='paid'
 *  11.  Transaction is committed (BEGIN … COMMIT called)
 *  12.  ROLLBACK is called on error
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
const { mockFindBookingByCode, mockPoolConnect } = vi.hoisted(() => ({
  mockFindBookingByCode: vi.fn(),
  mockPoolConnect: vi.fn(),
}));

vi.mock("../../../../../../lib/booking-lookup", async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import("../../../../../../lib/booking-lookup")
    >();
  return { ...real, findBookingByCode: mockFindBookingByCode };
});

vi.mock("../../../../../../lib/db", () => ({
  default: { connect: mockPoolConnect },
}));

import { POST } from "../route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_CODE = "A1B2C3D4E5";

const PENDING_ROW = {
  id: 42,
  reference_code: VALID_CODE,
  status: "pending" as const,
  window_start: "2026-10-01T04:30:00.000Z",
  window_end: "2026-10-01T06:30:00.000Z",
  amount_paise: 8000,
  spot_name: "Cyber Heights Visitor Bay",
  bay_label: "B-12",
  address_line: "Cyber Heights, Gachibowli, Hyderabad",
  arrived_at: null,
};

const CONFIRMED_RESULT_ROW = {
  ...PENDING_ROW,
  status: "confirmed" as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePOST(code: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/bookings/${encodeURIComponent(code)}/pay`,
    { method: "POST" },
  );
}

function makeParams(
  code: string,
): { params: Promise<{ reference_code: string }> } {
  return { params: Promise.resolve({ reference_code: code }) };
}

/**
 * Build a mock pg client that returns `queryResult` for any query after
 * BEGIN/COMMIT/ROLLBACK placeholders.
 */
function mockClient(queryResult: { rows: unknown[] }) {
  const client = {
    query: vi.fn().mockImplementation((sql: string) => {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql.trim())) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve(queryResult);
    }),
    release: vi.fn(),
  };
  mockPoolConnect.mockResolvedValue(client);
  return client;
}

beforeEach(() => {
  mockFindBookingByCode.mockReset();
  mockPoolConnect.mockReset();
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
    const malformedRes = await POST(makePOST("TOOSHORT"), makeParams("TOOSHORT"));
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
  it("4. booking already 'confirmed' → 409 already_confirmed", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...PENDING_ROW,
      status: "confirmed",
    });
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("already_confirmed");
  });

  it("5. booking 'cancelled' → 409 already_confirmed", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...PENDING_ROW,
      status: "cancelled",
    });
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("already_confirmed");
  });

  it("6. booking 'expired' → 409 already_confirmed", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...PENDING_ROW,
      status: "expired",
    });
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(409);
  });

  it("7. pool.connect is NOT called when booking is non-pending", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...PENDING_ROW,
      status: "confirmed",
    });
    await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 8–13  Happy path / 200
// ===========================================================================
describe("happy path / 200", () => {
  it("8. pending booking → 200 with status 'confirmed'", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    mockClient({ rows: [CONFIRMED_RESULT_ROW] });

    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("confirmed");
  });

  it("9. all required Booking schema fields present in 200 response", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    mockClient({ rows: [CONFIRMED_RESULT_ROW] });

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

  it("10. the CTE SQL contains 'simulated' and 'paid' literals (parameterised via CTE)", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    const client = mockClient({ rows: [CONFIRMED_RESULT_ROW] });

    await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));

    // Find the main CTE call (not BEGIN/COMMIT).
    const cteCall = client.query.mock.calls.find((call: unknown[]) => {
      const sql = call[0] as string;
      return !["BEGIN", "COMMIT", "ROLLBACK"].includes(sql.trim());
    });
    expect(cteCall).toBeDefined();
    const sql = ((cteCall ?? []) as unknown[])[0] as string;
    expect(sql).toContain("simulated");
    expect(sql).toContain("paid");
  });

  it("11. BEGIN and COMMIT are called on the client", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    const client = mockClient({ rows: [CONFIRMED_RESULT_ROW] });

    await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));

    const calls = (client.query.mock.calls as unknown[][]).map((c) => (c[0] as string).trim());
    expect(calls).toContain("BEGIN");
    expect(calls).toContain("COMMIT");
  });

  it("12. ROLLBACK is called and error is re-thrown when the DB query fails", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.trim() === "BEGIN") return Promise.resolve({ rows: [] });
        if (sql.trim() === "ROLLBACK") return Promise.resolve({ rows: [] });
        return Promise.reject(new Error("db kaboom"));
      }),
      release: vi.fn(),
    };
    mockPoolConnect.mockResolvedValue(client);

    await expect(
      POST(makePOST(VALID_CODE), makeParams(VALID_CODE)),
    ).rejects.toThrow("db kaboom");

    const calls = (client.query.mock.calls as unknown[][]).map((c) => (c[0] as string).trim());
    expect(calls).toContain("ROLLBACK");
  });

  it("13. no personal data fields in 200 response body", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    mockClient({ rows: [CONFIRMED_RESULT_ROW] });

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
      ...PENDING_ROW,
      status: "confirmed",
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
      ...PENDING_ROW,
      status: "confirmed",
    });
    const res409 = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect((await res409.json()).error).toMatch(/^\w+$/);
  });
});
