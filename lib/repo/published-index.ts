// A tiny index of published (type, slug) pairs for proxy.ts. Kept separate from the page
// snapshot on purpose: Next documents that proxy must not rely on module state shared with
// render code. Refreshed on NOTIFY content_changed, and at least every INDEX_MAX_AGE_MS.
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import type { ResourceType } from "../types";
import { ensureContentListener } from "./listen";

const INDEX_MAX_AGE_MS = Number(process.env.SLUG_INDEX_MAX_AGE_MS ?? 15_000);

interface IndexState {
  pending?: Promise<{ keys: Set<string>; loadedAt: number }>;
}

declare global {
  var __rhSlugIndex: IndexState | undefined;
}
const state: IndexState = (globalThis.__rhSlugIndex ??= {});

async function load() {
  const rows = await getDb()
    .select({ type: s.resources.type, slug: s.resources.slug })
    .from(s.resources)
    .where(eq(s.resources.status, "PUBLISHED"));
  return { keys: new Set(rows.map((r) => `${r.type}/${r.slug}`)), loadedAt: Date.now() };
}

export async function isPublished(type: ResourceType, slug: string): Promise<boolean> {
  ensureContentListener("slug-index", () => {
    state.pending = undefined;
  });
  let index = state.pending ? await state.pending.catch(() => undefined) : undefined;
  if (!index || Date.now() - index.loadedAt > INDEX_MAX_AGE_MS) {
    state.pending = load();
    try {
      index = await state.pending;
    } catch (err) {
      state.pending = undefined;
      throw err;
    }
  }
  return index.keys.has(`${type}/${slug}`);
}
