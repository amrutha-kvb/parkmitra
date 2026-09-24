import { test, expect } from "@playwright/test";

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

    expect(pageErrors, `${name} threw`).toEqual([]);
    expect(failedRequests, `${name} had failed requests`).toEqual([]);
    expect(consoleErrors, `${name} logged console errors`).toEqual([]);

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
