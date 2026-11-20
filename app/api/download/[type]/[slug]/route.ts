// GET /api/download/<skills|modules>/<slug>/ -> ZIP. Access is checked (members-only modules,
// index-only skills are never packaged) and the download is counted before the file is sent.
import { downloadResource } from "@/lib/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug } = await params;
  const r = await downloadResource(type, slug);
  if (!r.ok) {
    return new Response(r.reason, { status: r.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response(new Blob([r.bytes as BlobPart]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${r.filename}"; filename*=UTF-8''${encodeURIComponent(r.filename)}`,
      "Content-Length": String(r.bytes.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
