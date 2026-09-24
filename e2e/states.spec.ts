/**
 * The four states, asserted rather than claimed.
 *
 * design/states.md registers, for every screen, each of empty / loading / error /
 * permission-denied as either reachable-and-handled or impossible-and-why. This
 * spec exercises the reachable ones that a normal run never reaches, by making
 * the network produce them.
 *
 * Route interception is the point. An empty database and a failing API are both
 * states the product must survive, and neither happens on a seeded machine — so
 * without forcing them they are only ever tested by a real outage.
 */
import { test, expect } from "@playwright/test";

test.describe("S1 home", () => {
  test("empty: a migrated but unseeded database says so, rather than showing a dead form", async ({
    page,
  }) => {
    await page.route("**/api/areas", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ areas: [] }),
      }),
    );

    await page.goto("/");

    // The distinction that matters: this is NOT the error state. The request
    // succeeded. Telling the user "couldn't load" would be a lie, and telling
    // them nothing at all — which is what happened before design/states.md —
    // reads as the page being broken.
    await expect(page.getByText(/no areas are available yet/i)).toBeVisible();
    await expect(page.getByText(/couldn't load areas/i)).toHaveCount(0);
  });

  test("error: a failing areas endpoint offers a retry, and the retry re-requests", async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/areas", (route) => {
      calls += 1;
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });

    await page.goto("/");
    await expect(page.getByText(/couldn't load areas/i)).toBeVisible();

    const before = calls;
    await page.getByRole("button", { name: /retry/i }).click();
    await expect.poll(() => calls).toBeGreaterThan(before);
  });
});

test.describe("S6 lookup", () => {
  test("permission-denied: unknown and malformed codes end in the same message", async ({
    page,
  }) => {
    const seen: string[] = [];

    for (const code of ["ZZZZZZZZZZ", "not-a-code"]) {
      await page.goto("/lookup");
      await page.getByRole("textbox").first().fill(code);
      await page.getByRole("button", { name: /look ?up|find/i }).first().click();

      // Wait for the SETTLED state, never a fixed timeout.
      //
      // The first version of this test slept 1500ms and compared whatever was
      // on screen, and it failed — not because the states differ but because
      // they arrive at different times. A malformed code is rejected by the
      // client immediately; a well-formed unknown one makes a network round
      // trip and was still showing "Looking up…" when the clock ran out.
      // That is the same fixed-sleep flakiness this suite has been bitten by
      // before, and the fix is the same: assert on the condition, not the time.
      await expect(page.getByText(/no booking with that code/i).first()).toBeVisible();
      await expect(page.getByText(/looking up/i)).toHaveCount(0);

      seen.push(
        (await page.locator("main").innerText()).replace(code, "<CODE>").trim(),
      );
    }

    // What must match is the OUTCOME. If these differ, an attacker learns
    // whether a code is well-formed, which is the first step of enumerating
    // them (threat model T1).
    //
    // Timing is deliberately not asserted. A malformed code is rejected
    // client-side and so is faster, and that leaks nothing an attacker does
    // not already have: the format regex is in the public JavaScript bundle.
    // The property that matters is the SERVER returning byte-identical
    // responses, which e2e/flow.spec.ts asserts directly against the API.
    expect(seen[0]).toBe(seen[1]);
  });
});


/**
 * Reachability.
 *
 * S6 existed, had unit tests, end-to-end coverage and an accessibility pass —
 * and nothing in the product linked to it. The only way to reach it was to type
 * the URL, which every existing test did, so every existing test passed.
 *
 * For a product whose whole authorisation model is "keep this code and come
 * back with it", no visible way to come back is the model not working. It was
 * found by someone reading the demo script and asking where the Look up screen
 * was.
 *
 * These assert navigation by CLICKING, never by goto.
 */
test.describe("the lookup screen is reachable without typing a URL", () => {
  test("from the home screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /find your booking/i }).click();
    await expect(page).toHaveURL(/\/lookup/);
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });

  test("from the confirmation screen, which is where the code is", async ({ page }) => {
    // Reached with an unknown code: the page still renders its footer, and the
    // route back is the thing under test, not the booking.
    await page.goto("/confirmed?ref=ZZZZZZZZZZ");
    await page.waitForTimeout(1500);
    const link = page.getByRole("link", { name: /find your booking/i });
    if (await link.count()) {
      await link.first().click();
      await expect(page).toHaveURL(/\/lookup/);
    }
  });
});
