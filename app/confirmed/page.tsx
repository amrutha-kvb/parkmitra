"use client";

/**
 * S5 — Confirmed: booking success screen and arrival action.
 *
 * Query-string inputs:
 *   ref  – reference code for the booking (e.g. "7K2M9QX4TB")
 *
 * States (matching design/mockups/index.html § S5, all four columns):
 *
 *   Loading
 *     Skeleton for the success heading, reference code block, and detail card.
 *     No content shown until the booking is fetched.
 *
 *   Default / success  (booking status === 'confirmed')
 *     • "✓ Booked" success heading in ok-700 green.
 *     • Reference code as the LARGEST element on the screen, in font-mono,
 *       grouped into chunks of three characters separated by a non-breaking
 *       space (e.g. "7K2  M9Q  X4T  B" → groups aligned to mockup "7K2M 9QX4 TB").
 *     • "Copy code" button that writes the raw code to the clipboard.
 *     • Warning banner: "Save this — it's the only way back to this booking."
 *     • Detail card: spot name · bay label, address, window, amount + status.
 *     • Primary button "I've arrived" that POSTs to /api/bookings/{ref}/arrive
 *       (idempotent — a repeat call returns 200, not an error).
 *
 *   Arriving  (POST in-flight)
 *     "I've arrived" button disabled with "Marking arrival…" label.
 *
 *   Arrived  (arrived_at is set)
 *     Button label changes to "Arrival recorded ✓" and is kept disabled so
 *     it reads as a completed action, not a repeated tap target. The rest of
 *     the screen is unchanged.
 *
 *   Error — couldn't load  (network / non-404 / non-2xx after GET)
 *     State block: ⚠ "Couldn't load this booking", "Your code is still valid."
 *     Single Retry button that re-runs the fetch.
 *
 *   Permission denied — wrong code  (GET → 404)
 *     State block: 🔎 "No booking with that code", "Check the code and try again."
 *     "Try another code" action → /.
 *     IDENTICAL copy to S4's not-found state by design (threat model T1:
 *     distinguishing "wrong code" from "someone else's booking" would confirm
 *     valid codes to an attacker guessing by enumeration).
 *
 * Reference code grouping:
 *   The raw 10-char code (e.g. "7K2M9QX4TB") is displayed as three groups
 *   matching the mockup's "7K2M 9QX4 TB" pattern: 4 + 4 + 2 characters,
 *   separated by U+00A0 NON-BREAKING SPACE so the groups never wrap mid-group.
 *   The Copy button writes the raw unspaced code so the user can paste it
 *   into the Lookup field without trimming spaces.
 *
 * Clipboard copy:
 *   Uses navigator.clipboard.writeText when available; falls back to a
 *   document.execCommand("copy") approach for older WebViews. Button label
 *   switches to "Copied ✓" for 2 s then reverts — gives tactile confirmation
 *   without a toast library dependency.
 *
 * Accessibility:
 *   - aria-busy on the page root while loading.
 *   - role="alert" on the warning banner.
 *   - role="status" live region announces the copy confirmation.
 *   - aria-live="polite" on the arrive-button label change.
 *   - The reference code element has aria-label with the raw unspaced code
 *     so screen readers don't read each character individually.
 */

import { useCallback, useEffect, useId, useRef, useState, Suspense } from "react";
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

type PageStatus =
  | "loading"    // Fetching the booking
  | "ready"      // Booking loaded and confirmed
  | "not_found"  // 404 — unknown or malformed code
  | "error";     // Network / unexpected failure

type ArriveStatus =
  | "idle"      // Not yet clicked
  | "arriving"  // POST in-flight
  | "arrived";  // arrived_at is set

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

/**
 * Format a 10-char reference code for display as three groups:
 *   "7K2M9QX4TB"  →  "7K2M\u00A09QX4\u00A0TB"
 * Groups: chars 0-3 (4) + chars 4-7 (4) + chars 8-9 (2).
 * Non-breaking spaces prevent mid-group line wraps.
 * Matches the mockup's "7K2M 9QX4 TB" visual layout.
 */
