"use client";

/**
 * S3 — Book: choose a bay and confirm a booking.
 *
 * Query-string inputs (set by S2 → Results, via the Choose button):
 *   spot_id  – integer spot id
 *   area     – area slug (passed through so 409 can re-run the right search)
 *   start    – ISO 8601 window start
 *   end      – ISO 8601 window end
 *
 * The spot name shown in the breadcrumb and window line is derived from the
 * first booking API response (201) or from the bays fetch; for immediate
 * display before fetch completes we read it from the S2 card that navigated
 * here via the `name` query param if present, else show a skeleton.
 *
 * States (matching design/mockups/index.html § S3, all four columns):
 *
 *   Default / ready
 *     Bay chips, three form fields (phone, vehicle reg, optional name),
 *     price summary showing hours × rate and total, Book button.
 *
 *   Loading — submitting
 *     Button disabled with "Booking…" label. Form still visible so nothing
 *     jumps. Bay chips collapsed to the selected one only (matches mockup).
 *
 *   Error — 409 (bay taken)
 *     Stop banner: "That bay was just taken for part of your window."
 *     State block prompting "See what's unbooked" which re-runs the search
 *     (never navigates to a stale list — pushes /search?area=…&start=…&end=…
 *     with a fresh timestamp-identical query so S2 re-fetches).
 *
 *   Error — 422 (outside opening hours)
 *     Warn banner with the spot's opening hours message from the API.
 *     Button remains visible but disabled so the user sees the context.
 *     Form contents preserved.
 *
 *   Error — network / other
 *     Stop banner "Couldn't complete the booking." with Try again.
 *     All form contents preserved; button re-enabled on retry.
 *
 * Inline validation (on blur, not on submit):
 *   phone       – required; accepts +91 prefix or bare 10 digits
 *   vehicle_reg – required; permissive (formats vary — reject sparingly)
 *   name        – optional, no validation
 *
 * Price summary:
 *   Hours computed client-side with billableHours() (rounds up, matching ADR-003).
 *   Rate read from the URL param `rate_paise` passed by S2, or from the bays
 *   fetch spot row. Total = billableHours × rate_paise, formatted with
 *   paiseToDisplay(). "Part hours round up." always shown below the hours row.
 *
 * Double-submit guard:
 *   The Book button is disabled on the very first click and stays disabled
 *   until the request resolves (success → navigate; failure → re-enable with
 *   error shown; form contents preserved).
 *
 * Accessibility:
 *   - aria-busy on page root while submitting.
 *   - role="alert" on every error banner — announced immediately.
 *   - role="status" for the live region that describes the selected bay.
 *   - aria-pressed on bay chips (toggle pattern).
 *   - aria-invalid + aria-describedby wiring on every validated field.
 *   - Focus is not moved on error — the banner is positioned above the form
 *     and will be in viewport; assistive technology picks it up via role="alert".
 */

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { paiseToDisplay, billableHours } from "../../lib/money";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Bay {
  bay_id: number;
  label: string;
}

interface SpotAvailability {
  spot_id: number;
  name: string;
  bays: Bay[];
  // other fields from the availability response are not consumed here
  [key: string]: unknown;
}

interface AvailabilityResponse {
  window: { start: string; end: string };
  spots: SpotAvailability[];
}

