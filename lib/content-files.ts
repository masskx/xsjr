// File-based content format: content/<type-dir>/<slug>/{meta.json, body.md, files/**}.
//
// Since Phase 2 this is the IMPORT format only: scripts/import-content.ts reads it with this
// module and writes PostgreSQL; pages read the database through lib/repo. The validation rules
// here are the same ones the Phase 1 static build enforced.
import fs from "node:fs";
import path from "node:path";
import { DIR_TYPE, type Resource, type SiteResource } from "./types";
import { baseMetaSchema, moduleFieldsSchema, promptFieldsSchema, siteFieldsSchema, skillFieldsSchema } from "./content/validation";

export interface FileEntry {
  /** path relative to the resource's files/ directory, forward slashes */
  path: string;
  content: string;
}

export interface LoadedResource {
  resource: Resource;
  /** body.md, or "" when absent */
  body: string;
  files: FileEntry[];
  /** position of this resource within its type in file order (used as sort_order) */
  orderInType: number;
}

/** Directory order is fixed (prompts, skills, modules, sites) and entries are sorted by name,
 *  so the result never depends on the filesystem's readdir order. */
export function loadContentDir(contentDir: string): LoadedResource[] {
  const out: LoadedResource[] = [];
  for (const dir of Object.keys(DIR_TYPE)) {
    const base = path.join(contentDir, dir);
    if (!fs.existsSync(base)) continue;

    const names = fs
      .readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    let orderInType = 0;
    for (const name of names) {
      const metaPath = path.join(base, name, "meta.json");
      if (!fs.existsSync(metaPath)) continue;

      const raw = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
      if ("slug" in raw || "type" in raw) {
        throw new Error(`[content] ${metaPath}: slug and type come from the directory, remove them from meta.json`);
      }
      const resource = { ...raw, slug: name, type: DIR_TYPE[dir] } as unknown as Resource;
      validate(resource, metaPath);

      const bodyPath = path.join(base, name, "body.md");
      const body = fs.existsSync(bodyPath) ? fs.readFileSync(bodyPath, "utf8") : "";
      const files = readFilesDir(path.join(base, name, "files"));

      out.push({ resource, body, files, orderInType: orderInType++ });
    }
  }
  return out;
}

function readFilesDir(root: string): FileEntry[] {
  if (!fs.existsSync(root)) return [];
  const result: FileEntry[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) throw new Error(`[content] symlinks are not allowed: ${abs}`);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) {
        result.push({ path: path.relative(root, abs).split(path.sep).join("/"), content: fs.readFileSync(abs, "utf8") });
      }
    }
  };
  walk(root);
  return result;
}

export function validate(r: Resource, where: string) {
  const need: (keyof Resource)[] = ["title", "summary", "category", "tags", "author", "license", "tier", "updatedAt"];
  const missing = need.filter((k) => r[k] === undefined || r[k] === null);
  if (missing.length) {
    throw new Error(`[content] ${where} 缺少字段: ${missing.join(", ")}`);
  }
  if (r.summary.length < 20 || r.summary.length > 110) {
    throw new Error(`[content] ${where} summary 长度 ${r.summary.length}，要求 20–110 字`);
  }
  if (r.type === "SITE" && !(r as SiteResource).url) {
    throw new Error(`[content] ${where} SITE 类型必须有 url`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.slug)) {
    throw new Error(`[content] ${where} 目录名不是合法 slug: ${r.slug}`);
  }
  // The same rules the admin editor applies (lib/content/validation.ts).
  const typeSchema = { PROMPT: promptFieldsSchema, MODULE: moduleFieldsSchema, SKILL: skillFieldsSchema, SITE: siteFieldsSchema }[r.type];
  const checks = [baseMetaSchema.safeParse(r), typeSchema.safeParse(r)];
  for (const res of checks) {
    if (res && !res.success) {
      throw new Error(`[content] ${where} ${res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
  }
}

/**
 * Normalise an attachment path the way Phase 1 did: accept "x.py", "./x.py", "/x.py" and
 * "files/x.py". Returns null for anything that tries to leave the files/ directory.
 */
export function normaliseAttachmentPath(relativePath: string): string | null {
  const rel = relativePath.replace(/^\.\//, "").replace(/^\/+/, "").replace(/^files\//, "");
  if (!rel || rel.includes("\\") || /^[A-Za-z]:/.test(rel)) return null;
  const parts = rel.split("/");
  if (parts.some((p) => p === ".." || p === "." || p === "")) return null;
  return rel;
}
