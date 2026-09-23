"use client";

/**
 * S1 — Home: pick an area and a window.
 *
 * States (matching design/mockups/index.html × all four columns):
 *   1. Loading skeleton  — while /api/areas is in-flight; chips and date/time
 *                          fields are shown as animated skeletons; button disabled.
 *   2. Error + Retry     — when the areas fetch fails; time controls remain
 *                          usable (partial failure, per mockup note).
 *   3. Default / ready   — areas loaded, form idle, button enabled once area
 *                          and duration are selected.
 *   4. Validation error  — inline messages per wireframes.md; button disabled.
 *
 * Navigation: submitting a valid form pushes /search?area=…&start=…&end=…
 *
 * Accessibility:
 *   - Every interactive element is reachable and operable by keyboard.
 *   - Visible focus ring from globals.css :focus-visible rule.
 *   - Area and duration chip groups use role="listbox" / role="option" +
 *     aria-selected so screen readers announce selection state.
 *   - Date and time <input>s carry aria-invalid + aria-describedby wired to
 *     the inline error element.
 *   - aria-busy="true" on the page root during areas loading.
 *   - aria-live="polite" region announces validation errors to AT.
 *   - Error state uses role="alert" to announce the failure immediately.
 */

import { useCallback, useEffect, useId, useReducer } from "react";
import { useRouter } from "next/navigation";
import {
  type HomeFormState,
  validateHomeForm,
  todayISO,
  nextHalfHour,
  combineDateTime,
  toISO,
  MAX_DURATION_HOURS,
} from "../lib/home-validation";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */

interface Area {
  slug: string;
  name: string;
  centre_lat: number;
  centre_lng: number;
}

type AreasStatus = "loading" | "error" | "ready";

/** Duration chips — covers quick stops through overnight parking (founding use case). */
const DURATION_HOURS = [1, 2, 3, 4, 6, 8, 12] as const;

/* ─────────────────────────────────────────────
   Tiny presentational helpers
───────────────────────────────────────────── */

/** Animated skeleton placeholder block used in the loading state. */
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
 * Section label — uppercase, ink-500, matching the .label class in the mockup.
 * Rendered as a visible <div> that wraps a child <span> carrying the id so
 * aria-labelledby can target it without losing the styling.
 */
