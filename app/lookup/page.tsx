"use client";

/**
 * S6 — Lookup: a driver returns holding only their reference code.
 *
 * States (matching design/mockups/index.html § S6, all four columns):
 *
 *   Empty / idle  (nothing entered, or fewer than ten characters)
 *     • Monospace input with placeholder "XXXX XXXX XX".
 *     • "Look up" button disabled until exactly ten raw characters are present.
 *     • Hint beneath the button: "The code is on your confirmation."
 *
 *   Loading  (fetch in-flight)
 *     • Input shows the formatted code, locked (readOnly).
 *     • Button disabled with label "Looking up…".
 *     • aria-busy="true" on the page root.
 *
 *   Not found  (API → 404)
 *     • Input border turns stop-red, focus ring stop-100.
 *     • Inline error below the input: "⚠ No booking with that code."
 *     • Input carries aria-invalid="true" and aria-describedby pointing to
 *       the error element.
 *     • Error announced via aria-live="polite" to avoid interrupting the user
 *       mid-sentence (polite, not assertive — the button press already focuses
 *       attention; an assertive alert would double-interrupt).
 *     • Button re-enabled so the driver can correct and retry.
 *
 *   Rate limited  (API → 429)
 *     • Stop-coloured banner across the top: "⚠ Too many tries. Wait a minute
 *       before trying again."
 *     • Input cleared and reset to placeholder; button disabled.
 *     • Banner carries role="alert" for immediate AT announcement.
 *
 * Input behaviour:
 *   • font-family: var(--font-mono), letter-spacing: 0.12em — matches the
 *     reference code display on S5.
 *   • Every keystroke is uppercased before being stored.
 *   • Spaces (and any non-alphanumeric) are accepted visually as typed but are
 *     stripped when computing the ten-character count and before sending to
 *     the API. This lets the driver copy-paste "7K2M 9QX4 TB" from the
 *     confirmation without error.
 *   • Display value: the raw input exactly as the driver types it (so spaces
 *     they add appear naturally); the cleaned value used for validation and the
 *     API call removes all spaces.
 *
 * Navigation:
 *   On a 200 response the router pushes /confirmed?ref={RAW_10_CHAR_CODE}.
 *   The raw, unspaced code is forwarded so /confirmed can look it up.
 *
 * Keyboard:
 *   • Enter in the input submits when the button would be enabled.
 *   • The button is a native <button type="submit"> inside a <form>.
 *   • No click handlers on non-interactive elements.
 *
 * Accessibility:
 *   • aria-busy on the page wrapper during loading.
 *   • aria-describedby on the input wires it to the error element.
 *   • aria-invalid="true" on the input in the not-found state.
 *   • role="alert" on the rate-limit banner for immediate announcement.
 *   • aria-live="polite" region mirrors inline errors for AT that do not
 *     support aria-describedby live updates (belt-and-braces).
 *   • Visible focus ring from globals.css :focus-visible.
 */

