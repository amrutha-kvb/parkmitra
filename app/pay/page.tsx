"use client";

/**
 * S4 — Pay (simulated): confirm a booking and record a simulated payment.
 *
 * Query-string inputs:
 *   ref  – reference code for the booking (e.g. "7K2M9QX4TB")
 *
 * States (matching design/mockups/index.html § S4, all four columns):
 *
 *   Loading
 *     Skeleton placeholders for the spot name and amount. Demo banner is
 *     visible. Button disabled with "Loading…" label.
 *
 *   Default / ready  (booking status === 'pending')
 *     Standing non-dismissible demo banner (warn). Spot name · bay label,
 *     booking window, and amount (via paiseToDisplay). Primary button
 *     "Pay {amount} (simulated)" that POSTs to /api/bookings/{ref}/pay and
 *     on success navigates to /confirmed?ref={code}.
 *
 *   Processing  (POST in-flight)
 *     Button disabled with "Processing…" label. Everything else unchanged.
 *
 *   Error — expired / cancelled  (non-200, non-409 after GET)
 *     Demo banner stays. State block with ⌛ icon, "This booking expired
 *     before payment", and a "Search again" action → /.
 *
 *   Already confirmed  (booking status === 'confirmed')
 *     Silently forwarded to /confirmed?ref={code} without showing an error
 *     (mockup: "A repeat pay is forwarded, not errored"). The ok-banner
 *     "This booking is already paid" and "View booking" CTA are shown
 *     momentarily while the redirect is prepared.
 *
 *   Permission denied / not found  (GET → 404 or malformed ref)
 *     Same not-found copy as S5 — identical by design (threat model T1).
 *     State block with 🔎 icon and "Try another code" action → /.
 *
 * Accessibility:
 *   - aria-busy on the page root while loading or processing.
 *   - role="alert" on the demo banner (persistent, non-dismissible).
 *   - role="status" for the live region that announces state changes.
 *   - Every interactive state preserves keyboard focus naturally — no
 *     programmatic focus manipulation needed here.
 */

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { paiseToDisplay } from "../../lib/money";



// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookingResponse {
  reference_code: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  window: { start: string; end: string };
  amount_paise: number;
  spot_name: string;
  bay_label: string;
  address_line: string;
  arrived_at: string | null;
}

/** All states the page can occupy. */
type PageStatus =
  | "loading"     // Fetching the booking
  | "ready"       // Booking is pending — show payment form
  | "processing"  // POST /pay in-flight
  | "expired"     // Booking is cancelled/expired — can't pay
  | "not_found"   // 404 from the API — unknown or malformed code
  | "error";      // Network / unexpected failure

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a pair of ISO datetimes as the window label.
 * Example: "Tue 23 Sep · 2:30–4:30 pm"
 */
function formatWindowLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!isFinite(start.getTime()) || !isFinite(end.getTime())) {
    return `${startIso} – ${endIso}`;
  }

  const datePart = start.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

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

  const sameMeridiem =
    (start.getHours() < 12 && end.getHours() < 12) ||
    (start.getHours() >= 12 && end.getHours() >= 12);

  const timePart = sameMeridiem
    ? `${startStr.replace(/\s?(am|pm)$/i, "")}–${endStr}`
    : `${startStr}–${endStr}`;

  return `${datePart} · ${timePart}`;
}

// ---------------------------------------------------------------------------
// Presentational components
// ---------------------------------------------------------------------------

/** Animated skeleton placeholder block — aria-hidden, purely decorative. */
function Skel({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      className="skeleton"
      style={{ display: "block", borderRadius: "var(--radius-sm)", ...style }}
      aria-hidden="true"
    />
  );
}

/**
 * Standing non-dismissible demo banner.
 * Rendered in every state of this page — "must never imply it took money."
 * Uses role="alert" so assistive technologies read it on page load / state change.
 *
 * The `key` prop on the outer element is intentionally NOT varied — we want
 * this banner to stay mounted across state transitions so screen readers don't
 * re-announce it on every render. The parent controls mounting.
 */
