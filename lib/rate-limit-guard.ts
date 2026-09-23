/**
 * One place that turns a request into a rate-limit decision.
 *
 * Extracted because the same fifteen lines were about to be copied into five
 * route handlers, and the copies would have drifted. Three details in it are
 * easy to get subtly wrong, and getting any of them wrong is silent:
 *
 *   1. Which IP to trust.
 *   2. Fail open, not closed, and log the failure without leaking the error.
 *   3. Return a 429 that a client can actually act on.
 *
 * `design/threat-model.md` T1 (enumeration) and T3 (booking spam) both depend
 * on this being applied consistently, so it is one function rather than a
 * convention.
 */
import { NextResponse } from "next/server";
import { checkRateLimit, type RateLimitScope } from "./rate-limit";

/**
 * The client address, as far as it can be known.
 *
 * On Vercel `x-forwarded-for` is set by the platform and its FIRST entry is the
 * real client. Downstream entries are proxies and are attacker-controllable, so
 * only the first is used. Falls back to a loopback literal rather than throwing:
 * the column is `inet` and an unparseable value would turn a throttling check
 * into a 500 on a perfectly good request.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "127.0.0.1";
}

/**
 * Returns a 429 response if the caller has exhausted `scope`, or `null` to
 * continue.
 *
 * Fails OPEN. Rate limiting here is defence in depth — for T1 the real barrier
 * is ~50 bits of entropy in the reference code — so a limiter outage must not
 * take the product down with it.
 */
export async function rateLimitGuard<T = unknown>(
  request: Request,
  scope: RateLimitScope,
): Promise<NextResponse<T> | null> {
  try {
    const result = await checkRateLimit(clientIp(request), { scope });
    if (result.allowed) return null;

    // Generic in the caller's response type so each route keeps its own typed
    // union (ARCH-002). The body really is the shared error shape — every route
    // in this project declares an ErrorResponse of { error, message } — so the
    // assertion narrows rather than lies.
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many requests. Try again in a moment.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfterSeconds) },
      },
    ) as NextResponse<T>;
  } catch (err) {
    // Log the TYPE, never the error object. SEC-001: a pg error can carry the
    // connection string, and server logs get shipped elsewhere. The operator
    // signal that matters is that it happened at all.
    console.error(
      `rate-limit check failed for scope '${scope}', proceeding without throttling:`,
      err instanceof Error ? err.name : "unknown error",
    );
    return null;
  }
}
