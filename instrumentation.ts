// Runs once when the Next.js server starts. Starts the ingestion worker (lib/ingest/worker.ts)
// in the Node.js runtime when DEEPSEEK_API_KEY is configured. INGEST_WORKER=0 turns it off
// (deploy pre-flight containers do this, so a release under test never takes jobs).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.INGEST_WORKER === "0" || !process.env.DATABASE_URL) return;
  if (!process.env.DEEPSEEK_API_KEY) return;
  const { startIngestWorker } = await import("./lib/ingest/worker");
  await startIngestWorker();
}