interface BookingSuccessResponse {
  reference_code: string;
  status: string;
  window: { start: string; end: string };
  amount_paise: number;
  spot_name: string;
  bay_label: string;
  address_line: string;
  arrived_at: string | null;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/** Page-level submit state machine. */
type SubmitStatus =
  | "idle"       // Default: form editable, button enabled (once valid)
  | "submitting" // In-flight POST: button disabled, label "Booking…"
  | "err_409"    // Bay taken: show taken banner + re-search CTA
  | "err_422"    // Outside hours: show hours banner, button disabled
  | "err_net";   // Network / other: show generic error, allow retry

/** Bay-fetch state machine. */
type BaysFetchStatus = "loading" | "ready" | "error";

// ---------------------------------------------------------------------------
// Inline validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates an Indian mobile number.
 * Accepts:
 *   +91 followed by 10 digits (with optional space after prefix)
 *   bare 10-digit number starting with 6–9
 * Permissive on formatting: spaces, hyphens and dots are stripped first.
 */
function validatePhone(raw: string): string | null {
  const stripped = raw.replace(/[\s\-().]/g, "");
  // With +91 prefix
  if (/^\+91\d{10}$/.test(stripped)) return null;
  // Bare 10 digits, starting with 6-9 (valid Indian mobile range)
  if (/^[6-9]\d{9}$/.test(stripped)) return null;
  return "Enter a 10-digit mobile number, or +91 followed by 10 digits.";
}

/**
 * Validates a vehicle registration number.
 * Intentionally permissive — formats vary widely (state codes, old plates,
 * BH series, etc.) and rejecting a valid plate is worse than a loose match.
 * Only checks that the field is non-empty and at least 4 characters long.
 */
function validateVehicleReg(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Vehicle registration is required.";
  if (trimmed.length < 4) return "Enter a valid vehicle registration number.";
  return null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a pair of ISO datetimes as the window label shown in the breadcrumb:
 * "Tue 23 Sep · 2:30–4:30 pm"
 */
function formatWindowLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!isFinite(start.getTime()) || !isFinite(end.getTime())) {
    return `${startIso} – ${endIso}`;
  }

  // Date part: "Tue 23 Sep"
  const datePart = start.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  // Time parts
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

  const timePart = sameMeridiem
    ? `${startStr.replace(/\s?(am|pm)$/i, "")}–${endStr}`
    : `${startStr}–${endStr}`;

  return `${datePart} · ${timePart}`;
}

// ---------------------------------------------------------------------------
// Small presentational components
// ---------------------------------------------------------------------------

/**
 * Section label — uppercase, ink-500, matching .label in the mockup.
 * Rendered as a <div> rather than a <label> because it heads a group.
 */
function SectionLabel({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      style={{
        fontSize: "var(--text-xs)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--ink-500)",
        fontWeight: "var(--weight-bold)",
      }}
    >
      {children}
    </div>
  );
}

/** Animated skeleton placeholder block — aria-hidden, decorative only. */
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
 * Banner — coloured strip for notices.
 * variant: "warn" | "stop"
 */
