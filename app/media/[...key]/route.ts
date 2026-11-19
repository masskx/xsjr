// Serves uploaded media in development and as a fallback. In production Caddy answers /media/*
// straight from the uploads directory before requests reach the app (infra/Caddyfile).
import fs from "node:fs/promises";
import { KEY_RE, pathForKey } from "@/lib/media/storage";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!KEY_RE.test(key)) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(pathForKey(key));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[key.split(".").pop()!],
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