import { useId, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { toUpperCase, cleanAndValidate, REQUIRED_LENGTH } from "../../lib/lookup-validation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The four mutually exclusive page states.
 * "idle" covers both empty (no input) and partially filled (< 10 chars).
 */
type PageStatus = "idle" | "loading" | "not_found" | "rate_limited";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// REQUIRED_LENGTH, toUpperCase, and cleanAndValidate are imported from
// lib/lookup-validation so they can be unit-tested independently of the DOM.

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * SectionLabel — uppercased secondary label matching the .label class in the
 * mockup. Renders a div so it can carry an id for aria-labelledby.
 */
function SectionLabel({
  id,
  htmlFor,
  children,
}: {
  id?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      id={id}
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: "var(--text-xs)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--ink-500)",
        fontWeight: "var(--weight-bold)",
      }}
    >
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function LookupPage() {
  const router = useRouter();

  // ── IDs for aria wiring ──────────────────────────────────────────────────
  const inputId = useId();
  const errorId = useId();
  const liveRegionId = useId();

  // ── State ─────────────────────────────────────────────────────────────────
  const [status, setStatus] = useReducer(
    (_: PageStatus, next: PageStatus) => next,
    "idle" as PageStatus,
  );

  // The raw value shown in the input (may contain spaces, mixed case before
  // the uppercase transform). We track it as the uppercased display string.
  const [rawValue, setRawValue] = useReducer(
    (_: string, next: string) => next,
    "",
  );

  // Ref keeps the input focused for keyboard-first correction after errors.
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Derived values ────────────────────────────────────────────────────────
  const { cleanCode, isReady } = cleanAndValidate(rawValue);
  const isLoading = status === "loading";
  const isRateLimited = status === "rate_limited";
  const isNotFound = status === "not_found";

  // The button is disabled when:
  //   • fewer than ten non-space characters have been typed, OR
  //   • a fetch is in-flight, OR
  //   • rate limited (driver must wait before sending another request)
  const buttonDisabled = !isReady || isLoading || isRateLimited;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Always uppercase; spaces are preserved in display, stripped for logic.
    setRawValue(toUpperCase(e.target.value));
    // Clear a stale not-found error as soon as the driver starts editing.
    if (status === "not_found") {
      setStatus("idle");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (buttonDisabled) return; // keyboard guard — belt-and-braces

    setStatus("loading");

    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(cleanCode)}`,
      );

      if (res.status === 429) {
        // Rate limited — clear the input, disable the button, show banner.
        setRawValue("");
        setStatus("rate_limited");
        return;
      }

      if (res.status === 404) {
        // Not found — show inline error, keep code in the field.
        setStatus("not_found");
        // Restore focus to the input so keyboard users can immediately correct.
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      if (!res.ok) {
        // Unexpected server error — treat as not-found to avoid leaking state.
        // A separate error state is not in the mockup spec; the two-error
        // design deliberately keeps the surface small (threat model T1).
        setStatus("not_found");
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      // 200 — booking found. Navigate to /confirmed with the raw code.
      router.push(`/confirmed?ref=${encodeURIComponent(cleanCode)}`);
    } catch {
      // Network failure — surface as not-found (no extra state in mockup).
      setStatus("not_found");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

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
      {/*
       * Hidden polite live region — announced when the error text changes.
       * Complements aria-describedby for AT that poll instead of watching.
       */}
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
        {isNotFound ? "No booking with that code." : ""}
      </div>

      {/* ── Screen title / brand ─────────────────────────────────────────── */}
      <div
        style={{
          fontWeight: "var(--weight-bold)",
          fontSize: "var(--text-lg)",
          color: "var(--ink-900)",
        }}
      >
        Find your booking
      </div>

      {/* ══════════════════════════════════════════
          STATE: rate limited — standing banner
          Rendered above the form so it is the first focusable
          region AT reads after the page updates.
      ══════════════════════════════════════════ */}
      {isRateLimited && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-2)",
            background: "var(--stop-100)",
            color: "var(--stop-700)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-2) var(--space-3)",
            fontSize: "var(--text-sm)",
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>Too many tries. Wait a minute before trying again.</span>
        </div>
      )}

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        noValidate
        style={{ display: "contents" }}
        aria-label="Look up booking by reference code"
      >
        {/* ── Field ─────────────────────────────────────────────────────── */}
        <div className="field">
          <SectionLabel htmlFor={inputId}>Reference code</SectionLabel>

          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="field__input"
            /*
             * inputMode="text" keeps the full keyboard — numeric-only mode
             * would prevent letter entry. autocomplete="off" stops browsers
             * suggesting previously entered codes which may belong to other
             * bookings sharing the device.
             */
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX XXXX XX"
            value={rawValue}
            readOnly={isLoading}
            onChange={handleChange}
            // Keyboard submit — fires the form's onSubmit when Enter is pressed
            // inside the input; the form's native submit handles the rest.
            aria-invalid={isNotFound ? "true" : "false"}
            aria-describedby={
              isNotFound ? `${errorId} ${liveRegionId}` : liveRegionId
            }
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              /*
               * Error state: stop-red border + stop-100 focus ring halo,
               * matching the .input.bad style in the mockup.
               */
              ...(isNotFound
                ? {
                    borderColor: "var(--stop-700)",
                    boxShadow: "0 0 0 3px var(--stop-100)",
                  }
                : {}),
            }}
          />

          {/* ── Inline error — not found ──────────────────────────────── */}
          {isNotFound && (
            <div
              id={errorId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                color: "var(--stop-700)",
                fontSize: "var(--text-sm)",
              }}
            >
              {/* Icon is aria-hidden — the text alone is the accessible error */}
              <span aria-hidden="true">⚠</span>
              <span>No booking with that code.</span>
            </div>
          )}
        </div>

        {/* ── Primary action ────────────────────────────────────────────── */}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={buttonDisabled}
          /*
           * aria-disabled mirrors the logical disabled state for screen
           * readers that skip native-disabled elements. We keep the button
           * in the tab order only when it is enabled — disabled natively
           * already excludes it, which is intentional here (unlike some
           * cases where we want disabled-but-focusable for disclosure).
           */
          aria-disabled={buttonDisabled}
        >
          {isLoading ? "Looking up…" : "Look up"}
        </button>

        {/* ── Hint — visible in idle state, hidden during loading/errors ── */}
        {!isLoading && !isRateLimited && (
          <p
            style={{
              margin: 0,
              color: "var(--ink-700)",
              fontSize: "var(--text-sm)",
            }}
          >
            The code is on your confirmation.
          </p>
        )}
      </form>
    </div>
  );
}
