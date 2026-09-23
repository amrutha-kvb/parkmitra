/**
 * Tests for POST /api/owners  (app/api/owners/route.ts)
 *
 * All external dependencies (lib/db, lib/owner) are mocked so the suite
 * runs without a database.  The tests verify:
 *
 * Validation — 400
 *   1.  Missing spot_id                → 400 missing_field
 *   2.  Non-integer spot_id            → 400 invalid_field
 *   3.  Negative spot_id               → 400 invalid_field
 *   4.  Float spot_id                  → 400 invalid_field
 *   5.  spot_id not found in DB        → 400 spot_not_found
 *   6.  Invalid JSON body              → 400 invalid_json
 *
 * Conflict — 409
 *   7.  Spot already has an active owner (23505) → 409 owner_exists
 *   8.  Non-23505 DB error re-thrown (surfaces as 500)
 *
 * Happy path — 201
 *   9.  Returns 201 with OwnerCreateResponse schema
 *  10.  owner_token matches Crockford base32 pattern
 *  11.  spot_id echoes the request value
 *  12.  owner_phone and owner_name are returned when provided
 *  13.  owner_phone defaults to null when absent
 *  14.  owner_name defaults to null when absent
 *  15.  createOwner is called with the correct arguments
 *  16.  Response has exactly the OwnerCreateResponse fields (no extras)
 *
 * Security
 *  17.  Spot existence query is parameterised (SEC-004)
 *  18.  No database query when validation fails
 *
 * Error schema (ARCH-002)
 *  19.  400 body has exactly { error, message }
 *  20.  409 body has exactly { error, message }
 *  21.  error field is a stable machine-readable token (no spaces)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoist shared mocks — must happen before any imports.
// ---------------------------------------------------------------------------
const { mockQuery, mockCreateOwner } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockCreateOwner: vi.fn(),
}));

vi.mock("../../../../lib/db", () => ({
  default: { query: mockQuery },
}));

vi.mock("../../../../lib/owner", () => ({
  createOwner: mockCreateOwner,
}));

// Import handler after mocks are in place.
import { POST } from "../route";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_BODY = {
  spot_id: 3,
  owner_phone: "+919876543210",
  owner_name: "Ravi Sharma",
};

const OWNER_ROW = {
  id: 1,
  spot_id: 3,
  owner_token: "A1B2C3D4E5",
  owner_phone: "+919876543210",
  owner_name: "Ravi Sharma",
  is_active: true,
  created_at: "2026-09-23T10:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/owners", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupHappyPath(ownerRow: Partial<typeof OWNER_ROW> = {}): void {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });
  mockCreateOwner.mockResolvedValueOnce({ ...OWNER_ROW, ...ownerRow });
}

// ---------------------------------------------------------------------------
// Reset mocks between tests.
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockQuery.mockReset();
  mockCreateOwner.mockReset();
});

// ===========================================================================
// 1–6  Input validation → 400
// ===========================================================================
describe("input validation → 400", () => {
  it("1. returns 400 when spot_id is absent", async () => {
    const { spot_id: _, ...noId } = VALID_BODY;
    const res = await POST(makeRequest(noId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_field");
    expect(body.message).toMatch(/spot_id/i);
  });

  it("2. returns 400 when spot_id is not an integer", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, spot_id: "abc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_field");
    expect(body.message).toMatch(/spot_id/i);
  });

  it("3. returns 400 when spot_id is negative", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, spot_id: -1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_field");
  });

  it("4. returns 400 when spot_id is a float", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, spot_id: 3.7 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_field");
  });

  it("5. returns 400 when the spot does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("spot_not_found");
  });

  it("6. returns 400 for a non-JSON body", async () => {
    const req = new NextRequest("http://localhost/api/owners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "this is not json {{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });
});

// ===========================================================================
// 7–8  Conflict → 409
// ===========================================================================
describe("conflict → 409", () => {
  it("7. returns 409 when spot already has an active owner (23505)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    const pgError = Object.assign(new Error("unique_violation"), {
      code: "23505",
    });
    mockCreateOwner.mockRejectedValueOnce(pgError);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("owner_exists");
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("8. re-throws non-23505 DB errors (unexpected failures surface as 500)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    const pgError = Object.assign(new Error("connection refused"), {
      code: "08006",
    });
    mockCreateOwner.mockRejectedValueOnce(pgError);

    await expect(POST(makeRequest(VALID_BODY))).rejects.toThrow(
      "connection refused",
    );
  });
});

// ===========================================================================
// 9–16  Happy path → 201
// ===========================================================================
describe("happy path → 201", () => {
  it("9. returns 201 with OwnerCreateResponse schema", async () => {
    setupHappyPath();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("owner_token");
    expect(body).toHaveProperty("spot_id");
    expect(body).toHaveProperty("owner_phone");
    expect(body).toHaveProperty("owner_name");
  });

  it("10. owner_token matches Crockford base32 pattern", async () => {
    setupHappyPath({ owner_token: "7K2M9QX4TB" });
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.owner_token).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
  });

  it("11. spot_id echoes the request value", async () => {
    setupHappyPath({ spot_id: 3 });
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.spot_id).toBe(3);
  });

  it("12. owner_phone and owner_name are returned when provided", async () => {
    setupHappyPath();
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.owner_phone).toBe("+919876543210");
    expect(body.owner_name).toBe("Ravi Sharma");
  });

  it("13. owner_phone defaults to null when absent", async () => {
    setupHappyPath({ owner_phone: null });
    const res = await POST(
      makeRequest({ spot_id: 3 }),
    );
    expect(mockCreateOwner).toHaveBeenCalledWith(3, null, null);
  });

  it("14. owner_name defaults to null when absent", async () => {
    setupHappyPath({ owner_name: null });
    const res = await POST(
      makeRequest({ spot_id: 3, owner_phone: "+919876543210" }),
    );
    expect(mockCreateOwner).toHaveBeenCalledWith(3, "+919876543210", null);
  });

  it("15. createOwner is called with the correct arguments", async () => {
    setupHappyPath();
    await POST(makeRequest(VALID_BODY));
    expect(mockCreateOwner).toHaveBeenCalledWith(
      3,
      "+919876543210",
      "Ravi Sharma",
    );
  });

  it("16. response has exactly the OwnerCreateResponse fields", async () => {
    setupHappyPath();
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["owner_name", "owner_phone", "owner_token", "spot_id"],
    );
  });
});

// ===========================================================================
// 17–18  Security
// ===========================================================================
describe("security", () => {
  it("17. spot existence query is parameterised (SEC-004)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await POST(makeRequest({ ...VALID_BODY, spot_id: 42 }));
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("42");
    expect(params).toContain(42);
  });

  it("18. no database query when validation fails", async () => {
    const { spot_id: _, ...noId } = VALID_BODY;
    await POST(makeRequest(noId));
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockCreateOwner).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 19–21  Error schema (ARCH-002)
// ===========================================================================
describe("error schema (ARCH-002)", () => {
  it("19. 400 body has exactly { error, message }", async () => {
    const { spot_id: _, ...noId } = VALID_BODY;
    const res = await POST(makeRequest(noId));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("20. 409 body has exactly { error, message }", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    mockCreateOwner.mockRejectedValueOnce(
      Object.assign(new Error("unique_violation"), { code: "23505" }),
    );
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("21. error field is a stable machine-readable token (no spaces)", async () => {
    const { spot_id: _, ...noId } = VALID_BODY;
    const res = await POST(makeRequest(noId));
    const body = await res.json();
    expect(body.error).toMatch(/^\w+$/);
  });
});
