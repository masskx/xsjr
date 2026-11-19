// PostgreSQL connection for server code and scripts. Page components must not import this
// directly: they go through lib/repo (enforced by tests/architecture.test.ts).
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

declare global {
  // Survives Next dev-mode hot reloads so we do not leak pools.
  var __rhPool: Pool | undefined;
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function getPool(): Pool {
  if (!globalThis.__rhPool) {
    globalThis.__rhPool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: process.env.RH_PROCESS_NAME ?? "research-hub",
    });
  }
  return globalThis.__rhPool;
}

export function getDb(pool: Pool = getPool()): Db {
  return drizzle(pool, { schema });
}

export { schema };
