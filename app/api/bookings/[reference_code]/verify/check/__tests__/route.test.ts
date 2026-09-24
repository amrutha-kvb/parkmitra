/**
 * Tests for POST /api/bookings/{reference_code}/verify/check
 *
 * All DB access is mocked. The critical assertion is indistinguishability:
 * a failed verification and an unknown booking must produce byte-identical
 * response bodies. An attacker who can tell them apart has a reference-code
 * oracle.
 *
 * Test catalogue
 * ─────────────────────────────────────────────────────────────────────────
 * Indistinguishability
 *   1.  Unknown code → 200 { verified: false }
 *   2.  Malformed code → 200 { verified: false }
 *   3.  Wrong OTP code → 200 { verified: false }
 *   4.  BYTE-IDENTICAL: malformed vs unknown vs wrong-guess
 *
 * Validation / 400
 *   5.  Missing body → 400
 *   6.  Non-string code → 400
 *   7.  Code too short → 400
 *   8.  Code with letters → 400
 *
 * Happy path
 *   9.  Correct OTP → 200 { verified: true }
 *
 * Rate limiting
 *  10.  Guard is called with 'verify' scope
 *  11.  Returns 429 when throttled
 *
 * Error schema
 *  12.  400 body has exactly { error, message }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFindBookingByCode, mockVerifyOtp } = vi.hoisted(() => ({
  mockFindBookingByCode: vi.fn(),
  mockVerifyOtp: vi.fn(),
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
  verifyOtp: mockVerifyOtp,
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

function makePOST(code: string, body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/bookings/${encodeURIComponent(code)}/verify/check`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeParams(code: string) {
  return { params: Promise.resolve({ reference_code: code }) };
}

beforeEach(() => {
  mockFindBookingByCode.mockReset();
  mockVerifyOtp.mockReset();
});

// ===========================================================================
// 1–4  Indistinguishability
// ===========================================================================
describe("indistinguishability (phone-number oracle prevention)", () => {
  it("1. unknown code → 200 { verified: false }", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const res = await POST(
      makePOST(VALID_CODE, { code: "123456" }),
      makeParams(VALID_CODE),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: false });
  });

  it("2. malformed code → 200 { verified: false }", async () => {
    const res = await POST(
      makePOST("SHORT", { code: "123456" }),
      makeParams("SHORT"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: false });
  });

  it("3. wrong OTP guess → 200 { verified: false }", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    mockVerifyOtp.mockResolvedValueOnce({ verified: false, reason: "invalid_otp" });
    const res = await POST(
      makePOST(VALID_CODE, { code: "000000" }),
      makeParams(VALID_CODE),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: false });
  });

  it("4. BYTE-IDENTICAL responses: malformed vs unknown vs wrong-guess", async () => {
    // Malformed reference code
    const malformedRes = await POST(
      makePOST("SHORT", { code: "123456" }),
      makeParams("SHORT"),
    );
    const malformedBytes = new Uint8Array(await malformedRes.arrayBuffer());

    // Unknown reference code
    mockFindBookingByCode.mockResolvedValueOnce(null);
    const unknownRes = await POST(
      makePOST(VALID_CODE, { code: "123456" }),
      makeParams(VALID_CODE),
    );
    const unknownBytes = new Uint8Array(await unknownRes.arrayBuffer());

    // Known booking, wrong guess
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    mockVerifyOtp.mockResolvedValueOnce({ verified: false, reason: "invalid_otp" });
    const wrongRes = await POST(
      makePOST(VALID_CODE, { code: "000000" }),
      makeParams(VALID_CODE),
    );
    const wrongBytes = new Uint8Array(await wrongRes.arrayBuffer());

    // All three must be identical.
    expect(malformedRes.status).toBe(unknownRes.status);
    expect(unknownRes.status).toBe(wrongRes.status);

    expect(malformedBytes).toEqual(unknownBytes);
    expect(unknownBytes).toEqual(wrongBytes);
  });
});

// ===========================================================================
// 5–8  Validation / 400
// ===========================================================================
describe("validation / 400", () => {
  it("5. missing body → 400", async () => {
    const req = new NextRequest(
      `http://localhost/api/bookings/${VALID_CODE}/verify/check`,
      { method: "POST" },
    );
    const res = await POST(req, makeParams(VALID_CODE));
    expect(res.status).toBe(400);
  });

  it("6. non-string code → 400", async () => {
    const res = await POST(
      makePOST(VALID_CODE, { code: 123456 }),
      makeParams(VALID_CODE),
    );
    expect(res.status).toBe(400);
  });

  it("7. code too short → 400", async () => {
    const res = await POST(
      makePOST(VALID_CODE, { code: "1234" }),
      makeParams(VALID_CODE),
    );
    expect(res.status).toBe(400);
  });

  it("8. code with letters → 400", async () => {
    const res = await POST(
      makePOST(VALID_CODE, { code: "12ab56" }),
      makeParams(VALID_CODE),
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 9  Happy path
// ===========================================================================
describe("happy path", () => {
  it("9. correct OTP → 200 { verified: true }", async () => {
    mockFindBookingByCode.mockResolvedValueOnce(PENDING_ROW);
    mockVerifyOtp.mockResolvedValueOnce({ verified: true });
    const res = await POST(
      makePOST(VALID_CODE, { code: "482917" }),
      makeParams(VALID_CODE),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: true });
  });
});

// ===========================================================================
// 10–11  Rate limiting
// ===========================================================================
describe("rate limiting", () => {
  it("10. guard is called with 'verify' scope", async () => {
    vi.mocked(rateLimitGuard).mockClear();
    await POST(
      makePOST("SHORT", { code: "123456" }),
      makeParams("SHORT"),
    );
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
    const res = await POST(
      makePOST(VALID_CODE, { code: "123456" }),
      makeParams(VALID_CODE),
    );
    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// 12  Error schema
// ===========================================================================
describe("error schema (ARCH-002)", () => {
  it("12. 400 body has exactly { error, message }", async () => {
    const res = await POST(
      makePOST(VALID_CODE, { code: "short" }),
      makeParams(VALID_CODE),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });
});
