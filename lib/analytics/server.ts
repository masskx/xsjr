// Server-side events (login, register) recorded from server actions. Never throws: analytics must
// not break signing in.
import "server-only";
import { headers } from "next/headers";
import { getDb } from "../db/client";
import { clientIp } from "../auth/server";
import { optedOut, recordEvent } from "./ingest";

export async function recordAccountEvent(type: "login" | "register", userId: number, path: string) {
  try {
    const h = await headers();
    if (optedOut(h)) return;
    await recordEvent(getDb(), { type, path, ip: await clientIp(), userAgent: h.get("user-agent") ?? "", userId });
  } catch (err) {
    console.error(`[analytics] ${type} event not recorded`, err);
  }
}
