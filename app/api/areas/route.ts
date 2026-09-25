import { NextResponse } from "next/server";
import pool from "../../../lib/db";
import { timed, serverTimingHeader } from "../../../lib/server-timing";

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
  // Server-Timing so design/nfr.md's budgets can be judged. Measured from
  // Hyderabad the wall-clock figure is dominated by ~230ms of geography to the
  // us-east-1 function region, which made every verdict in docs/performance.md
  // unprovable. This is the handler's own time.
  const [rows, ms] = await timed(async () => {
    const result = await pool.query<AreaRow>(
      "SELECT slug, name, centre_lat, centre_lng FROM areas ORDER BY name",
    );
    return result.rows;
  });

  return NextResponse.json(
    { areas: rows },
    { headers: { "Server-Timing": serverTimingHeader(ms) } },
  );
}
