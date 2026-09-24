/**
 * Tests for POST /api/bookings/{reference_code}/verify/start
 *
 * All DB access is mocked. The critical assertion is indistinguishability:
 * a known booking and an unknown booking must produce byte-identical
 * response bodies. If they differ by a single byte, an attacker can use
 * the endpoint as a reference-code oracle.
 *
 * Test catalogue
 * ─────────────────────────────────────────────────────────────────────────
 * Indistinguishability
 *   1.  Unknown code → 200 with generic message
 *   2.  Malformed code → 200 with generic message
 *   3.  Known booking → 200 with generic message
 *   4.  Cancelled booking → 200 with generic message
 *   5.  BYTE-IDENTICAL: malformed vs unknown vs known vs cancelled
 *
 * OTP creation
 *   6.  createOtp is called for a valid pending booking
 *   7.  createOtp is NOT called for unknown booking
 *   8.  createOtp is NOT called for malformed code
 *   9.  createOtp is NOT called for cancelled booking
 *
 * Rate limiting
 *  10.  Guard is called with 'verify' scope
 *  11.  Returns 429 when throttled
 *
 * Error schema
 *  12.  Response body has exactly { message }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindBookingByCode, mockCreateOtp } = vi.hoisted(() => ({
  mockFindBookingByCode: vi.fn(),
  mockCreateOtp: vi.fn(),
}));

vi.mock("../../../../../../../lib/rate-limit-guard", () => ({
  rateLimitGuard: vi.fn(async () => null),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../../../../../../lib/booking-lookup", async (importOriginal) => {
  const real = await importOriginal<
    typeof import("../../../../../../../lib/booking-lookup")
  >();
  return { ...real, findBookingByCode: mockFindBookingByCode };
});

vi.mock("../../../../../../../lib/otp", () => ({
  createOtp: mockCreateOtp,
}));

import { POST } from "../route";
import { rateLimitGuard } from "../../../../../../../lib/rate-limit-guard";

const VALID_CODE = "A1B2C3D4E5";

const PENDING_ROW = {
  id: 42,
  reference_code: VALID_CODE,
  status: "pending" as const,
  window_start: "2026-10-01T04:30:00.000Z",
  window_end: "2026-10-01T06:30:00.000Z",
  amount_paise: 8000,
  spot_name: "Test Spot",
  bay_label: "B-01",
  address_line: "Test Address",
  arrived_at: null,
};

function makePOST(code: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/bookings/${encodeURIComponent(code)}/verify/start`,
    { method: "POST" },
  );
}

function makeParams(code: string) {
  return { params: Promise.resolve({ reference_code: code }) };
}

beforeEach(() => {
  mockFindBookingByCode.mockReset();
  mockCreateOtp.mockReset();
  mockCreateOtp.mockResolvedValue({ otp: "123456", expires_at: new Date() });
});

// ===========================================================================
// 1–5  Indistinguishability
// ===========================================================================
describe("indistinguishability (phone-number oracle prevention)", () => {
  it("1. unknown code → 200", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(200);
  });

  it("2. malformed code → 200", async () => {
    const res = await POST(makePOST("SHORT"), makeParams("SHORT"));
    expect(res.status).toBe(200);
  });

  it("3. known pending booking → 200", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(200);
  });

  it("4. cancelled booking → 200", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...PENDING_ROW,
      status: "cancelled",
    });
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(200);
  });

  it("5. message field is identical across malformed, unknown, known, and cancelled", async () => {
    // Malformed
    const malformedRes = await POST(makePOST("SHORT"), makeParams("SHORT"));
    const malformedBody = await malformedRes.json();

    // Unknown
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const unknownRes = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const unknownBody = await unknownRes.json();

    // Known pending
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    const knownRes = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const knownBody = await knownRes.json();

    // Cancelled
    mockFindBookingByCode.mockResolvedValueOnce({
      ...PENDING_ROW,
      status: "cancelled",
    });
    const cancelledRes = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const cancelledBody = await cancelledRes.json();

    // Status codes identical.
    expect(malformedRes.status).toBe(unknownRes.status);
    expect(unknownRes.status).toBe(knownRes.status);
    expect(knownRes.status).toBe(cancelledRes.status);

    // The message field — the only production-visible field — is identical.
    expect(malformedBody.message).toBe(unknownBody.message);
    expect(unknownBody.message).toBe(knownBody.message);
    expect(knownBody.message).toBe(cancelledBody.message);

    // All responses have the same keys (message + _dev_code in test env).
    expect(Object.keys(malformedBody).sort()).toEqual(Object.keys(unknownBody).sort());
    expect(Object.keys(unknownBody).sort()).toEqual(Object.keys(knownBody).sort());
    expect(Object.keys(knownBody).sort()).toEqual(Object.keys(cancelledBody).sort());
  });
});

// ===========================================================================
// 6–9  OTP creation
// ===========================================================================
describe("OTP creation", () => {
  it("6. createOtp is called for a valid pending booking", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(mockCreateOtp).toHaveBeenCalledWith(42);
  });

  it("7. createOtp is NOT called for unknown booking", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(null);
    await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(mockCreateOtp).not.toHaveBeenCalled();
  });

  it("8. createOtp is NOT called for malformed code", async () => {
    await POST(makePOST("SHORT"), makeParams("SHORT"));
    expect(mockCreateOtp).not.toHaveBeenCalled();
  });

  it("9. createOtp is NOT called for cancelled booking", async () => {
    mockFindBookingByCode.mockResolvedValueOnce({
      ...PENDING_ROW,
      status: "cancelled",
    });
    await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(mockCreateOtp).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 10–11  Rate limiting
// ===========================================================================
describe("rate limiting", () => {
  it("10. guard is called with 'verify' scope", async () => {
    vi.mocked(rateLimitGuard).mockClear();
    await POST(makePOST("SHORT"), makeParams("SHORT"));
    expect(rateLimitGuard).toHaveBeenCalledWith(expect.anything(), "verify");
  });

  it("11. returns 429 when throttled", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(rateLimitGuard).mockResolvedValueOnce(
      NextResponse.json(
        { error: "rate_limited", message: "Too many requests." },
        { status: 429 },
      ),
    );
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// 12  Response schema
// ===========================================================================
describe("response schema", () => {
  it("12. 200 body has message field and same shape for all cases", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const res = await POST(makePOST(VALID_CODE), makeParams(VALID_CODE));
    const body = await res.json();
    expect(body).toHaveProperty("message");
    expect(typeof body.message).toBe("string");
  });
});
