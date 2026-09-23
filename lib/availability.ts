/**
 * Availability search — the derived, never-stored query at the heart of the
 * product.
 *
 * Contract (design/openapi.yaml  →  SpotAvailability):
 *   A spot appears in the results when it has at least one ACTIVE bay that
 *   carries NO non-cancelled booking that overlaps the requested window.
 *
 * Range semantics (ADR-001, openapi.yaml):
 *   Windows are half-open [start, end).  A bay booked 10:00–12:00 is free
 *   from 12:00 onward.  The Postgres && operator on tstzrange implements the
 *   correct semantics: adjacent ranges do NOT overlap.
 *
 * Money (ADR-003):
 *   estimated_total_paise is computed in TypeScript by computeAmountPaise,
 *   which rounds up to the next whole hour — the same rule applied at booking
 *   time.  Computing it here (not in SQL) keeps the rounding rule in one
 *   canonical place.
 *
 * Single query:
 *   One parameterised query joins areas → spots → bays and LEFT JOINs the
 *   bookings exclusion only for the conflicting subset, then groups to count
 *   free bays per spot.  No N+1 queries; no string concatenation of user input
 *   (SEC-004).
 */

import pool from "./db.js";
import { computeAmountPaise } from "./money.js";

// ---------------------------------------------------------------------------
// Public type — mirrors SpotAvailability in design/openapi.yaml exactly.
// Fields are in schema-declaration order so a diff against the spec is trivial.
// ---------------------------------------------------------------------------

/** One spot returned by {@link searchAvailability}. Matches `SpotAvailability` in openapi.yaml. */
export interface SpotAvailability {
  spot_id: number;
  name: string;
  kind: "mall" | "apartment" | "office" | "gym" | "commercial";
  address_line: string;
  lat: number;
  lng: number;
  price_per_hour_paise: number;
  /** Number of bays free for the WHOLE requested window. Always ≥ 1. */
  free_bays: number;
  /** Indicative total: whole hours rounded up × price_per_hour_paise. */
  estimated_total_paise: number;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * The single parameterised SQL that drives availability search.
 *
 * Walk-through:
 *
 *  1. `area_cte` — resolve the slug to an id (one row or zero).
 *
 *  2. Main join: areas → spots → bays
 *     Both spots.is_active and bays.is_active are filtered in the WHERE clause,
 *     matching the partial indexes `idx_spots_area_active` and
 *     `idx_bays_spot_active` from migration 002.
 *
 *  3. LEFT JOIN bookings — for each bay, attach any booking whose window
 *     overlaps the requested window AND is not cancelled.
 *     The overlap test uses the tstzrange && operator on a half-open range
 *     built with tstzrange($2, $3, '[)').
 *     '[)' makes the lower bound inclusive and the upper bound exclusive,
 *     matching the product definition: a bay booked 10:00–12:00 IS free at
 *     12:00.
 *
 *  4. WHERE b.id IS NULL — keep only bays that have NO such conflicting
 *     booking (i.e. the LEFT JOIN found nothing).
 *
 *  5. GROUP BY spot — aggregate free bay count per spot.
 *
 *  6. HAVING COUNT(*) >= 1 — defence-in-depth; the WHERE already guarantees
 *     this, but being explicit satisfies the spec's `minimum: 1` on free_bays.
 *
 * Parameters:
 *   $1  area slug        (text)
 *   $2  window start     (timestamptz-compatible ISO 8601 string)
 *   $3  window end       (timestamptz-compatible ISO 8601 string)
 *
 * Returns one row per qualifying spot; no row for spots with zero free bays.
 */
const AVAILABILITY_SQL = `
  WITH area_cte AS (
    SELECT id
    FROM   areas
    WHERE  slug = $1
  )
  SELECT
    s.id                    AS spot_id,
    s.name                  AS name,
    s.kind                  AS kind,
    s.address_line          AS address_line,
    s.lat                   AS lat,
    s.lng                   AS lng,
    s.price_per_hour_paise  AS price_per_hour_paise,
    COUNT(bay.id)::integer  AS free_bays
  FROM   area_cte
  JOIN   spots  s   ON  s.area_id  = area_cte.id
                    AND s.is_active = true
  JOIN   bays   bay ON  bay.spot_id = s.id
                    AND bay.is_active = true
  LEFT JOIN bookings bk
         ON  bk.bay_id    = bay.id
         AND bk.status   <> 'cancelled'
         AND bk.window_at && tstzrange($2::timestamptz, $3::timestamptz, '[)')
  WHERE  bk.id IS NULL
  GROUP  BY
    s.id,
    s.name,
    s.kind,
    s.address_line,
    s.lat,
    s.lng,
    s.price_per_hour_paise
  HAVING COUNT(bay.id) >= 1
  ORDER  BY s.id
`;

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Returns spots in the given area that have at least one active bay free for
 * the entire `[startIso, endIso)` window.
 *
 * @param areaSlug  - Area slug, e.g. `"gachibowli"`.
 * @param startIso  - Window start as an ISO 8601 date-time string (inclusive).
 * @param endIso    - Window end as an ISO 8601 date-time string (exclusive).
 * @returns         - Array of {@link SpotAvailability} objects, empty when no
 *                    spots qualify.  Never rejects on a well-formed DB call;
 *                    propagates pool errors to the caller.
 *
 * @example
 * const spots = await searchAvailability(
 *   "gachibowli",
 *   "2026-10-01T10:00:00+05:30",
 *   "2026-10-01T12:00:00+05:30",
 * );
 */
export async function searchAvailability(
  areaSlug: string,
  startIso: string,
  endIso: string,
): Promise<SpotAvailability[]> {
  const result = await pool.query<{
    spot_id: number;
    name: string;
    kind: "mall" | "apartment" | "office" | "gym" | "commercial";
    address_line: string;
    lat: number;
    lng: number;
    price_per_hour_paise: number;
    free_bays: number;
  }>(AVAILABILITY_SQL, [areaSlug, startIso, endIso]);

  return result.rows.map((row) => ({
    spot_id: row.spot_id,
    name: row.name,
    kind: row.kind,
    address_line: row.address_line,
    lat: row.lat,
    lng: row.lng,
    price_per_hour_paise: row.price_per_hour_paise,
    free_bays: row.free_bays,
    estimated_total_paise: computeAmountPaise(
      row.price_per_hour_paise,
      startIso,
      endIso,
    ),
  }));
}
