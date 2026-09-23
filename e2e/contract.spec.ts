/**
 * Contract tests: does the running API actually match design/openapi.yaml?
 *
 * The contract is described throughout this project as written before the
 * implementation and binding. Until now nothing checked that claim. The
 * endpoint audit found three drifts by hand — `/bays` absent from the contract
 * entirely, and four operations returning a 429 that was documented nowhere —
 * which is exactly the class of thing that should not need a human to notice.
 *
 * So this validates real responses against the declared schemas, with ajv
 * resolving `$ref` against the document's own components. If the contract and
 * the code disagree, one of them is wrong and this fails rather than waiting
 * for someone to read both.
 *
 * Deliberately exercises FAILURE paths as well as success ones. A contract test
 * that only checks 200s leaves the error shapes — the part clients get wrong
 * most often — unverified.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

type OpenApi = {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components?: Record<string, unknown>;
};

const spec = yaml.load(
  readFileSync(resolve(process.cwd(), "design/openapi.yaml"), "utf8"),
) as OpenApi;

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

/**
 * Resolve a local JSON pointer (`#/components/responses/BadRequest`) against
 * the document.
 */
function deref<T = unknown>(node: unknown): T {
  let current = node as Record<string, unknown>;
  let guard = 0;
  while (current && typeof current === "object" && typeof current["$ref"] === "string") {
    const ref = current["$ref"] as string;
    if (!ref.startsWith("#/")) break;
    let target: unknown = spec;
    for (const part of ref.slice(2).split("/")) {
      target = (target as Record<string, unknown>)?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    current = target as Record<string, unknown>;
    if (++guard > 10) break; // a cycle in the document, not our problem to fix here
  }
  return current as T;
}

/**
 * The schema declared for one path + method + status, or null if none.
 *
 * Follows `$ref` on the response object. Shared responses are how this contract
 * declares its 400s and 429s — `#/components/responses/BadRequest` — and the
 * first version of this file only looked at inline `content`, so every one of
 * those read as "not documented". That would have been a test reporting drift
 * that did not exist, which is worse than missing drift that does.
 */
function schemaFor(path: string, method: string, status: string): object | null {
  const op = spec.paths?.[path]?.[method] as
    | { responses?: Record<string, unknown> }
    | undefined;
  const raw = op?.responses?.[status];
  if (!raw) return null;
  const response = deref<{ content?: Record<string, { schema?: object }> }>(raw);
  return response?.content?.["application/json"]?.schema ?? null;
}

function validator(schema: object): ValidateFunction {
  return ajv.compile({ ...schema, components: spec.components } as object);
}

async function check(
  request: import("@playwright/test").APIRequestContext,
  opts: {
    path: string;
    method: "get" | "post";
    status: number;
    url: string;
    data?: unknown;
  },
) {
  const res =
    opts.method === "get"
      ? await request.get(opts.url)
      : await request.post(opts.url, { data: opts.data ?? {} });

  expect(
    res.status(),
    `${opts.method.toUpperCase()} ${opts.url} should return ${opts.status}`,
  ).toBe(opts.status);

  const schema = schemaFor(opts.path, opts.method, String(opts.status));
  expect(
    schema,
    `design/openapi.yaml documents no ${opts.status} for ${opts.method.toUpperCase()} ${opts.path}`,
  ).not.toBeNull();

  const body = await res.json();
  const validate = validator(schema!);
  const ok = validate(body);

  expect(
    ok,
    `response does not match the contract:\n${JSON.stringify(validate.errors, null, 2)}\nbody: ${JSON.stringify(body)}`,
  ).toBe(true);
}

test.describe("the API matches design/openapi.yaml", () => {
  test("GET /areas → 200", async ({ request }) => {
    await check(request, { path: "/areas", method: "get", status: 200, url: "/api/areas" });
  });

  test("GET /health → 200", async ({ request }) => {
    await check(request, { path: "/health", method: "get", status: 200, url: "/api/health" });
  });

  test("GET /availability → 400 on a malformed window", async ({ request }) => {
    await check(request, {
      path: "/availability",
      method: "get",
      status: 400,
      url: "/api/availability?area=gachibowli&start=nonsense&end=nonsense",
    });
  });

  test("GET /bays → 400 without a spot_id", async ({ request }) => {
    await check(request, {
      path: "/bays",
      method: "get",
      status: 400,
      url: "/api/bays?start=2026-12-15T10%3A00%3A00%2B05%3A30&end=2026-12-15T12%3A00%3A00%2B05%3A30",
    });
  });

  test("GET /bookings/{reference_code} → 404 for an unknown code", async ({ request }) => {
    await check(request, {
      path: "/bookings/{reference_code}",
      method: "get",
      status: 404,
      url: "/api/bookings/ZZZZZZZZZZ",
    });
  });

  test("POST /bookings → 400 when required fields are missing", async ({ request }) => {
    await check(request, {
      path: "/bookings",
      method: "post",
      status: 400,
      url: "/api/bookings",
      data: {},
    });
  });

  /**
   * Every documented path must exist. This is what would have caught `/bays`
   * being absent from the contract — from the other direction, a path
   * documented and never built.
   */
  test("every documented path responds to something other than 404-from-the-router", async ({
    request,
  }) => {
    const unreachable: string[] = [];
    for (const path of Object.keys(spec.paths ?? {})) {
      if (path.includes("{")) continue; // covered individually above
      const res = await request.get(`/api${path}`);
      if (res.status() === 404) unreachable.push(path);
    }
    expect(unreachable, "documented in the contract but not served").toEqual([]);
  });
});
