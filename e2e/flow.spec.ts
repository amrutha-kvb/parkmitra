/**
 * The phase 6 exit condition: the primary flow, database to screen, with no
 * mocks anywhere in the path.
 *
 * Nothing here is stubbed — a real browser drives a real Next.js server talking
 * to a real Postgres with real seed data. If this passes, a person can do this.
 */
import { test, expect } from "@playwright/test";

// Push the window far enough out that repeated local runs never collide with
// each other's bookings on the same bay.
const DAY = `2026-10-${String(1 + Math.floor(Math.random() * 27)).padStart(2, "0")}`;
const START = `${DAY}T10:00:00+05:30`;
const END = `${DAY}T12:00:00+05:30`;

test("a driver can find a bay, book it, pay, and come back with only the code", async ({ page }) => {
  // ── S1: pick an area and a window ──────────────────────────────────────────
  await page.goto("/");
  await expect(page.getByText("Park near where you're going.")).toBeVisible();

  // Go straight to results with an explicit window; the picker is covered by
  // its own tests and this run is about the flow holding together.
  await page.goto(`/search?area=gachibowli&start=${encodeURIComponent(START)}&end=${encodeURIComponent(END)}`);

  // ── S2: real spots, from the database ──────────────────────────────────────
  const firstChoose = page.getByRole("link", { name: /^choose /i })
    .or(page.getByRole("button", { name: /^choose /i })).first();
  await expect(firstChoose).toBeVisible({ timeout: 30_000 });

  // A price must be on screen, and it must be formatted — ₹40, never 4000.
  await expect(page.locator("body")).toContainText(/₹\d+/);

  await firstChoose.click();

  // ── S3: choose a bay and give details ──────────────────────────────────────
  await expect(page).toHaveURL(/\/book/, { timeout: 20_000 });

  const bayChip = page.getByRole("button", { name: /^[A-Z]-?\d+/ }).first();
  if (await bayChip.count()) await bayChip.click();

  await page.getByLabel(/mobile number/i).fill("+919876543210");
  await page.getByLabel(/vehicle registration/i).fill("TS09AB1234");

  await page.getByRole("button", { name: /book this bay/i }).click();

  // ── S4: simulated payment, and it must SAY it is simulated ─────────────────
  await expect(page).toHaveURL(/\/pay/, { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(/no real payment/i);

  await page.getByRole("button", { name: /pay/i }).first().click();

  // ── S5: the reference code is the product's whole promise ──────────────────
  await expect(page).toHaveURL(/\/confirmed/, { timeout: 30_000 });
  const body = await page.locator("body").innerText();
  const code = body.replace(/\s+/g, "").match(/[0-9A-HJKMNP-TV-Z]{10}/)?.[0];
  expect(code, "a reference code must be shown on the confirmation").toBeTruthy();

  // ── S6: come back holding only the code ────────────────────────────────────
  await page.goto("/lookup");
  await page.getByRole("textbox").first().fill(code!);
  await page.getByRole("button", { name: /look up/i }).click();

  await expect(page).toHaveURL(/\/confirmed/, { timeout: 20_000 });
  await expect(page.locator("body")).toContainText(code!.slice(0, 4));
});

test("a wrong reference code is indistinguishable from an unknown one", async ({ page }) => {
  // The enumeration control from the threat model, checked at the UI rather
  // than only at the API.
  await page.goto("/lookup");
  await page.getByRole("textbox").first().fill("ZZZZZZZZZZ");
  await page.getByRole("button", { name: /look up/i }).click();
  await expect(page.locator("body")).toContainText(/no booking/i, { timeout: 20_000 });
});
