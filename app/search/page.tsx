"use client";

/**
 * S2 — Results: availability search output.
 *
 * Query-string inputs (set by S1 → Home):
 *   area   – area slug, e.g. "gachibowli"
 *   start  – ISO 8601 window start
 *   end    – ISO 8601 window end
 *
 * Five render states (matching design/mockups/index.html § S2):
 *
 *   1. Loading skeleton — animated placeholders for map + cards.
 *      After 3 s a cold-start banner appears inside the skeleton explaining
 *      the delay in plain language (design/nfr.md — free-tier cold start is
 *      named, never hidden behind a spinner).
 *
 *   2. Empty — the API returned an empty spots array.
 *      Neutral palette (never red). Two recovery actions:
 *        • "Try another area"  → back to home with area wiped
 *        • "Try another time"  → back to home preserving the area
 *
 *   3. Error — fetch threw or the API returned non-2xx.
 *      "Your area and time are still here." — inputs never lost.
 *      Single Retry action that re-runs the same fetch.
 *
 *   4. Results found — map + list of SpotCards.
 *      Each card: name, kind, formatted price (paiseToDisplay), free-bay
 *      count, and a Choose button linking to /book with the spot and window.
 *
 *   5. Degraded — results loaded but the map component errored.
 *      The list is still complete and fully functional. The map slot shows
 *      a plain "Map unavailable" placeholder. The list is NEVER gated on
 *      the map — it is the canonical route to a spot (mockup note).
 *
 * Leaflet / SSR:
 *   SpotMap is loaded with next/dynamic + ssr:false so the Leaflet DOM
 *   dependency never runs during server rendering and never breaks a cold-
 *   request HTML pass.
 *
 * Accessibility:
 *   - aria-busy on the page root while loading.
 *   - role="status" live region announces when results arrive.
 *   - role="alert" on error and cold-start banners.
 *   - Skeleton spans carry aria-hidden="true"; real content has proper labels.
 *   - Focus is not moved programmatically — the breadcrumb at the top of the
 *     page is the natural first focusable element after navigation.
 */

import { useCallback, useEffect, useId, useReducer, useRef, Suspense } from "react";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { paiseToDisplay } from "../../lib/money";
import type { SpotAvailability } from "../../lib/availability";



/* ─────────────────────────────────────────────
   Dynamic import — Leaflet must never run on the server
───────────────────────────────────────────── */

/**
 * SpotMap is intentionally loaded with ssr: false.
 * Leaflet mutates window / document on import; running it during Next.js
 * server rendering would throw. The map is a progressive enhancement —
 * the list below it is the canonical path to any spot.
 */
const SpotMap = nextDynamic(() => import("./SpotMap"), {
  ssr: false,
  loading: () => (
    <div
      className="spot-map"
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink-500)",
        fontSize: "var(--text-sm)",
        height: 180,
      }}
    >
      Loading map…
    </div>
  ),
});

/* ─────────────────────────────────────────────
   Local types
───────────────────────────────────────────── */

/** The four page-level states S2 can be in. */
type PageStatus = "loading" | "empty" | "error" | "results";

/** API response shape for GET /api/availability. */
interface AvailabilityResponse {
  window: { start: string; end: string };
  spots: SpotAvailability[];
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

/**
 * Format an ISO datetime pair into the breadcrumb window label.
 * Example: "2:30–4:30 pm" (same start/end meridiem collapsed).
 */
function formatWindow(startIso: string, endIso: string): string {
  const fmt = (iso: string, omitMeridiem: boolean) => {
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return iso;
    return d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      // Omit am/pm for the start when both share the same meridiem
      ...(omitMeridiem ? {} : {}),
    });
  };

  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!isFinite(start.getTime()) || !isFinite(end.getTime())) {
    return `${startIso}–${endIso}`;
  }

  const startHour = start.getHours();
  const endHour = end.getHours();
  const sameMeridiem =
    (startHour < 12 && endHour < 12) || (startHour >= 12 && endHour >= 12);

  const startStr = start.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const endStr = end.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (sameMeridiem) {
    // Strip the trailing " am"/"pm" from the start part
    const startTrimmed = startStr.replace(/\s?(am|pm)$/i, "");
    return `${startTrimmed}–${endStr}`;
  }
  return `${startStr}–${endStr}`;
}