function Banner({
  variant,
  icon,
  children,
}: {
  variant: "warn" | "stop";
  icon: string;
  children: React.ReactNode;
}) {
  const styles: Record<string, { bg: string; color: string }> = {
    warn: { bg: "var(--warn-100)", color: "var(--warn-700)" },
    stop: { bg: "var(--stop-100)", color: "var(--stop-700)" },
  };
  const { bg, color } = styles[variant]!;
  return (
    <div
      role="alert"
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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function BookPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /* ── Query-string params ── */
  const spotIdRaw = searchParams.get("spot_id") ?? "";
  const area = searchParams.get("area") ?? "";
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  // Optional: rate_paise passed through from S2 to avoid a second spot lookup
  const ratePaiseRaw = searchParams.get("rate_paise") ?? "";
  // Optional: spot name passed through from S2 for immediate display
  const spotNameParam = searchParams.get("name") ?? "";

  /* ── Stable IDs for aria-describedby ── */
  const phoneErrId = useId();
  const regErrId = useId();
  const bayGroupId = useId();
  const liveRegionId = useId();

  /* ── Bays fetch ── */
  const [baysFetchStatus, setBaysFetchStatus] = useState<BaysFetchStatus>("loading");
  const [bays, setBays] = useState<Bay[]>([]);

  /* ── Selected bay ── */
  const [selectedBayId, setSelectedBayId] = useState<number | null>(null);

  /* ── Form fields ── */
  const [phone, setPhone] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [driverName, setDriverName] = useState("");

  /* ── Inline validation errors (shown on blur, preserved on submit error) ── */
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  /* ── Whether each field has been touched (blurred) at least once ── */
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [regTouched, setRegTouched] = useState(false);

  /* ── Submit state ── */
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");

  /* ── 422 error message (the human-readable hours string from the API) ── */
  const [hoursMessage, setHoursMessage] = useState<string | null>(null);

  /* ── Rate paise (from URL param or bays response if we add it later) ── */
  const ratePaise = parseInt(ratePaiseRaw, 10) || 0;

  /* ── Computed price summary ── */
  const hours =
    start && end
      ? (() => {
          try {
            return billableHours(start, end);
          } catch {
            return 0;
          }
        })()
      : 0;
  const totalPaise = hours * ratePaise;

  /* ── Spot name for display ── */
  const [spotName, setSpotName] = useState(spotNameParam);

  /* ─────────────────────
     Fetch free bays via the availability route, then isolate this spot
  ───────────────────── */
  const fetchBays = useCallback(() => {
    if (!spotIdRaw || !area || !start || !end) return;
    setBaysFetchStatus("loading");
    setSelectedBayId(null);

    const spotId = parseInt(spotIdRaw, 10);
    const params = new URLSearchParams({ area, start, end });
    fetch(`/api/availability?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AvailabilityResponse>;
      })
      .then((data) => {
        // Postgres bigint arrives from node-pg as a STRING, so compare as strings.
        // s.spot_id === parseInt(...) is always false and silently yields no bays.
        const spot = data.spots.find((s) => String(s.spot_id) === String(spotIdRaw)) ?? null;
        const freeBays: Bay[] = spot ? spot.bays : [];
        setBays(freeBays);
        // Auto-select the first bay when any are available
        if (freeBays.length > 0) {
          setSelectedBayId(freeBays[0]!.bay_id);
        }
        setBaysFetchStatus("ready");
      })
      .catch(() => {
        setBaysFetchStatus("error");
      });
  }, [spotIdRaw, area, start, end]);

  useEffect(() => {
    fetchBays();
  }, [fetchBays]);

  /* ─────────────────────
     Derived state
  ───────────────────── */

  /** Validate phone in real-time to update error after each keystroke when touched */
  const currentPhoneError = phoneTouched ? validatePhone(phone) : null;
  const currentRegError = regTouched ? validateVehicleReg(vehicleReg) : null;

  /** The form is submittable when: */
  const canSubmit =
    submitStatus === "idle" &&
    selectedBayId !== null &&
    phone.trim() !== "" &&
    vehicleReg.trim() !== "" &&
    currentPhoneError === null &&
    currentRegError === null &&
    baysFetchStatus === "ready";

  /* ─────────────────────
     Event handlers
  ───────────────────── */

  function handlePhoneBlur() {
    setPhoneTouched(true);
    setPhoneError(validatePhone(phone));
  }

  function handleRegBlur() {
    setRegTouched(true);
    setRegError(validateVehicleReg(vehicleReg));
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(e.target.value);
    // Clear error as user types after first touch
    if (phoneTouched) {
      setPhoneError(validatePhone(e.target.value));
    }
  }

  function handleRegChange(e: React.ChangeEvent<HTMLInputElement>) {
    setVehicleReg(e.target.value);
    if (regTouched) {
      setRegError(validateVehicleReg(e.target.value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Force-touch all fields so errors show even if never blurred
    setPhoneTouched(true);
    setRegTouched(true);
    const pErr = validatePhone(phone);
    const rErr = validateVehicleReg(vehicleReg);
    setPhoneError(pErr);
    setRegError(rErr);

    if (pErr || rErr || selectedBayId === null) return;

    // Double-submit guard: disable the button immediately on first click.
    setSubmitStatus("submitting");

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bay_id: selectedBayId,
          start,
          end,
          driver_phone: phone.trim(),
          vehicle_reg: vehicleReg.trim(),
          driver_name: driverName.trim() || null,
          // `amount` intentionally omitted — ADR-003
        }),
      });

      if (res.status === 201) {
        // Happy path: navigate to /pay with the reference code
        const data = (await res.json()) as BookingSuccessResponse;
        router.push(`/pay?ref=${encodeURIComponent(data.reference_code)}`);
        return;
      }

      const errBody = (await res.json()) as ErrorResponse;

      if (res.status === 409) {
        // Bay taken while typing — return to re-run search, never stale list.
        setSubmitStatus("err_409");
        return;
      }

      if (res.status === 422) {
        // Window outside opening hours — show the API's message.
        setHoursMessage(errBody.message);
        setSubmitStatus("err_422");
        return;
      }

      // Any other non-201 status is a generic network/server error.
      setSubmitStatus("err_net");
    } catch {
      // Actual network failure (fetch itself threw).
      setSubmitStatus("err_net");
    }
  }

  /** Navigate back to S2 with the search re-run from scratch (not stale). */
  function handleReSearch() {
    const params = new URLSearchParams({ area, start, end });
    router.push(`/search?${params.toString()}`);
  }

  /** Retry after network error — re-enable the form (preserve all content). */
  function handleRetry() {
    setSubmitStatus("idle");
  }

  /* ─────────────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────────────── */

  const isSubmitting = submitStatus === "submitting";
  const windowLabel = start && end ? formatWindowLabel(start, end) : "";

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
      aria-busy={isSubmitting ? "true" : undefined}
    >
      {/* Live region for screen readers */}
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
        {selectedBayId !== null
          ? `Bay ${bays.find((b) => b.bay_id === selectedBayId)?.label ?? ""} selected`
          : ""}
      </div>

      {/* ══════════════════════════════════════════
          Breadcrumb — always visible
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
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            color: "var(--ink-700)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "var(--text-sm)",
            padding: 0,
            minHeight: "var(--tap-min)",
          }}
          aria-label="Back to results"
        >
          <span aria-hidden="true">‹</span>
          <span>{spotName || "Back"}</span>
        </button>
      </nav>

      {/* Window line — date and time range */}
      {windowLabel && (
        <p
          style={{
            color: "var(--ink-700)",
            fontSize: "var(--text-sm)",
            margin: 0,
            marginTop: "calc(var(--space-2) * -1)",
          }}
        >
          {windowLabel}
        </p>
      )}

      {/* ══════════════════════════════════════════
          ERROR STATE: 409 — Bay taken
          Replaces the form entirely (mockup)
      ══════════════════════════════════════════ */}
      {submitStatus === "err_409" && (
        <>
          <Banner variant="stop" icon="⚠">
            That bay was just taken for part of your window.
          </Banner>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-3)",
              padding: "var(--space-6) var(--space-4)",
              textAlign: "center",
              color: "var(--ink-700)",
              flex: 1,
              justifyContent: "center",
            }}
          >
            <strong
              style={{ color: "var(--ink-900)", fontWeight: "var(--weight-medium)" }}
            >
              We've re-checked what's unbooked
            </strong>
            <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
              Here's what's actually free right now.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ paddingInline: "var(--space-4)" }}
              onClick={handleReSearch}
            >
              See what's unbooked
            </button>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════
          NORMAL FORM STATES
          (idle, submitting, err_422, err_net)
          Form is always rendered so contents are preserved
      ══════════════════════════════════════════ */}
      {submitStatus !== "err_409" && baysFetchStatus === "ready" && bays.length === 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-6) var(--space-4)",
            textAlign: "center",
            color: "var(--ink-700)",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <strong
            style={{ color: "var(--ink-900)", fontWeight: "var(--weight-medium)" }}
          >
            No bays available
          </strong>
          <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            All bays at this spot are taken for your window.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ paddingInline: "var(--space-4)" }}
            onClick={handleReSearch}
          >
            See other spots
          </button>
        </div>
      )}

      {submitStatus !== "err_409" && !(baysFetchStatus === "ready" && bays.length === 0) && (
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{ display: "contents" }}
          aria-label="Book a parking bay"
        >
          {/* ── 422 banner (outside hours) ── */}
          {submitStatus === "err_422" && hoursMessage && (
            <Banner variant="warn" icon="⚠">
              {hoursMessage}
            </Banner>
          )}

          {/* ── Network / generic error banner ── */}
          {submitStatus === "err_net" && (
            <Banner variant="stop" icon="⚠">
              Couldn't complete the booking. Check your connection and try
              again.
            </Banner>
          )}

          {/* ══════════════════════════════════════
              BAY CHIPS
          ══════════════════════════════════════ */}
          <section aria-labelledby={bayGroupId}>
            <SectionLabel id={bayGroupId}>Pick a bay</SectionLabel>

            {/* Loading skeleton */}
            {baysFetchStatus === "loading" && (
              <div
                className="chip-group"
                role="status"
                aria-label="Loading available bays…"
                style={{ marginTop: "var(--space-2)" }}
              >
                {[52, 52, 52, 52].map((w, i) => (
                  <Skel key={i} style={{ width: w, height: 44 }} />
                ))}
              </div>
            )}

            {/* Error fetching bays */}
            {baysFetchStatus === "error" && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  marginTop: "var(--space-2)",
                  color: "var(--stop-700)",
                  fontSize: "var(--text-sm)",
                }}
              >
                <span aria-hidden="true">⚠</span>
                <span>Couldn't load bays.</span>
                <button
                  type="button"
                  onClick={fetchBays}
                  style={{
                    color: "var(--accent-700)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "var(--text-sm)",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Chips — while submitting, show only the selected chip (mockup) */}
            {baysFetchStatus === "ready" && bays.length > 0 && (
              <div
                className="chip-group"
                role="listbox"
                aria-labelledby={bayGroupId}
                aria-required="true"
                style={{ marginTop: "var(--space-2)" }}
              >
                {(isSubmitting
                  ? bays.filter((b) => b.bay_id === selectedBayId)
                  : bays
                ).map((bay) => {
                  const selected = bay.bay_id === selectedBayId;
                  return (
                    <button
                      key={bay.bay_id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-pressed={selected}
                      className={`chip${selected ? " chip--selected" : ""}`}
                      disabled={isSubmitting}
                      onClick={() =>
                        setSelectedBayId(selected ? null : bay.bay_id)
                      }
                    >
                      {bay.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════
              YOUR DETAILS
              Hidden while submitting (mockup collapses to summary)
          ══════════════════════════════════════ */}
          {!isSubmitting && (
            <section aria-label="Your details">
              <SectionLabel>Your details</SectionLabel>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                  marginTop: "var(--space-2)",
                }}
              >
                {/* Phone */}
                <div className="field">
                  <label
                    htmlFor="book-phone"
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: "var(--weight-medium)",
                      color: "var(--ink-900)",
                    }}
                  >
                    Mobile number
                  </label>
                  <input
                    id="book-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className="field__input"
                    placeholder="+91 98765 43210"
                    value={phone}
                    aria-required="true"
                    aria-invalid={currentPhoneError !== null ? "true" : "false"}
                    aria-describedby={
                      currentPhoneError ? phoneErrId : undefined
                    }
                    style={
                      currentPhoneError
                        ? {
                            borderColor: "var(--stop-700)",
                            boxShadow: "0 0 0 3px var(--stop-100)",
                          }
                        : undefined
                    }
                    onChange={handlePhoneChange}
                    onBlur={handlePhoneBlur}
                  />
                  {currentPhoneError && (
                    <div
                      id={phoneErrId}
                      className="field__error"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-1)",
                        color: "var(--stop-700)",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      <span aria-hidden="true">⚠</span>
                      <span>{currentPhoneError}</span>
                    </div>
                  )}
                </div>

                {/* Vehicle registration */}
                <div className="field">
                  <label
                    htmlFor="book-reg"
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: "var(--weight-medium)",
                      color: "var(--ink-900)",
                    }}
                  >
                    Vehicle registration
                  </label>
                  <input
                    id="book-reg"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    className="field__input"
                    placeholder="TS09AB1234"
                    value={vehicleReg}
                    aria-required="true"
                    aria-invalid={currentRegError !== null ? "true" : "false"}
                    aria-describedby={
                      currentRegError ? regErrId : undefined
                    }
                    style={
                      currentRegError
                        ? {
                            borderColor: "var(--stop-700)",
                            boxShadow: "0 0 0 3px var(--stop-100)",
                          }
                        : undefined
                    }
                    onChange={handleRegChange}
                    onBlur={handleRegBlur}
                  />
                  {currentRegError && (
                    <div
                      id={regErrId}
                      className="field__error"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-1)",
                        color: "var(--stop-700)",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      <span aria-hidden="true">⚠</span>
                      <span>{currentRegError}</span>
                    </div>
                  )}
                </div>

                {/* Name — optional */}
                <div className="field">
                  <label
                    htmlFor="book-name"
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: "var(--weight-medium)",
                      color: "var(--ink-900)",
                    }}
                  >
                    Name{" "}
                    <span
                      style={{
                        color: "var(--ink-500)",
                        fontWeight: "var(--weight-regular)",
                      }}
                    >
                      (optional)
                    </span>
                  </label>
                  <input
                    id="book-name"
                    type="text"
                    autoComplete="name"
                    className="field__input"
                    placeholder="Name (optional)"
                    value={driverName}
                    aria-required="false"
                    onChange={(e) => setDriverName(e.target.value)}
                  />
                </div>
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════
              PRICE SUMMARY
              Always shown (mockup keeps it during submitting state too)
          ══════════════════════════════════════ */}
          {ratePaise > 0 && hours > 0 && (
            <div
              className="price-summary"
              aria-label="Price summary"
            >
              {/* Hours × rate row */}
              <div className="price-summary__row">
                <span>
                  {hours} {hours === 1 ? "hour" : "hours"} ×{" "}
                  {paiseToDisplay(ratePaise)}
                </span>
                <span>{paiseToDisplay(hours * ratePaise)}</span>
              </div>

              {/* Rounding note */}
              <div className="price-summary__row">
                <span
                  className="price-summary__rounding"
                  style={{ color: "var(--ink-500)", fontSize: "var(--text-xs)" }}
                >
                  Part hours round up.
                </span>
                <span />
              </div>

              {/* Total row */}
              <div className="price-summary__row price-summary__row--total">
                <span>Total</span>
                <span>{paiseToDisplay(totalPaise)}</span>
              </div>
            </div>
          )}

          {/* Spacer so button stays pinned on short pages */}
          <div style={{ flex: 1 }} aria-hidden="true" />

          {/* ══════════════════════════════════════
              PRIMARY BUTTON
          ══════════════════════════════════════ */}
          {submitStatus === "err_net" ? (
            /* After network error: offer retry with same form state */
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleRetry}
            >
              Try again
            </button>
          ) : submitStatus === "err_422" ? (
            /* After 422: button disabled — they need to go back and fix the window */
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%" }}
              disabled
              aria-disabled="true"
            >
              Book this bay
            </button>
          ) : (
            /* Normal: idle or submitting */
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%" }}
              disabled={isSubmitting || !canSubmit}
              aria-disabled={isSubmitting || !canSubmit}
            >
              {isSubmitting ? "Booking…" : "Book this bay"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
