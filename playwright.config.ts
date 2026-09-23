import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },

  // Start the app ourselves unless we are pointed at a deployment. The default
  // port previously did not match `npm run dev`, so `npm run verify` failed on
  // a fresh clone with ERR_CONNECTION_REFUSED — the README's own commands could
  // not work together. Caught by the Gate 6 fresh-clone test.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
