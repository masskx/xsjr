import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { ImageError, inspectImage } from "@/lib/media/images";
import { deleteMedia, pathForKey, saveImage } from "@/lib/media/storage";
import type { Db } from "@/lib/db/client";
import { TEST_DATABASE_URL, freshDb } from "./helpers/db";

const fx = (name: string) => fs.readFileSync(path.resolve(__dirname, "fixtures", name));

/** Insert an EXIF APP1 segment (with a fake GPS string) right after the JPEG SOI marker. */
function withExif(jpg: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from("Exif\0\0"), Buffer.from("GPSLatitude=23.1291N;GPSLongitude=113.2644E")]);
  const seg = Buffer.alloc(4);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpg.subarray(0, 2), seg, payload, jpg.subarray(2)]);
}

describe("image inspection", () => {
  it.each([
    ["sample.png", "png", "image/png"],
    ["sample.jpg", "jpg", "image/jpeg"],
    ["sample.webp", "webp", "image/webp"],
  ])("%s -> %s 40x30", (file, kind, mime) => {
    const info = inspectImage(fx(file));
    expect(info).toMatchObject({ kind, mime, width: 40, height: 30 });
  });

  it("strips EXIF (e.g. GPS) from JPEGs and keeps the picture", () => {
    const tagged = withExif(fx("sample.jpg"));
    expect(tagged.toString("latin1")).toContain("GPSLatitude");
    const info = inspectImage(tagged);
    expect(info.data.toString("latin1")).not.toContain("GPSLatitude");
    expect(info.data.equals(fx("sample.jpg"))).toBe(true); // identical to the untagged original
  });

  it.each([
    ["svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["html renamed to .png", Buffer.from("<html><body>hi</body></html>")],
    ["gif", Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;")],
    ["empty", Buffer.alloc(0)],
    ["truncated png", fx("sample.png").subarray(0, 20)],
    ["oversized", Buffer.concat([fx("sample.png"), Buffer.alloc(2 * 1024 * 1024)])],
  ])("rejects %s", (_name, buf) => {
    expect(() => inspectImage(buf)).toThrow(ImageError);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("media storage", () => {
  let db: Db;
  let pool: Pool;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-uploads-"));

  beforeAll(async () => {
    process.env.UPLOADS_DIR = dir;
    ({ db, pool } = await freshDb());
  });
  afterAll(async () => {
    await pool?.end();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("stores under a random key, records metadata, deletes cleanly", async () => {
    const row = await saveImage(db, withExif(fx("sample.jpg")), { prefix: "diagrams", alt: "结构图" });
    expect(row.storageKey).toMatch(/^diagrams\/\d{4}\/\d{2}\/[0-9a-f]{24}\.jpg$/);
    expect(row).toMatchObject({ mime: "image/jpeg", width: 40, height: 30, alt: "结构图" });
    const onDisk = fs.readFileSync(pathForKey(row.storageKey));
    expect(onDisk.toString("latin1")).not.toContain("GPSLatitude");
    await deleteMedia(db, row.id);
    expect(fs.existsSync(pathForKey(row.storageKey))).toBe(false);
  });

  it("refuses keys that try to leave the uploads directory", () => {
    for (const bad of ["../etc/passwd.png", "/abs/x.png", "a/../../x.png", "x.svg", "UP/x.png"]) {
      expect(() => pathForKey(bad)).toThrow();
    }
  });
});
