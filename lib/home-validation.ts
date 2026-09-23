/**
 * Pure validation helpers for S1 — Home: pick an area and a window.
 *
 * Extracted into a separate module so they can be unit-tested without
 * a DOM environment. app/page.tsx imports from here.
 */

export interface HomeFormState {
  selectedArea: string | null;
  /** Local date as yyyy-MM-dd, e.g. "2025-07-24". */
  date: string;
  /** 24-hour HH:MM, e.g. "14:30". */
  time: string;
  /** Booking length in whole hours; null = nothing chosen yet. */
  duration: number | null;
}

export interface HomeValidationErrors {
  window?: string;
}

/** Maximum allowed booking duration in hours (inclusive). */
export const MAX_DURATION_HOURS = 12;

/**
 * Combines a yyyy-MM-dd date string and an HH:MM time string into a Date in
 * the local timezone.  Returns an Invalid Date when either part is missing or
 * malformed.
 */
export function combineDateTime(date: string, time: string): Date {
  if (!date || !time) return new Date(NaN);
  return new Date(`${date}T${time}:00`);
}

/**
 * Validates the S1 form.  Returns an object whose keys are field names and
 * whose values are the inline error messages shown in the wireframe/mockup.
 * An empty object means the form is valid.
 *
 * Rules (matching design/wireframes/wireframes.md and the requirement spec):
 *  1. Date + time must be present.
 *  2. Start must be in the future (strictly after `now`).
 *  3. Duration must be ≤ MAX_DURATION_HOURS.
 *
 * Note: end-before-start and over-12-hours are impossible via the UI (chips
 * are 1–4 h), but are validated here for defence-in-depth.
 */
export function validateHomeForm(
  form: HomeFormState,
  now: Date = new Date(),
): HomeValidationErrors {
  const errors: HomeValidationErrors = {};

  if (!form.date || !form.time) {
    errors.window = "Pick a date and start time.";
    return errors;
  }

  const start = combineDateTime(form.date, form.time);

  if (isNaN(start.getTime())) {
    errors.window = "Pick a valid date and start time.";
    return errors;
  }

  if (start <= now) {
    errors.window = "Pick a time from now onwards.";
    return errors;
  }

  if (form.duration !== null && form.duration !== undefined) {
    if (form.duration > MAX_DURATION_HOURS) {
      errors.window = "Maximum booking window is 12 hours.";
      return errors;
    }

    const end = new Date(start.getTime() + form.duration * 60 * 60 * 1000);
    if (end <= start) {
      errors.window = "End time cannot be before start time.";
      return errors;
    }
  }

  return errors;
}

/** Returns today's date as a yyyy-MM-dd string in the local timezone. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns the next whole half-hour from now as HH:MM. */
export function nextHalfHour(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const minutes = d.getMinutes();
  const roundedMinutes = minutes < 30 ? 30 : 60;
  d.setMinutes(roundedMinutes);
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/** Formats a Date to an ISO-8601 datetime string truncated to minute precision. */
export function toISO(d: Date): string {
  return d.toISOString().slice(0, 16);
}
