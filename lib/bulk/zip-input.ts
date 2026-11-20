// Unpack an uploaded batch ZIP into a temporary folder for the scanner, safely:
// streaming decompression with hard caps on total and per-file size and on the number of entries
// (a "zip bomb" is stopped while inflating, whatever the headers claim), entry names checked
// (no absolute paths, no "..", no backslashes or drive letters), symlinks impossible (only
// regular files are written), and junk folders skipped.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Unzip, UnzipInflate } from "fflate";

export const ZIP_LIMITS = { compressedBytes: 30 * 1024 * 1024, totalBytes: 200 * 1024 * 1024, fileBytes: 10 * 1024 * 1024, entries: 5000 };

export class ZipInputError extends Error {}

const SKIP = /(^|\/)(__MACOSX|node_modules|\.git|__pycache__|\.venv)(\/|$)|(^|\/)\.DS_Store$/;

function safeName(name: string): string | null {
  const n = name.replace(/^\.\//, "");
  if (!n || n.startsWith("/") || n.includes("\\") || /^[A-Za-z]:/.test(n) || n.includes("\0")) return null;
  const parts = n.split("/");
  if (parts.some((p) => p === ".." || p === ".")) return null;
  return n;
}

/** Unzip into a new temp dir and return its path (caller removes it). A single top-level folder
 *  that itself contains skills/ or modules/ is treated as the batch root. */
export function unzipBatch(bytes: Uint8Array): string {
  if (bytes.length > ZIP_LIMITS.compressedBytes) throw new ZipInputError(`ZIP 超过 ${ZIP_LIMITS.compressedBytes / 1024 / 1024} MB`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-bulk-api-"));
  let total = 0;
  let entries = 0;
  let failure: Error | null = null;
  const unzip = new Unzip((file) => {
    if (failure) return;
    if (++entries > ZIP_LIMITS.entries) {
      failure = new ZipInputError(`ZIP 内文件超过 ${ZIP_LIMITS.entries} 个`);
      return;
    }
    const name = safeName(file.name);
    if (!name) {
      failure = new ZipInputError(`不安全的文件名：${file.name.slice(0, 80)}`);
      return;
    }
    if (name.endsWith("/") || SKIP.test(name)) return; // directories and junk
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        failure = new ZipInputError(`解压失败：${err.message}`);
        return;
      }
      size += chunk.length;
      total += chunk.length;
      if (size > ZIP_LIMITS.fileBytes) failure = new ZipInputError(`${name} 解压后超过 ${ZIP_LIMITS.fileBytes / 1024 / 1024} MB`);
      else if (total > ZIP_LIMITS.totalBytes) failure = new ZipInputError(`解压后总大小超过 ${ZIP_LIMITS.totalBytes / 1024 / 1024} MB`);
      if (failure) return file.terminate();
      chunks.push(chunk);
      if (final) {
        const out = path.join(dir, ...name.split("/"));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, Buffer.concat(chunks));
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    // feed in slices so the caps are checked while inflating
    for (let i = 0; i < bytes.length && !failure; i += 64 * 1024) unzip.push(bytes.subarray(i, i + 64 * 1024), i + 64 * 1024 >= bytes.length);
  } catch (err) {
    failure = failure ?? new ZipInputError(`不是有效的 ZIP 文件：${(err as Error).message}`);
  }
  if (!failure && entries === 0) failure = new ZipInputError("不是有效的 ZIP 文件（没有找到任何文件）");
  if (failure) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw failure;
  }
  const top = fs.readdirSync(dir, { withFileTypes: true });
  if (top.length === 1 && top[0].isDirectory()) {
    const inner = path.join(dir, top[0].name);
    if (fs.readdirSync(inner).some((n) => /^(skills|modules|prompts|技能|模块|提示词)$/i.test(n))) {
      return inner; // caller removes the parent via cleanupBatch
    }
  }
  return dir;
}

export function cleanupBatch(dir: string) {
  const tmp = os.tmpdir();
  const root = path.relative(tmp, dir).split(path.sep)[0];
  if (root?.startsWith("rh-bulk-api-")) fs.rmSync(path.join(tmp, root), { recursive: true, force: true });
}
