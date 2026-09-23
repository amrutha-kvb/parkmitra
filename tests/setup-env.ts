/**
 * Loads .env.local for the test run.
 *
 * Next.js loads this file itself, so the app worked while `npm test` did not —
 * on a clean clone the database suites failed at `lib/db.ts` because
 * DATABASE_URL was undefined. It only ever passed locally because the variable
 * happened to be exported in my shell. Caught by the Gate 6 fresh-clone test.
 *
 * Deliberately dependency-free: a five-line parser beats adding dotenv for this.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue; // a real env var always wins
    process.env[key] = rawValue!.replace(/^["']|["']$/g, "");
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local, then run npm run db:setup.",
  );
}
