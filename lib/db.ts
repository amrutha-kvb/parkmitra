import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Connection string is read once and never logged, printed, or
// included in error messages — it contains credentials.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default pool;
