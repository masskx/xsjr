// Test database helpers. DB tests run only when TEST_DATABASE_URL is set; they DROP and
// recreate the schema, so never point it at a real database.
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export async function freshDb(): Promise<{ db: Db; pool: Pool }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL not set");
  if (!/test/i.test(new URL(TEST_DATABASE_URL).pathname)) {
    throw new Error("refusing to reset a database whose name does not contain 'test'");
  }
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  return { db, pool };
}