/** Capitalise the first letter of a spot kind label. */
function kindLabel(kind: SpotAvailability["kind"]): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/* ─────────────────────────────────────────────
   Presentational atoms
───────────────────────────────────────────── */

/** Animated skeleton block. aria-hidden — purely decorative. */
function Skel({
  style,
  className,
}: {
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ""}`}
      style={{ display: "block", borderRadius: "var(--radius-sm)", ...style }}
      aria-hidden="true"
    />
  );
}

/**
 * Banner — coloured strip for informational notices.
 * variant: "warn" | "stop" | "ok"
 */
function Banner({
  variant,
  icon,
  children,
  role: roleProp,
}: {
  variant: "warn" | "stop" | "ok";
  icon: string;
  children: React.ReactNode;
  role?: React.AriaRole;
}) {
  const palette: Record<string, { bg: string; color: string }> = {
    warn: { bg: "var(--warn-100)", color: "var(--warn-700)" },
    stop: { bg: "var(--stop-100)", color: "var(--stop-700)" },
    ok: { bg: "var(--ok-100)", color: "var(--ok-700)" },
  };
  const { bg, color } = palette[variant]!;
  return (
    <div
      role={roleProp}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-2)",
        background: bg,
        color,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-2) var(--space-3)",
        fontSize: "var(--text-sm)",
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SpotCard
───────────────────────────────────────────── */

/**
 * One availability result card (matches the .card + .card-top pattern from
 * the mockup). The Choose button is a Next.js Link that navigates to /book
 * with all required params in the query string.
 *
 * The first card uses btn-primary; subsequent cards use btn-secondary (ghost),
 * matching the mockup's alternating treatment that visually ranks results.
 */
function SpotCard({
  spot,
  area,
  start,
  end,
  isPrimary,
}: {
  spot: SpotAvailability;
  area: string;
  start: string;
  end: string;
  isPrimary: boolean;
}) {
  // `area` must travel with the link: the book screen re-queries availability to
  // list this spot's free bays, and that query is keyed on the area. Without it
  // the book screen silently renders no bays at all.
  // Keys must match exactly what app/book/page.tsx reads: spot_id, area,
  // start, end, rate_paise, name. A mismatch here fails silently — the book
  // screen simply renders no bays and disables its own submit button.
  const bookParams = new URLSearchParams({
    spot_id: String(spot.spot_id),
    area,
    start,
    end,
    rate_paise: String(spot.price_per_hour_paise),
    name: spot.name,
  });

  return (
    <article
      className="card"
      aria-label={`${spot.name} — ${paiseToDisplay(spot.price_per_hour_paise)} per hour`}
    >
      {/* Top row: name + kind | price */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "var(--space-3)",
        }}
      >
        {/* Left: name + kind */}
        <div>
          <div
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: "var(--weight-medium)",
              color: "var(--ink-900)",
              lineHeight: "var(--leading-tight)",
            }}
          >
            {spot.name}
          </div>
          <div
            style={{
              color: "var(--ink-700)",
              fontSize: "var(--text-sm)",
              marginTop: "var(--space-1)",
            }}
          >
            {kindLabel(spot.kind)}
          </div>
        </div>

        {/* Right: price per hour */}
        <div
          style={{
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: "var(--weight-bold)",
              color: "var(--ink-900)",
              whiteSpace: "nowrap",
            }}
          >
            {paiseToDisplay(spot.price_per_hour_paise)}
          </div>
          <div
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-regular)",
              color: "var(--ink-500)",
            }}
          >
            per hour
          </div>
        </div>
      </div>

      {/* Free bay count */}
      <div
        style={{ color: "var(--ink-700)", fontSize: "var(--text-sm)" }}
        aria-label={`${spot.free_bays} ${spot.free_bays === 1 ? "bay" : "bays"} unbooked`}
      >
        {spot.free_bays} {spot.free_bays === 1 ? "bay" : "bays"} unbooked
      </div>

      {/* Choose button */}
      <Link
        href={`/book?${bookParams.toString()}`}
        className={`btn ${isPrimary ? "btn-primary" : "btn-secondary"}`}
        style={{ width: "100%", textDecoration: "none", textAlign: "center" }}
        aria-label={`Choose ${spot.name}`}
      >
        Choose
      </Link>
    </article>
  );
}

/* ─────────────────────────────────────────────
   Page component
───────────────────────────────────────────── */

function SearchPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  /* ── Inputs from query string ── */
  const area = searchParams.get("area") ?? "";
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";

  /* ── Page state ── */
  const [status, setStatus] = useReducer(
    (_: PageStatus, next: PageStatus) => next,
    "loading" as PageStatus,
  );
  const [spots, setSpots] = useReducer(
    (_: SpotAvailability[], next: SpotAvailability[]) => next,
    [] as SpotAvailability[],
  );
  const [mapFailed, setMapFailed] = useReducer(() => true, false);

  /* ── Cold-start hint — shown after 3 s if still loading ── */
  const [showColdStart, setShowColdStart] = useReducer(() => true, false);
  const coldStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Unique IDs for a11y ── */
  const liveRegionId = useId();

  /* ─────────────────────
     Fetch
  ───────────────────── */
  const fetchAvailability = useCallback(() => {
    setStatus("loading");
    // Reset cold-start flag and start the 3-second timer
    if (coldStartTimer.current) clearTimeout(coldStartTimer.current);
    coldStartTimer.current = setTimeout(() => {
      setShowColdStart();
    }, 3000);

    const params = new URLSearchParams({ area, start, end });

    fetch(`/api/availability?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AvailabilityResponse>;
      })
      .then((data) => {
        if (coldStartTimer.current) clearTimeout(coldStartTimer.current);
        setSpots(data.spots);
        setStatus(data.spots.length === 0 ? "empty" : "results");
      })
      .catch(() => {
        if (coldStartTimer.current) clearTimeout(coldStartTimer.current);
        setStatus("error");
      });
  }, [area, start, end]);

  useEffect(() => {
    fetchAvailability();
    return () => {
      if (coldStartTimer.current) clearTimeout(coldStartTimer.current);
    };
  }, [fetchAvailability]);

  /* ─────────────────────
     Derived display values
  ───────────────────── */

  /**
   * Prettify the area slug for display in the breadcrumb.
   * "gachibowli" → "Gachibowli", "hitec-city" → "Hitec City"
   */
  const areaDisplay = area
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const windowDisplay =
    start && end ? formatWindow(start, end) : "—";

  /* ─────────────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div
      className="page"
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      aria-busy={status === "loading" ? "true" : undefined}
    >
      {/* ── Live region — announces state changes to screen readers ── */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {status === "results"
          ? `${spots.length} spot${spots.length !== 1 ? "s" : ""} found in ${areaDisplay}`
          : status === "empty"
            ? `No spots available in ${areaDisplay} for that window`
            : ""}
      </div>

      {/* ══════════════════════════════════════════
          Breadcrumb — always visible in all states
      ══════════════════════════════════════════ */}
      <nav
        aria-label="Breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          color: "var(--ink-700)",
          fontSize: "var(--text-sm)",
        }}
      >
        <Link
          href={`/?area=${encodeURIComponent(area)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}
          style={{
            color: "var(--ink-700)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            minHeight: "var(--tap-min)",
          }}
          aria-label="Back to home"
        >
          <span aria-hidden="true">‹</span>
          <span>
            {areaDisplay}
            {windowDisplay !== "—" ? ` · ${windowDisplay}` : ""}
          </span>
        </Link>
      </nav>

      {/* ══════════════════════════════════════════
          STATE 1 — Loading skeleton
      ══════════════════════════════════════════ */}
      {status === "loading" && (
        <>
          {/* Map skeleton */}
          <Skel style={{ height: 180, borderRadius: "var(--radius-md)" }} />

          {/* Cold-start banner — appears only after 3 s */}
          {showColdStart && (
            <Banner variant="warn" icon="⏳" role="alert">
              Still looking — the database is waking up.
            </Banner>
          )}

          {/* Card skeletons */}
          <Skel style={{ height: 116, borderRadius: "var(--radius-md)" }} />
          <Skel style={{ height: 116, borderRadius: "var(--radius-md)" }} />
        </>
      )}

      {/* ══════════════════════════════════════════
          STATE 2 — Empty (no spots, not an error)
      ══════════════════════════════════════════ */}
      {status === "empty" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-8) var(--space-4)",
            textAlign: "center",
            color: "var(--ink-700)",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "var(--text-xl)" }}>
            🅿
          </span>
          <strong
            style={{
              color: "var(--ink-900)",
              fontWeight: "var(--weight-medium)",
              fontSize: "var(--text-base)",
              maxWidth: "28ch",
            }}
          >
            Nothing unbooked in {areaDisplay} for that window
          </strong>
          <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            Two things usually work:
          </p>
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              flexWrap: "wrap",
              justifyContent: "center",
              width: "100%",
            }}
          >
            {/* Try another area — clears the area, keeps the time window */}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: "0 1 auto", paddingInline: "var(--space-4)" }}
              onClick={() =>
                router.push(
                  `/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
                )
              }
            >
              Try another area
            </button>

            {/* Try another time — keeps the area, clears the window */}
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: "0 1 auto", paddingInline: "var(--space-4)" }}
              onClick={() =>
                router.push(`/?area=${encodeURIComponent(area)}`)
              }
            >
              Try another time
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STATE 3 — Error
      ══════════════════════════════════════════ */}
      {status === "error" && (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-8) var(--space-4)",
            textAlign: "center",
            color: "var(--ink-700)",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "var(--text-xl)" }}>
            ⚠
          </span>
          <strong
            style={{
              color: "var(--ink-900)",
              fontWeight: "var(--weight-medium)",
            }}
          >
            Couldn't search just now
          </strong>
          <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            Your area and time are still here.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ paddingInline: "var(--space-6)" }}
            onClick={fetchAvailability}
          >
            Retry
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STATE 4 & 5 — Results found (+ degraded map)
      ══════════════════════════════════════════ */}
      {status === "results" && (
        <>
          {/* ── Map — progressive enhancement ── */}
          {mapFailed ? (
            /*
             * Degraded state: map tiles failed.
             * The list below is complete and fully functional.
             * The map slot shows a neutral placeholder — never red (not an error).
             */
            <div
              className="spot-map"
              aria-hidden="true"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ink-500)",
                fontSize: "var(--text-sm)",
                height: 180,
                background: "var(--ink-100)",
              }}
            >
              Map unavailable
            </div>
          ) : (
            /*
             * SpotMap is loaded dynamically with ssr:false.
             * If it throws (tiles 4xx, network loss), onError flips mapFailed
             * and the degraded placeholder above takes over.
             */
            <SpotMap spots={spots} onError={setMapFailed} />
          )}

          {/* Result count summary */}
          <p
            style={{
              color: "var(--ink-700)",
              fontSize: "var(--text-sm)",
              margin: 0,
            }}
            aria-live="polite"
          >
            {spots.length} spot{spots.length !== 1 ? "s" : ""} unbooked
          </p>

          {/* ── Spot list ── */}
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
            aria-label="Available parking spots"
          >
            {spots.map((spot, i) => (
              <li key={spot.spot_id}>
                <SpotCard
                  area={area}
              spot={spot}
                  start={start}
                  end={end}
                  isPrimary={i === 0}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}


/**
 * useSearchParams() makes this subtree client-rendered, and Next requires that
 * to sit behind a Suspense boundary or the production build fails with
 * "useSearchParams() should be wrapped in a suspense boundary". It only shows
 * up at deploy time — `next dev` never prerenders — and `export const dynamic`
 * does not help, because route-segment config is ignored in a client component.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="state" aria-busy="true">Loading…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}
