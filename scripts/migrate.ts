// Apply pending migrations from drizzle/. Idempotent; safe to run on every deploy.
//   DATABASE_URL=... npx tsx scripts/migrate.ts            (development)
//   node scripts/migrate.mjs                               (release bundle, run in the container)
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, getPool } from "../lib/db/client";

const folder = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");

async function main() {
  const pool = getPool();
  try {
    const started = Date.now();
    await migrate(getDb(pool), { migrationsFolder: folder });
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations`,
    );
    console.log(`[migrate] ok: ${rows[0].n} migrations applied in total (${Date.now() - started} ms)`);
  } catch (err) {
    console.error("[migrate] FAILED", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
