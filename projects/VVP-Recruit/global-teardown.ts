import { Pool } from "pg";
import { E2E_USER } from "./global-setup";

export default async function globalTeardown() {
  if (!process.env.DATABASE_URL) return;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("DELETE FROM users WHERE username = $1", [E2E_USER]);
  } finally {
    await pool.end();
  }
}

