/**
 * Accessibility audit against the baseline in design/a11y.md.
 *
 * Automated checks catch a real subset, not everything — the honest limits are
 * recorded in field/a11y-audit.md. What is asserted here is asserted because it
 * was measured.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SCREENS = [
  ["S1 home", "/"],
  ["S6 lookup", "/lookup"],
  ["S2 results", "/search?area=gachibowli&start=2026-12-15T10%3A00%3A00%2B05%3A30&end=2026-12-15T12%3A00%3A00%2B05%3A30"],
] as const;

for (const [name, path] of SCREENS) {
  test(`${name} has no serious or critical accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(2500); // client-rendered content

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    if (blocking.length) {
      console.log(
        blocking.map((v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length})`).join("\n"),
      );
    }
    expect(blocking).toEqual([]);
  });
}

test("the whole booking form is reachable by keyboard alone", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  // Tab until the primary action has focus. If it cannot be reached, the screen
  // is unusable without a mouse regardless of what the audit says.
  let reached = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    if (/find parking/i.test(label)) { reached = true; break; }
  }
  expect(reached, "Find parking must be reachable with Tab").toBe(true);
});
