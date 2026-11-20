// Time the analytics dashboard queries (5 runs each after a warm-up).
//   BENCH_DATABASE_URL=postgres://... npx tsx scripts/bench-analytics.ts
// Load test data first, e.g. 1M synthetic events (see docs/RUNBOOK.md, analytics section).
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as q from "../lib/analytics/queries";
(async () => {
  const pool = new Pool({ connectionString: process.env.BENCH_DATABASE_URL ?? process.env.TEST_DATABASE_URL });
  const db = drizzle(pool) as never;
  const runs: [string, () => Promise<unknown>][] = [
    ["trafficSummary", () => q.trafficSummary(db)], ["dailyTrend(30)", () => q.dailyTrend(db, 30)],
    ["topCopied", () => q.topCopied(db)], ["topViewed", () => q.topViewed(db)], ["topLocked", () => q.topLocked(db)],
    ["topSearches", () => q.topSearches(db)], ["topReferrers", () => q.topReferrers(db)], ["accountStats", () => q.accountStats(db)],
  ];
  for (const [name, fn] of runs) {
    await fn(); // warm
    const t = [];
    for (let i = 0; i < 5; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s); }
    t.sort((a, b) => a - b);
    console.log(`${name.padEnd(16)} median ${t[2].toFixed(1)} ms  max ${t[4].toFixed(1)} ms`);
  }
  await pool.end();
})();
