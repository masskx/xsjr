// One PostgreSQL LISTEN connection per (process, key) that calls `onNotify` whenever any
// writer runs `NOTIFY content_changed` (importer, admin actions). Reconnects lazily: if the
// connection drops, the next call to ensureContentListener() opens a new one, and callers
// always keep a max-age fallback so a missed notification only delays a refresh.
import pg from "pg";
import { databaseUrl } from "../db/client";

interface ListenerSlot {
  client?: pg.Client;
  starting?: boolean;
}

declare global {
  var __rhListeners: Map<string, ListenerSlot> | undefined;
}

export function ensureContentListener(key: string, onNotify: () => void) {
  if (process.env.RH_DISABLE_LISTEN === "1") return;
  const slots = (globalThis.__rhListeners ??= new Map());
  const slot = slots.get(key) ?? {};
  slots.set(key, slot);
  if (slot.client || slot.starting) return;

  slot.starting = true;
  const client = new pg.Client({ connectionString: databaseUrl(), application_name: `rh-listen-${key}` });
  const drop = () => {
    if (slot.client === client) slot.client = undefined;
    onNotify();
  };
  client.on("notification", () => onNotify());
  client.on("error", drop);
  client.on("end", drop);
  client
    .connect()
    .then(() => client.query("LISTEN content_changed"))
    .then(() => {
      slot.client = client;
    })
    .catch((err) => {
      console.error(`[listen:${key}] LISTEN failed; relying on max age`, err);
      client.end().catch(() => {});
    })
    .finally(() => {
      slot.starting = false;
    });
}
