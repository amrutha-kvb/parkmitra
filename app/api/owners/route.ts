/**
 * POST /api/owners — onboard an owner for a spot.
 *
 * Creates an owner row and returns the generated owner_token exactly once.
 * The token is never retrievable again — if the caller does not capture it
 * from this response, the only recovery is to revoke and re-create.
 *
 * In v1 this is called by the team during manual onboarding, not by the
 * owner themselves. It is an API endpoint rather than a SQL script so that
 * the token generation and the uniqueness constraint are exercised through
 * the same code path the owner surface will use.
 *
 * @see design/openapi.yaml  →  /owners  →  POST  →  createOwner
 * @see design/adr/ADR-004-owner-capability.md
 */

import { NextRequest, NextResponse } from "next/server";
import pool from "../../../lib/db";
import { createOwner } from "../../../lib/owner";

// ---------------------------------------------------------------------------
// Types — mirror the OpenAPI contract exactly (ARCH-002).
// ---------------------------------------------------------------------------

interface OwnerCreateRequestBody {
  spot_id: number;
  owner_phone?: string | null;
  owner_name?: string | null;
}

interface OwnerCreateResponse {
  owner_token: string;
  spot_id: number;
  owner_phone: string | null;
  owner_name: string | null;
}

interface ErrorResponse {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function badRequest(error: string, message: string): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>({ error, message }, { status: 400 });
}

function conflict(error: string, message: string): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>({ error, message }, { status: 409 });
}

// ---------------------------------------------------------------------------
// SQL — spot existence check
// ---------------------------------------------------------------------------

const SPOT_EXISTS_SQL = `
  SELECT id FROM spots WHERE id = $1 AND is_active = true
`;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/owners
 *
 * Request body (application/json):
 *   spot_id       integer  — required
 *   owner_phone   string   — optional, personal data
 *   owner_name    string   — optional, personal data
 *
 * Success 201 body  → OwnerCreateResponse (openapi.yaml)
 * Error 400 body    → Error schema  (malformed / missing fields / spot not found)
 * Error 409 body    → Error schema  (spot already has an active owner)
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<OwnerCreateResponse | ErrorResponse>> {
  // -------------------------------------------------------------------------
  // 1. Parse the JSON body.
  // -------------------------------------------------------------------------
  let body: Partial<OwnerCreateRequestBody>;
  try {
    body = (await request.json()) as Partial<OwnerCreateRequestBody>;
  } catch {
    return badRequest("invalid_json", "Request body must be valid JSON.");
  }

  // -------------------------------------------------------------------------
  // 2. Input validation (SEC-003) — required fields.
  // -------------------------------------------------------------------------
  const { spot_id, owner_phone, owner_name } = body;

  if (spot_id === undefined || spot_id === null) {
    return badRequest("missing_field", "Field 'spot_id' is required.");
  }
  if (!Number.isInteger(spot_id) || spot_id <= 0) {
    return badRequest(
      "invalid_field",
      "'spot_id' must be a positive integer.",
    );
  }

  // -------------------------------------------------------------------------
  // 3. Verify the spot exists and is active.
  // -------------------------------------------------------------------------
  const spotResult = await pool.query(SPOT_EXISTS_SQL, [spot_id]);

  if (spotResult.rows.length === 0) {
    return badRequest(
      "spot_not_found",
      "No active spot found with that spot_id.",
    );
  }

  // -------------------------------------------------------------------------
  // 4. Create the owner.
  //    The unique partial index (spot_id WHERE is_active) rejects a second
  //    active owner for the same spot → 23505 (unique_violation) → 409.
  // -------------------------------------------------------------------------
  let owner;

  try {
    owner = await createOwner(
      spot_id,
      owner_phone ?? null,
      owner_name ?? null,
    );
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      return conflict(
        "owner_exists",
        "This spot already has an active owner.",
      );
    }
    throw err;
  }

  // -------------------------------------------------------------------------
  // 5. Return the 201 response with the token shown exactly once.
  // -------------------------------------------------------------------------
  const responseBody: OwnerCreateResponse = {
    owner_token: owner.owner_token,
    spot_id: owner.spot_id,
    owner_phone: owner.owner_phone,
    owner_name: owner.owner_name,
  };

  return NextResponse.json<OwnerCreateResponse>(responseBody, { status: 201 });
}
