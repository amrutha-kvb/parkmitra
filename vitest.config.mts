import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Load .env.local before anything imports lib/db.ts. Next.js reads this file
    // automatically; vitest does not. Without it the suite only passed for
    // whoever happened to have DATABASE_URL exported in their shell — which is
    // exactly how it stayed green for me and failed on a fresh clone.
    setupFiles: ["./tests/setup-env.ts"],

    // Playwright specs must not be collected by vitest. They use Playwright's
    // own `test` export, which throws when run under a different runner.
    exclude: ["node_modules/**", "e2e/**", "dist/**", ".next/**"],

    // These suites share ONE Postgres database and several truncate bookings.
    // Run files sequentially: in parallel, availability's cleanup races the
    // concurrency test and the booking guarantee appears to fail when it has
    // not. A flaky test on the one guarantee this product sells is worse than a
    // slower suite.
    fileParallelism: false,
  },
});