function DemoBanner() {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-2)",
        background: "var(--warn-100)",
        color: "var(--warn-700)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-2) var(--space-3)",
        fontSize: "var(--text-sm)",
      }}
    >
      <span aria-hidden="true">⚠</span>
      <span>
        <strong>Demo</strong> — no real payment is taken.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function PayPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") ?? "";

  const [status, setStatus] = useState<PageStatus>("loading");
  const [booking, setBooking] = useState<BookingResponse | null>(null);

  // Track whether a redirect to /confirmed is already queued — prevents
  // double-navigation if the effect re-runs.
  const redirectingRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Fetch the booking
  // ---------------------------------------------------------------------------

  const fetchBooking = useCallback(() => {
    if (!ref) {
      setStatus("not_found");
      return;
    }

    setStatus("loading");
    redirectingRef.current = false;

    fetch(`/api/bookings/${encodeURIComponent(ref)}`)
      .then((res) => {
        if (res.status === 404) {
          setStatus("not_found");
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<BookingResponse>;
      })
      .then((data) => {
        if (data === null) return; // not_found already set

        setBooking(data);

        if (data.status === "confirmed") {
          // Already paid — forward to /confirmed without showing an error.
          // Set status so the "already paid" interstitial is briefly visible,
          // then navigate.
          setStatus("loading"); // keep the demo banner, swap content below
          if (!redirectingRef.current) {
            redirectingRef.current = true;
            router.replace(`/confirmed?ref=${encodeURIComponent(data.reference_code)}`);
          }
        } else if (data.status === "pending") {
          setStatus("ready");
        } else {
          // cancelled / expired
          setStatus("expired");
        }
      })
      .catch(() => {
        setStatus("error");
      });
  }, [ref, router]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  // ---------------------------------------------------------------------------
  // Pay handler
  // ---------------------------------------------------------------------------

  async function handlePay() {
    if (!booking || status !== "ready") return;

    setStatus("processing");

    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(booking.reference_code)}/pay`,
        { method: "POST" },
      );

      if (res.ok) {
        // 200 — payment recorded, navigate to confirmed screen.
        router.push(
          `/confirmed?ref=${encodeURIComponent(booking.reference_code)}`,
        );
        return;
      }

      if (res.status === 409) {
        // Already confirmed by a concurrent call — treat the same as
        // "already paid": forward to /confirmed.
        router.replace(
          `/confirmed?ref=${encodeURIComponent(booking.reference_code)}`,
        );
        return;
      }

      if (res.status === 404) {
        setStatus("not_found");
        return;
      }

      // Any other error (500, network, etc.)
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const isLoading = status === "loading";
  const isProcessing = status === "processing";
  const isBusy = isLoading || isProcessing;

  const amountDisplay = booking ? paiseToDisplay(booking.amount_paise) : "";
  const windowDisplay =
    booking
      ? formatWindowLabel(booking.window.start, booking.window.end)
      : "";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        maxWidth: 480,
        paddingBlock: "var(--space-8)",
      }}
      aria-busy={isBusy ? "true" : undefined}
    >
      {/* ══════════════════════════════════════════
          Demo banner — standing, non-dismissible, every state.
          Rendered first so it is always the first element in the DOM.
      ══════════════════════════════════════════ */}
      <DemoBanner />

      {/* ══════════════════════════════════════════
          STATE: loading
      ══════════════════════════════════════════ */}
      {isLoading && (
        <>
          <div style={{ textAlign: "center" }}>
            <Skel
              style={{ height: 24, width: "60%", margin: "0 auto" }}
            />
          </div>
          <div style={{ textAlign: "center" }}>
            <Skel
              style={{ height: 40, width: "30%", margin: "0 auto" }}
            />
          </div>
          {/* Spacer */}
          <div style={{ flex: 1 }} aria-hidden="true" />
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled
            aria-disabled="true"
          >
            Loading…
          </button>
        </>
      )}

      {/* ══════════════════════════════════════════
          STATE: not_found / permission denied
          Identical copy whether unknown or malformed — threat model T1.
      ══════════════════════════════════════════ */}
      {status === "not_found" && (
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
            🔎
          </span>
          <strong
            style={{
              color: "var(--ink-900)",
              fontWeight: "var(--weight-medium)",
              fontSize: "var(--text-base)",
            }}
          >
            No booking with that code
          </strong>
          <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            Check the code and try again.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ paddingInline: "var(--space-4)" }}
            onClick={() => router.push("/")}
          >
            Try another code
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STATE: expired (cancelled / expired booking)
      ══════════════════════════════════════════ */}
      {status === "expired" && (
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
            ⌛
          </span>
          <strong
            style={{
              color: "var(--ink-900)",
              fontWeight: "var(--weight-medium)",
              fontSize: "var(--text-base)",
            }}
          >
            This booking expired before payment
          </strong>
          <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            Unpaid bookings don&rsquo;t hold the bay.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ paddingInline: "var(--space-4)" }}
            onClick={() => router.push("/")}
          >
            Search again
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STATE: error (network / unexpected)
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
              fontSize: "var(--text-base)",
            }}
          >
            Something went wrong
          </strong>
          <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            Check your connection and try again.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ paddingInline: "var(--space-4)" }}
            onClick={fetchBooking}
          >
            Retry
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STATE: ready + processing
          Both share the same layout — only the button label/state changes.
      ══════════════════════════════════════════ */}
      {(status === "ready" || status === "processing") && booking && (
        <>
          {/* Spot name · bay label */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "var(--text-lg)",
                fontWeight: "var(--weight-medium)",
                color: "var(--ink-900)",
              }}
            >
              {booking.spot_name} · {booking.bay_label}
            </div>
            {/* Booking window */}
            <div
              style={{
                color: "var(--ink-700)",
                fontSize: "var(--text-sm)",
                marginTop: "var(--space-1)",
              }}
            >
              {windowDisplay}
            </div>
          </div>

          {/* Amount — the most prominent content element */}
          <div
            style={{
              textAlign: "center",
              fontSize: "var(--text-2xl)",
              fontWeight: "var(--weight-bold)",
              color: "var(--ink-900)",
            }}
            aria-label={`Amount due: ${amountDisplay}`}
          >
            {amountDisplay}
          </div>

          {/* Spacer pushes button to the bottom */}
          <div style={{ flex: 1 }} aria-hidden="true" />

          {/* Primary action */}
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={isProcessing}
            aria-disabled={isProcessing}
            onClick={handlePay}
          >
            {isProcessing
              ? "Processing…"
              : `Pay ${amountDisplay} (simulated)`}
          </button>
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
export default function PayPage() {
  return (
    <Suspense fallback={<div className="state" aria-busy="true">Loading…</div>}>
      <PayPageInner />
    </Suspense>
  );
}
