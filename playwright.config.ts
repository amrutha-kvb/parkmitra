import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3111", trace: "retain-on-failure" },
  // No webServer block: the dev server is started by scripts/dev.sh so the same
  // command works locally and in CI without a second Postgres being spun up.
});
