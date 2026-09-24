import { test, expect } from "@playwright/test";

test.describe("mobile", () => {
  test("the home screen works at 390px with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForTimeout(2000);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow, "page scrolls sideways on a phone").toBe(false);

    // Tap targets must meet the 44px baseline in design/a11y.md.
    const small = await page.locator("button, a").evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .filter((e) => e.id !== "next-logo" && !e.closest("nextjs-portal"))
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { t: (e.textContent || "").trim().slice(0, 30), h: Math.round(r.height) };
        })
        .filter((x) => x.h > 0 && x.h < 44),
    );
    expect(small, "tap targets under 44px").toEqual([]);
  });

  const PHONE_SCREENS = [
    ["S2 results", "/search?area=gachibowli&start=2026-12-15T10%3A00%3A00%2B05%3A30&end=2026-12-15T12%3A00%3A00%2B05%3A30"],
    ["S6 lookup", "/lookup"],
    ["S5 confirmed", "/confirmed?ref=ZZZZZZZZZZ"],
    ["S4 pay", "/pay?ref=ZZZZZZZZZZ"],
    ["S3 book, no params", "/book"],
  ] as const;

  for (const [name, path] of PHONE_SCREENS) {
    test(`${name} works at 390px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await page.waitForTimeout(2500);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `${name} scrolls sideways on a phone`).toBe(false);

      // Leaflet's own chrome is excluded: the zoom buttons and the attribution
      // links are rendered by the map library, the attribution is legally
      // required, and design/a11y.md already records the map as a known
      // accessibility limitation with the spot list beneath it as the
      // mitigation. Everything parkmitra renders itself is still checked.
      const small = await page.locator("button, a").evaluateAll((els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .filter((e) => !e.closest(".leaflet-container"))
          // Next.js injects its own dev-mode indicator (#next-logo, inside a
          // nextjs-portal) which is 32px and does not exist in a production
          // build. CI runs `npm run dev` while this was written against
          // `next start`, so it passed locally and failed in CI — an
          // environment difference, not a product defect.
          .filter((e) => e.id !== "next-logo" && !e.closest("nextjs-portal"))
          .map((e) => {
            const r = e.getBoundingClientRect();
            return { t: (e.textContent || "").trim().slice(0, 30), h: Math.round(r.height) };
          })
          .filter((x) => x.h > 0 && x.h < 44),
      );
      expect(small, `${name} has tap targets under 44px`).toEqual([]);
    });
  }
});

test.describe("form validation", () => {
  /**
   * Navigating to S3 by clicking is brittle here — the results page needs a
   * spot with free bays at whatever time this runs. So the window is pinned and
   * the test skips loudly if the fixture has none, rather than failing for a
   * reason that is not about validation.
   */
  test("rejects a bad phone number and keeps what was typed", async ({ page }) => {
    await page.goto(
      "/search?area=gachibowli&start=2026-12-15T10%3A00%3A00%2B05%3A30&end=2026-12-15T12%3A00%3A00%2B05%3A30",
    );
    // Wait on the condition, not the clock. A fixed 2500ms made this skip
    // silently, which is the worst outcome: a test that reports neither pass
    // nor failure and quietly covers nothing.
    const spotLink = page.locator('a[href^="/book"]').first();
    await spotLink.waitFor({ state: "visible", timeout: 15000 });
    await spotLink.click();
    await page.waitForTimeout(2500);

    // Bays are toggle buttons carrying aria-pressed, and the FIRST one is
    // already selected when the screen loads. Clicking it deselects it, which
    // is what made the control below fail — the product was being sensible and
    // the test was being naive.
    await page.locator('button[aria-pressed="true"]').first().waitFor({ timeout: 15000 });

    const phone = page.getByLabel(/mobile number/i);
    await phone.fill("123");
    await page.getByLabel(/vehicle registration/i).fill("TS09AB1234");
    await phone.blur();
    await page.waitForTimeout(600);

    const submit = page.getByRole("button", { name: /book this bay/i });

    // The product refuses invalid input by DISABLING submit rather than by
    // accepting the click and failing afterwards. The first version of this
    // test tried to click it and timed out, which is the product being right
    // and the test being wrong.
    await expect(submit).toBeDisabled();

    // design/a11y.md: "Errors never clear what was typed."
    await expect(phone).toHaveValue("123");

    // And nothing was created.
    await expect(page).not.toHaveURL(/\/confirmed/);
  });

  test("accepts a valid phone and enables submit", async ({ page }) => {
    // The control. If submit were disabled for everything, the test above
    // would pass while the product was entirely broken.
    await page.goto(
      "/search?area=gachibowli&start=2026-12-15T10%3A00%3A00%2B05%3A30&end=2026-12-15T12%3A00%3A00%2B05%3A30",
    );
    const spotLink = page.locator('a[href^="/book"]').first();
    await spotLink.waitFor({ state: "visible", timeout: 15000 });
    await spotLink.click();

    // A bay is pre-selected; do not click it, that would toggle it off.
    await page.locator('button[aria-pressed="true"]').first().waitFor({ timeout: 15000 });

    // +91 prefix: the product requires a full international number, which is
    // why the first version of this control failed and made the negative test
    // above meaningless. A negative test without a working control proves
    // nothing — the button being permanently disabled would have passed it.
    await page.getByLabel(/mobile number/i).fill("+919876543210");
    await page.getByLabel(/vehicle registration/i).fill("TS09AB1234");
    await page.waitForTimeout(600);

    await expect(page.getByRole("button", { name: /book this bay/i })).toBeEnabled();
  });
});

test.describe("time windows", () => {
  test("a window in the past is refused", async ({ page }) => {
    await page.goto("/search?area=gachibowli&start=2020-01-01T10%3A00%3A00%2B05%3A30&end=2020-01-01T12%3A00%3A00%2B05%3A30");
    await page.waitForTimeout(2500);
    const body = (await page.locator("body").innerText()).toLowerCase();
    // Must not silently offer bookable bays in 2020.
    expect(body).not.toMatch(/book this bay/);
  });
});
