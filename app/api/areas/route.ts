import { NextResponse } from "next/server";
import pool from "../../../lib/db";

interface AreaRow {
  slug: string;
  name: string;
  centre_lat: number;
  centre_lng: number;
}

/**
 * GET /api/areas — the fixed list of searchable Hyderabad areas.
 * Public, no authorisation. Returns all active areas.
 */
export async function GET() {
  const { rows } = await pool.query<AreaRow>(
    "SELECT slug, name, centre_lat, centre_lng FROM areas ORDER BY name",
  );

  return NextResponse.json({ areas: rows });
}
