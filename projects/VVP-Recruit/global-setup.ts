import { Pool } from "pg";
import bcrypt from "bcryptjs";

export const E2E_USER = "e2e_test_runner";
export const E2E_PASS = "e2e_test_password_xyz";
export const E2E_ROLE = "admin" as const;

const E2E_CRITERIA = [
  { name: "Technical Skills", description: "Technical aptitude", maxScore: 10, weight: 1, displayOrder: 1 },
  { name: "Communication", description: "Communication clarity", maxScore: 10, weight: 1, displayOrder: 2 },
];

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set — cannot seed E2E test user");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const hash = await bcrypt.hash(E2E_PASS, 4);
    await pool.query(
      `INSERT INTO users (username, name, roles, password_hash)
       VALUES ($1, 'E2E Test Runner', ARRAY[$2]::text[], $3)
       ON CONFLICT (username) DO UPDATE SET password_hash = $3, roles = ARRAY[$2]::text[]`,
      [E2E_USER, E2E_ROLE, hash]
    );

    for (const c of E2E_CRITERIA) {
      await pool.query(
        `INSERT INTO criteria (name, description, max_score, weight, display_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [c.name, c.description, c.maxScore, c.weight, c.displayOrder]
      );
    }
  } finally {
    await pool.end();
  }
}

