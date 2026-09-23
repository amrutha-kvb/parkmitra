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

/**
 * Reduced motion.
 *
 * design/a11y.md has required this since the baseline was written and it was
 * never implemented. Automated accessibility checks did not catch it and could
 * not have: nothing is wrong with the rendered page, the media query is simply
 * absent, and axe does not emulate user preferences.
 *
 * So this asserts the behaviour under the preference rather than the presence
 * of a rule in a stylesheet — a CSS grep would pass against a media query that
 * targets the wrong selector.
 */
test.describe("reduced motion (design/a11y.md)", () => {
  /**
   * This asserts the STYLESHEET, not the rendered behaviour, and that is
   * deliberate — the behavioural version of this test was written first and
   * was worthless.
   *
   * Playwright's `reducedMotion: "reduce"` makes Chromium suppress animations
   * itself, at the browser level, whatever the page's CSS says. So a test that
   * asked "is the skeleton animating under reduce?" passed identically with the
   * media query present and with it deleted from the build. Verified: built CSS
   * containing zero `prefers-reduced-motion` rules, both assertions green.
   *
   * A test that cannot fail is worse than no test, because it is counted.
   *
   * So this fetches the stylesheet the server actually serves and checks the
   * rule is there and covers the one animation that matters. It is a weaker
   * kind of evidence — it proves the rule exists, not that a browser honours it
   * — and saying so is the point.
   */
  test("the served stylesheet carries a reduced-motion rule covering the shimmer", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    const href = await page
      .locator('link[rel="stylesheet"]')
      .first()
      .getAttribute("href");
    expect(href, "no stylesheet link found on the page").toBeTruthy();

    const css = await (await request.get(href!)).text();

    // The shimmer is the animation that matters: it is infinite, and an
    // infinite animation is what triggers discomfort for vestibular disorders.
    expect(css, "the shimmer animation is not in the served CSS at all")
      .toContain("skeleton-pulse");
    expect(css, "design/a11y.md requires a prefers-reduced-motion rule")
      .toContain("prefers-reduced-motion");

    // And the rule must actually reach the skeleton, not just exist somewhere.
    const query = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(query, "the reduced-motion rule does not mention .skeleton")
      .toContain(".skeleton");
  });
});