function SectionLabel({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      style={{
        fontSize: "var(--text-xs)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        color: "var(--ink-500)",
        fontWeight: "var(--weight-bold)",
        marginBottom: "var(--space-2)",
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Page component
───────────────────────────────────────────── */

export default function HomePage() {
  const router = useRouter();

  /* ── Areas fetch ── */
  const [areasStatus, setAreasStatus] = useReducer(
    (_: AreasStatus, next: AreasStatus) => next,
    "loading" as AreasStatus,
  );
  const [areas, setAreas] = useReducer(
    (_: Area[], next: Area[]) => next,
    [] as Area[],
  );

  /* ── Form state ── */
  const [form, setForm] = useReducer(
    (prev: HomeFormState, patch: Partial<HomeFormState>): HomeFormState => ({
      ...prev,
      ...patch,
    }),
    {
      selectedArea: null,
      date: todayISO(),
      time: nextHalfHour(),
      duration: 2,
    } satisfies HomeFormState,
  );

  /* ── Validation — errors only visible after the first submit attempt ── */
  const [submitted, markSubmitted] = useReducer(() => true, false);
  const errors = submitted ? validateHomeForm(form) : {};
  const hasErrors = Object.keys(errors).length > 0;

  /* ── Stable IDs for aria-describedby ── */
  const windowErrId = useId();
  const labelWhereId = useId();
  const labelWhenId = useId();
  const labelDurationId = useId();

  /* ─────────────────────
     Fetch areas
  ───────────────────── */
  const fetchAreas = useCallback(() => {
    setAreasStatus("loading");
    fetch("/api/areas")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ areas: Area[] }>;
      })
      .then((data) => {
        setAreas(data.areas);
        setAreasStatus("ready");
      })
      .catch(() => {
        setAreasStatus("error");
      });
  }, []);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  /* ─────────────────────
     Submit
  ───────────────────── */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    markSubmitted();

    const errs = validateHomeForm(form);
    if (Object.keys(errs).length > 0) return;
    if (!form.selectedArea || !form.duration) return;

    const start = combineDateTime(form.date, form.time);
    const end = new Date(start.getTime() + form.duration * 60 * 60 * 1000);

    const params = new URLSearchParams({
      area: form.selectedArea,
      start: toISO(start),
      end: toISO(end),
    });
    router.push(`/search?${params.toString()}`);
  }

  /* ─────────────────────
     Derived booleans
  ───────────────────── */
  const formReady = areasStatus === "ready";
  const canSubmit =
    formReady &&
    form.selectedArea !== null &&
    form.duration !== null &&
    !hasErrors;

  /* ─────────────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div
      className="page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
        maxWidth: 480,
        paddingBlock: "var(--space-8)",
      }}
      aria-busy={areasStatus === "loading" ? "true" : undefined}
    >
      {/* ── Brand ── */}
      <div>
        <div
          style={{
            fontWeight: "var(--weight-bold)",
            fontSize: "var(--text-lg)",
            color: "var(--ink-900)",
          }}
        >
          parkmitra
        </div>
        <div
          style={{
            color: "var(--ink-700)",
            fontSize: "var(--text-sm)",
            marginTop: "calc(var(--space-1) * -1)",
          }}
        >
          Park near where you're going.
        </div>

        {/* ── One-liner concept explanation ── */}
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--ink-700)",
            lineHeight: "var(--leading-body)",
            marginTop: "var(--space-1)",
          }}
        >
          Built after a night with a car and nowhere safe to put it. Malls,
          apartment blocks and gyms have bays sitting idle for hours — this
          finds one near you and holds it by the hour.
        </p>

        {/* ── How it works — single compact line ── */}
        <p
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--ink-500)",
            marginTop: "var(--space-1)",
          }}
        >
          Pick an area and a window, choose a bay, arrive with your code.
        </p>

        {/* ── Demo notice — simulated-pay-banner tokens ── */}
        <p
          className="simulated-pay-banner"
          role="note"
          style={{ marginTop: "var(--space-1)" }}
        >
          <span aria-hidden="true">ℹ︎</span>
          <span>
            <strong>Real booking engine, seeded supply.</strong> Bookings,
            pricing and the one-car-per-bay guarantee are enforced by the
            database. Spots are invented — listing a real business without its
            consent isn&apos;t ours to do. Payment is simulated.
          </span>
        </p>
      </div>

      {/* ── Live region — announces validation errors to screen readers ── */}
      <div
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
        {submitted && errors.window ? errors.window : ""}
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        style={{ display: "contents" }}
        aria-label="Find parking"
      >
        {/* ══════════════════════════════════════════
            WHERE — area chips
        ══════════════════════════════════════════ */}
        <section aria-labelledby={labelWhereId}>
          <SectionLabel id={labelWhereId}>Where</SectionLabel>

          {/* State 1: loading skeleton */}
          {areasStatus === "loading" && (
            <div
              className="chip-group"
              role="status"
              aria-label="Loading areas…"
            >
              {[96, 110, 98, 104, 106, 88].map((w, i) => (
                <Skel key={i} style={{ width: w, height: 44 }} />
              ))}
            </div>
          )}

          {/* State 2: error — partial failure, time inputs still usable */}
          {areasStatus === "error" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-6) 0",
                textAlign: "center",
                color: "var(--ink-700)",
              }}
              role="alert"
            >
              <span
                aria-hidden="true"
                style={{ fontSize: "var(--text-xl)" }}
              >
                ⚠
              </span>
              <strong style={{ color: "var(--ink-900)" }}>
                Couldn't load areas
              </strong>
              <span>Check your connection and try again.</span>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  width: "auto",
                  paddingInline: "var(--space-6)",
                }}
                onClick={fetchAreas}
              >
                Retry
              </button>
            </div>
          )}

          {/* State 3 & 4: ready — tappable area chips */}
          {areasStatus === "ready" && (
            <div
              className="chip-group"
              role="listbox"
              aria-labelledby={labelWhereId}
              aria-required="true"
            >
              {areas.map((area) => {
                const selected = form.selectedArea === area.slug;
                return (
                  <button
                    key={area.slug}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`chip${selected ? " chip--selected" : ""}`}
                    onClick={() =>
                      setForm({
                        selectedArea: selected ? null : area.slug,
                      })
                    }
                  >
                    {area.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════
            WHEN — date + start time
        ══════════════════════════════════════════ */}
        <section aria-labelledby={labelWhenId}>
          <SectionLabel id={labelWhenId}>When</SectionLabel>

          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              flexWrap: "wrap" as const,
            }}
          >
            {/* Date */}
            {areasStatus === "loading" ? (
              <Skel
                style={{
                  flex: 1,
                  minWidth: 120,
                  height: 44,
                }}
              />
            ) : (
              <div
                className="field"
                style={{ flex: 1, minWidth: 120 }}
              >
                <label
                  htmlFor="date-input"
                  style={{
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.06em",
                    color: "var(--ink-500)",
                    fontWeight: "var(--weight-bold)",
                  }}
                >
                  Date
                </label>
                <input
                  id="date-input"
                  type="date"
                  className="field__input"
                  value={form.date}
                  min={todayISO()}
                  aria-invalid={
                    submitted && !!errors.window ? "true" : "false"
                  }
                  aria-describedby={
                    submitted && errors.window ? windowErrId : undefined
                  }
                  style={
                    submitted && errors.window
                      ? {
                          borderColor: "var(--stop-700)",
                          boxShadow: "0 0 0 3px var(--stop-100)",
                        }
                      : undefined
                  }
                  onChange={(e) => setForm({ date: e.target.value })}
                />
              </div>
            )}

            {/* Start time */}
            {areasStatus === "loading" ? (
              <Skel
                style={{
                  flex: 1,
                  minWidth: 120,
                  height: 44,
                }}
              />
            ) : (
              <div
                className="field"
                style={{ flex: 1, minWidth: 120 }}
              >
                <label
                  htmlFor="time-input"
                  style={{
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.06em",
                    color: "var(--ink-500)",
                    fontWeight: "var(--weight-bold)",
                  }}
                >
                  Start time
                </label>
                <input
                  id="time-input"
                  type="time"
                  className="field__input"
                  value={form.time}
                  aria-invalid={
                    submitted && !!errors.window ? "true" : "false"
                  }
                  aria-describedby={
                    submitted && errors.window ? windowErrId : undefined
                  }
                  style={
                    submitted && errors.window
                      ? {
                          borderColor: "var(--stop-700)",
                          boxShadow: "0 0 0 3px var(--stop-100)",
                        }
                      : undefined
                  }
                  onChange={(e) => setForm({ time: e.target.value })}
                />
              </div>
            )}
          </div>

          {/* Inline validation error — window */}
          {submitted && errors.window && (
            <div
              id={windowErrId}
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                marginTop: "var(--space-1)",
                color: "var(--stop-700)",
                fontSize: "var(--text-sm)",
              }}
            >
              <span aria-hidden="true">⚠</span>
              <span>{errors.window}</span>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════
            FOR HOW LONG — duration chips
        ══════════════════════════════════════════ */}
        <section aria-labelledby={labelDurationId}>
          <SectionLabel id={labelDurationId}>For how long</SectionLabel>
          <div
            className="chip-group"
            role="listbox"
            aria-labelledby={labelDurationId}
            aria-required="true"
          >
            {DURATION_HOURS.map((h) => {
              const selected = form.duration === h;
              return (
                <button
                  key={h}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`chip${selected ? " chip--selected" : ""}`}
                  onClick={() =>
                    setForm({ duration: selected ? null : h })
                  }
                >
                  {h === 12 ? "12h overnight" : `${h}h`}
                </button>
              );
            })}
          </div>
        </section>

        {/* Spacer: pushes button to the bottom on taller viewports */}
        <div style={{ flex: 1 }} aria-hidden="true" />

        {/* ── Primary action ── */}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%" }}
          /*
           * Disabled when:
           *  • areas are still loading or errored (structural guard)
           *  • after a submit attempt that revealed validation errors
           * aria-disabled mirrors the disabled state for screen readers that
           * skip disabled buttons; the underlying disabled prop already handles
           * keyboard focus exclusion in most browsers.
           */
          disabled={
            areasStatus === "loading" ||
            areasStatus === "error" ||
            (submitted && hasErrors)
          }
          aria-disabled={!canSubmit}
        >
          Find parking
        </button>
      </form>
    </div>
  );
}
