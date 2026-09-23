import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // These suites share ONE Postgres database and several of them truncate
    // bookings. Run files sequentially: in parallel, availability's cleanup
    // races the concurrency test and the guarantee appears to fail when it has
    // not. A flaky test on the one guarantee this product sells is worse than a
    // slow suite.
    fileParallelism: false,
  },
});