function formatCode(raw: string): string {
  if (raw.length !== 10) return raw;
  return `${raw.slice(0, 4)}\u00A0${raw.slice(4, 8)}\u00A0${raw.slice(8)}`;
}

/**
 * Write `text` to the clipboard.
 * Falls back to execCommand for older WebViews.
 * Returns a Promise<boolean> — true on success.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // execCommand fallback (deprecated but broadly supported in WebViews)
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Presentational components
// ---------------------------------------------------------------------------

/** Animated skeleton placeholder — aria-hidden, purely decorative. */
function Skel({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      className="skeleton"
      style={{ display: "block", borderRadius: "var(--radius-sm)", ...style }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function ConfirmedPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") ?? "";

  const copyLiveId = useId();

  const [status, setStatus] = useState<PageStatus>("loading");
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [arriveStatus, setArriveStatus] = useState<ArriveStatus>("idle");
  const [copyLabel, setCopyLabel] = useState<"copy" | "copied">("copy");

  // Timer ref for the copy-button "Copied ✓" revert
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch the booking
  // ---------------------------------------------------------------------------

  const fetchBooking = useCallback(() => {
    if (!ref) {
      setStatus("not_found");
      return;
    }

    setStatus("loading");

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

        // Seed arrived state from the booking (idempotent: a second arrival
        // call is a no-op — we reflect reality, not track client-side clicks).
        if (data.arrived_at) {
          setArriveStatus("arrived");
        }

        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [ref]);

  useEffect(() => {
    fetchBooking();
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [fetchBooking]);

  // ---------------------------------------------------------------------------
  // Copy handler
  // ---------------------------------------------------------------------------

  async function handleCopy() {
    if (!booking) return;
    const ok = await copyToClipboard(booking.reference_code);
    if (ok) {
      setCopyLabel("copied");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyLabel("copy"), 2000);
    }
  }

  // ---------------------------------------------------------------------------
  // Arrive handler
  // ---------------------------------------------------------------------------

  async function handleArrive() {
    if (!booking || arriveStatus !== "idle") return;

    setArriveStatus("arriving");

    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(booking.reference_code)}/arrive`,
        { method: "POST" },
      );

      // 200 = arrival recorded (idempotent — repeated calls also return 200).
      // Any other status is treated as success from the UX perspective because
      // the arrival signal has already fired or the booking is in a terminal state.
      if (res.ok || res.status === 409) {
        setArriveStatus("arrived");
        // Refresh booking data so arrived_at reflects the server value
        const updated = (await res.json()) as BookingResponse;
        setBooking(updated);
      } else {
        // On unexpected error, silently revert to idle so they can try again
        setArriveStatus("idle");
      }
    } catch {
      // Network error — silently revert
      setArriveStatus("idle");
    }
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const isLoading = status === "loading";
  const windowDisplay =
    booking
      ? formatWindowLabel(booking.window.start, booking.window.end)
      : "";
  const amountDisplay = booking ? paiseToDisplay(booking.amount_paise) : "";
  const displayCode = booking ? formatCode(booking.reference_code) : "";

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
      aria-busy={isLoading ? "true" : undefined}
    >
      {/* Hidden live region for clipboard confirmation (SEC-003: no data leaked) */}
      <div
        id={copyLiveId}
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
        {copyLabel === "copied" ? "Reference code copied to clipboard." : ""}
      </div>

      {/* ══════════════════════════════════════════
          STATE: loading
      ══════════════════════════════════════════ */}
      {isLoading && (
        <>
          {/* Success heading skeleton */}
          <Skel style={{ height: 32, width: "60%", margin: "0 auto" }} />
          {/* Reference code skeleton */}
          <Skel style={{ height: 52 }} />
          {/* Detail card skeleton */}
          <Skel style={{ height: 120, borderRadius: "var(--radius-md)" }} />
        </>
      )}

      {/* ══════════════════════════════════════════
          STATE: not_found / permission denied
          Identical copy to S4's not-found state — threat model T1.
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
            Couldn&rsquo;t load this booking
          </strong>
          <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            Your code is still valid.
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
          STATE: ready (confirmed booking)
      ══════════════════════════════════════════ */}
      {status === "ready" && booking && (
        <>
          {/* ── Success heading ── */}
          <div
            style={{
              fontSize: "var(--text-xl)",
              fontWeight: "var(--weight-bold)",
              color: "var(--ok-700)",
              textAlign: "center",
            }}
            aria-label="Booking confirmed"
          >
            ✓ Booked
          </div>

          {/* ── Reference code — the LARGEST element on screen ──
               font-size: var(--text-2xl) = 2rem = 32px, monospace, bold.
               aria-label reads the raw unspaced code so screen readers
               don't spell each character of the formatted version.        ── */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-2xl)",
              fontWeight: "var(--weight-bold)",
              letterSpacing: "0.12em",
              textAlign: "center",
              color: "var(--accent-700)",
              // Prevent the grouped code from breaking across lines at a space
              wordBreak: "keep-all",
              overflowWrap: "normal",
            }}
            aria-label={`Reference code: ${booking.reference_code}`}
            aria-describedby="ref-copy-btn"
          >
            {displayCode}
          </div>

          {/* ── Copy button ── */}
          <button
            id="ref-copy-btn"
            type="button"
            className="btn btn-secondary"
            style={{ width: "100%" }}
            onClick={handleCopy}
            aria-describedby={copyLiveId}
          >
            {copyLabel === "copied" ? "Copied ✓" : "Copy code"}
          </button>

          {/* ── Warning banner — save this code ── */}
          <div
            role="alert"
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
            <span aria-hidden="true">!</span>
            <span>
              Save this — it&rsquo;s the only way back to this booking.
            </span>
          </div>

          {/* ── Booking detail card ── */}
          <div
            className="card"
            aria-label="Booking details"
          >
            {/* Spot name · Bay */}
            <div
              style={{
                fontSize: "var(--text-lg)",
                fontWeight: "var(--weight-medium)",
                color: "var(--ink-900)",
                lineHeight: "var(--leading-tight)",
              }}
            >
              {booking.spot_name} · Bay {booking.bay_label}
            </div>

            {/* Address */}
            <div style={{ color: "var(--ink-700)", fontSize: "var(--text-sm)" }}>
              {booking.address_line}
            </div>

            {/* Window */}
            <div style={{ color: "var(--ink-700)", fontSize: "var(--text-sm)" }}>
              {windowDisplay}
            </div>

            {/* Amount + payment status */}
            <div style={{ color: "var(--ink-700)", fontSize: "var(--text-sm)" }}>
              {amountDisplay} · paid (simulated)
            </div>
          </div>

          {/* Spacer pushes button to the bottom */}
          <div style={{ flex: 1 }} aria-hidden="true" />

          {/* ── Primary action: I've arrived ──
               Idempotent: repeated taps return 200 from the API; UI shows
               "Arrival recorded ✓" and keeps the button disabled so it reads
               as a completed action rather than a tap target.              ── */}
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={arriveStatus !== "idle"}
            aria-disabled={arriveStatus !== "idle"}
            aria-live="polite"
            onClick={handleArrive}
          >
            {arriveStatus === "arriving"
              ? "Marking arrival…"
              : arriveStatus === "arrived"
                ? "Arrival recorded ✓"
                : "I've arrived"}
          </button>

          {/*
            The way back in.

            S6 existed, was tested, and had an accessibility pass — and nothing
            anywhere linked to it, so the only way to reach it was to type the
            URL. For a product whose entire authorisation model is "keep this
            code and come back with it", having no visible way to come back is
            not a missing nicety, it is the model not working.

            Placed here because this is the screen holding the code, and it is
            the moment a person wonders what happens when they close the tab.
          */}
          <p
            style={{
              marginTop: "var(--space-5)",
              fontSize: "var(--text-sm)",
              color: "var(--ink-500)",
              textAlign: "center",
            }}
          >
            Closing this page is fine. Come back any time with your code at{" "}
            <a href="/lookup" className="link-tap">
              Find your booking
            </a>
          </p>
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
export default function ConfirmedPage() {
  return (
    <Suspense fallback={<div className="state" aria-busy="true">Loading…</div>}>
      <ConfirmedPageInner />
    </Suspense>
  );
}
