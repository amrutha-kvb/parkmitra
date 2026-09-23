import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  // PLAYWRIGHT_BASE_URL lets the same suite run against the deployed instance —
  // which is the run that matters, since Gate 6 grades what a judge can open.
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3111",
    trace: "retain-on-failure",
  },
  // No webServer block: the dev server is started by scripts/dev.sh so the same
  // command works locally and in CI without a second Postgres being spun up.
});
