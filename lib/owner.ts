/**
 * Owner query layer — the supply-side counterpart to lib/availability.ts.
 *
 * Three functions, each a single parameterised statement:
 *   createOwner       — onboard an owner for a spot (generates the token)
 *   findOwnerByToken  — resolve an owner_token to the owner + spot row
 *   listOwnerBookings — all non-cancelled bookings for an owner's spot
 *
 * ADR-004: the owner_token is a capability. Possession is authorisation.
 * No endpoint accepts a phone number, spot name, or spot id as a lookup key.
 *
 * SEC-004: every query is fully parameterised — no string concatenation of
 * user input anywhere in this module.
 */

import { randomBytes } from "crypto";
import pool from "./db";

// ---------------------------------------------------------------------------
// Token generation — same scheme as the driver reference code (ADR-002).
// ---------------------------------------------------------------------------

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateOwnerToken(): string {
  const bytes = randomBytes(8);
  let hi = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  let lo = ((bytes[4]! << 24) | (bytes[5]! << 16) | (bytes[6]! << 8) | bytes[7]!) >>> 0;

  let result = "";
  for (let i = 0; i < 10; i++) {
    result += CROCKFORD_ALPHABET[(hi >>> 27) & 0x1f];
    hi = ((hi << 5) | (lo >>> 27)) >>> 0;
    lo = (lo << 5) >>> 0;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Owner {
  id: number;
  spot_id: number;
  owner_token: string;
  owner_phone: string | null;
  owner_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface OwnerSpot {
  owner_id: number;
  owner_token: string;
  spot_id: number;
  spot_name: string;
  kind: string;
  address_line: string;
  lat: number;
  lng: number;
  price_per_hour_paise: number;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  total_bays: number;
  active_bays: number;
}

export interface OwnerBooking {
  booking_id: number;
  reference_code: string;
  bay_label: string;
  status: string;
  window_start: string;
  window_end: string;
  amount_paise: number;
  driver_phone: string;
  driver_name: string | null;
  vehicle_reg: string;
  arrived_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// createOwner
// ---------------------------------------------------------------------------

const INSERT_OWNER_SQL = `
  INSERT INTO owners (spot_id, owner_token, owner_phone, owner_name)
  VALUES ($1, $2, $3, $4)
  RETURNING
    id,
    spot_id,
    owner_token,
    owner_phone,
    owner_name,
    is_active,
    created_at::text AS created_at
`;

/**
 * Onboard an owner for a spot. Generates a CSPRNG owner_token (ADR-004).
 *
 * Callers: manual onboarding scripts in v1. No public endpoint calls this
 * directly — the team generates the token and hands it over out of band.
 */
export async function createOwner(
  spotId: number,
  ownerPhone: string | null,
  ownerName: string | null,
): Promise<Owner> {
  const token = generateOwnerToken();
  const result = await pool.query<Owner>(INSERT_OWNER_SQL, [
    spotId,
    token,
    ownerPhone,
    ownerName,
  ]);
  return result.rows[0]!;
}

// ---------------------------------------------------------------------------
// findOwnerByToken
// ---------------------------------------------------------------------------

const OWNER_BY_TOKEN_SQL = `
  SELECT
    o.id                    AS owner_id,
    o.owner_token           AS owner_token,
    s.id                    AS spot_id,
    s.name                  AS spot_name,
    s.kind                  AS kind,
    s.address_line          AS address_line,
    s.lat                   AS lat,
    s.lng                   AS lng,
    s.price_per_hour_paise  AS price_per_hour_paise,
    s.opens_at::text        AS opens_at,
    s.closes_at::text       AS closes_at,
    s.is_active             AS is_active,
    (SELECT count(*)::integer FROM bays WHERE spot_id = s.id)             AS total_bays,
    (SELECT count(*)::integer FROM bays WHERE spot_id = s.id AND is_active) AS active_bays
  FROM owners o
  JOIN spots s ON s.id = o.spot_id
  WHERE o.owner_token = $1
    AND o.is_active = true
`;

/**
 * Resolve an owner_token to the owner and their spot, or null if the token
 * does not match any active owner row.
 *
 * Returns null identically for "never existed" and "revoked" — the two must
 * be indistinguishable to an attacker, same principle as ADR-002 for driver
 * reference codes.
 */
export async function findOwnerByToken(
  ownerToken: string,
): Promise<OwnerSpot | null> {
  const result = await pool.query<OwnerSpot>(OWNER_BY_TOKEN_SQL, [ownerToken]);
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// listOwnerBookings
// ---------------------------------------------------------------------------

const OWNER_BOOKINGS_SQL = `
  SELECT
    bk.id                       AS booking_id,
    bk.reference_code           AS reference_code,
    b.label                     AS bay_label,
    bk.status                   AS status,
    lower(bk.window_at)::text   AS window_start,
    upper(bk.window_at)::text   AS window_end,
    bk.amount_paise             AS amount_paise,
    bk.driver_phone             AS driver_phone,
    bk.driver_name              AS driver_name,
    bk.vehicle_reg              AS vehicle_reg,
    bk.arrived_at::text         AS arrived_at,
    bk.created_at::text         AS created_at
  FROM bookings bk
  JOIN bays b ON b.id = bk.bay_id
  WHERE b.spot_id = $1
    AND bk.status <> 'cancelled'
  ORDER BY lower(bk.window_at) DESC
`;

/**
 * All non-cancelled bookings for a spot, newest first.
 *
 * The caller must already have resolved the owner_token to a spot_id via
 * {@link findOwnerByToken} — this function takes the spot_id directly so the
 * auth check is in the caller, not buried inside the query.
 */
export async function listOwnerBookings(
  spotId: number,
): Promise<OwnerBooking[]> {
  const result = await pool.query<OwnerBooking>(OWNER_BOOKINGS_SQL, [spotId]);
  return result.rows;
}
