/**
 * Server-Timing, so the NFR budgets can actually be judged.
 *
 * `design/nfr.md` states its budgets as "measured server-side, p95, warm".
 * Until now nothing measured server-side, so `docs/performance.md` had to
 * record every verdict as **unproven**: measured from Hyderabad, the numbers
 * are dominated by ~230ms of geography to the Washington DC function region,
 * and subtracting an estimate is not a measurement.
 *
 * This emits the handler's own duration as a standard `Server-Timing` header,
 * which browsers surface in devtools and curl can read directly. It turns
 * "probably within budget if you subtract a number I guessed" into a figure.
 *
 * Deliberately tiny and dependency-free. A timing helper that needs its own
 * instrumentation stack is a second thing to keep working.
 */

/** Wrap a handler body, returning its result plus the elapsed milliseconds. */
export async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const result = await fn();
  return [result, performance.now() - started];
}

/**
 * Build the header value.
 *
 * `dur` is milliseconds with one decimal — the Server-Timing spec's unit, so
 * devtools renders it without interpretation.
 */
export function serverTimingHeader(ms: number, name = "handler"): string {
  return `${name};dur=${ms.toFixed(1)}`;
}
