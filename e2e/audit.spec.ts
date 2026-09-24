import { test, expect } from "@playwright/test";

/**
 * A crawl of every screen, looking for the things nobody writes a test for:
 * uncaught exceptions, network failures, dead internal links, and blank pages.
 *
 * Written after the lookup screen turned out to be linked from nowhere. The
 * dead-link check here is what would have caught the opposite problem - a link
 * pointing at a page that does not exist.
 */
const SCREENS = [
  ["S1 home", "/"],
  ["S2 results", "/search?area=gachibowli&start=2026-12-15T10%3A00%3A00%2B05%3A30&end=2026-12-15T12%3A00%3A00%2B05%3A30"],
  ["S6 lookup", "/lookup"],
  ["S5 confirmed (unknown code)", "/confirmed?ref=ZZZZZZZZZZ"],
  ["S4 pay (unknown code)", "/pay?ref=ZZZZZZZZZZ"],
  ["S3 book (no params)", "/book"],
  ["404 page", "/does-not-exist"],
] as const;

for (const [name, path] of SCREENS) {
  test(`AUDIT ${name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("requestfailed", (r) => {
      const u = r.url();
      if (!u.includes("openstreetmap") && !u.includes("tile")) {
        failedRequests.push(`${u} :: ${r.failure()?.errorText}`);
      }
    });

    const resp = await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // The page must not be blank.
    const text = (await page.locator("body").innerText()).trim();
    expect(text.length, `${name} rendered an empty body`).toBeGreaterThan(30);

    // An uncaught exception is always a bug.
    expect(pageErrors, `${name} threw an uncaught exception`).toEqual([]);
    expect(failedRequests, `${name} had requests fail at the network level`).toEqual([]);

    // Console errors are filtered, not asserted empty. A screen that CORRECTLY
    // handles a 404 from its own API - an unknown reference code, say - still
    // makes the browser log "Failed to load resource: 404". Asserting no console
    // errors at all would flag the product for doing the right thing, and the
    // first version of this file did exactly that on three screens.
    const realErrors = consoleErrors.filter(
      (e) => !/Failed to load resource: the server responded with a status of 40\d/.test(e),
    );
    expect(realErrors, `${name} logged unexpected console errors`).toEqual([]);

    // Every internal link must resolve.
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!),
    );
    for (const href of [...new Set(hrefs)]) {
      const r = await page.request.get(href);
      expect(r.status(), `${name}: dead internal link ${href}`).toBeLessThan(400);
    }

    console.log(`  ${name}: status=${resp?.status()} links=${new Set(hrefs).size} text=${text.length}ch`);
  });
}
