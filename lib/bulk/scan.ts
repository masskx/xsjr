// Read a batch folder of loose files and work out as much as possible about each item.
// No database access: the result is merged with the batch list (清单.csv) and validated in plan.ts.
//
//   <batch>/
//     skills/<name>/SKILL.md            (技能/ also accepted) other files are listed, not stored
//     skills/<name>/README.md           optional: page body
//     modules/<name>/...code...         (模块/ also accepted) a files/ subfolder is used as the
//                                       code root when present (same layout as content/)
//     modules/<name>/README.md          optional: page body, first "# heading" = title,
//                                       first paragraph = summary
//     modules/<name>/diagram.png        optional structure diagram (diagram|architecture|
//                                       structure|结构图|架构图 .png/.jpg/.webp, or the only image)
//     清单.csv                           optional overrides, one row per item
//
// Symlinks are never followed. Hidden files, build output and dependency folders are skipped.
import fs from "node:fs";
import path from "node:path";
import { pinyin } from "pinyin-pro";

export type ItemType = "skill" | "module";

export interface ScannedFile {
  path: string;
  size: number;
  content?: string;
}

export interface ScannedItem {
  type: ItemType;
  /** folder name, the key that links a row of 清单.csv to the item */
  folder: string;
  slug: string;
  title?: string;
  summary?: string;
  body: string;
  /** body without the paragraph used as the summary (used when the summary is not overridden) */
  bodyAfterSummary?: string;
  /** skills: SKILL.md text; modules: code files with content */
  skillMd?: string;
  files: ScannedFile[];
  entry?: string;
  language?: string;
  dependencies?: string[];
  diagram?: { file: string; bytes: Buffer };
  warnings: string[];
  errors: string[];
}

export const LIMITS = { maxItems: 200, maxModuleFiles: 20, maxFileChars: 200_000, maxDiagramBytes: 2 * 1024 * 1024, maxSkillMdChars: 100_000 };

const SKIP_DIRS = new Set(["node_modules", "__pycache__", ".git", ".svn", ".hg", ".venv", "venv", "env", "dist", "build", ".idea", ".vscode", ".ipynb_checkpoints", ".pytest_cache", ".mypy_cache", "target"]);
const SKIP_FILES = /^(\..*|thumbs\.db|desktop\.ini|.*\.pyc|.*\.pyo|.*\.class|.*\.o|.*\.so|.*\.dll|.*\.exe|~\$.*)$/i;
const IMAGE = /\.(png|jpe?g|webp)$/i;
const DIAGRAM_NAME = /^(diagram|architecture|structure|arch|结构图|架构图|示意图)\.(png|jpe?g|webp)$/i;
const README = /^readme\.(md|markdown|txt)$/i;
const LICENSE_FILE = /^(license|licence|copying)(\.(md|txt))?$/i;

const LANG_BY_EXT: Record<string, string> = {
  py: "Python", r: "R", ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", mjs: "JavaScript", m: "MATLAB", jl: "Julia",
  sh: "Shell", ps1: "PowerShell", cpp: "C++", cc: "C++", c: "C", h: "C", java: "Java", go: "Go", rs: "Rust", sql: "SQL", rb: "Ruby", ipynb: "Python",
};
const ENTRY_CANDIDATES = ["main.py", "__init__.py", "app.py", "index.ts", "index.js", "main.ts", "main.js", "main.R", "main.r", "main.m", "main.jl", "main.go", "main.rs", "main.cpp", "main.c", "Main.java"];

/** Slug from a folder or skill name; Chinese becomes pinyin. */
export function slugify(raw: string): string {
  const latin = /[一-鿿]/.test(raw) ? pinyin(raw, { toneType: "none", type: "array", nonZh: "consecutive" }).join("-") : raw;
  return latin
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

function listDir(dir: string): fs.Dirent[] {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Files under dir (relative paths with "/"), skipping links, hidden files and junk folders. */
function walk(dir: string, rel = "", skipped: string[] = []): { files: string[]; skipped: string[] } {
  const files: string[] = [];
  for (const e of listDir(dir)) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) {
      skipped.push(`${r}（符号链接）`);
      continue;
    }
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      files.push(...walk(path.join(dir, e.name), r, skipped).files);
    } else if (e.isFile() && !SKIP_FILES.test(e.name)) files.push(r);
  }
  return { files, skipped };
}

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

function readText(file: string): { text?: string; problem?: string } {
  const buf = fs.readFileSync(file);
  if (isBinary(buf)) return { problem: "二进制文件" };
  const text = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3).toString("utf8") : buf.toString("utf8");
  if (text.includes("�")) {
    // probably GBK (common for older Windows files); decode it properly
    try {
      return { text: new TextDecoder("gb18030", { fatal: true }).decode(buf) };
    } catch {
      return { problem: "不是 UTF-8 或 GBK 文本" };
    }
  }
  return { text: text.replace(/\r\n/g, "\n") };
}

function frontMatter(md: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** First "# heading" and first paragraph of a README (markdown stripped). */
function readmeParts(md: string): { title?: string; summary?: string; body: string; bodyAfterSummary: string } {
  const lines = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").split("\n");
  let title: string | undefined;
  let rest = lines;
  const h = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (h >= 0 && lines.slice(0, h).every((l) => !l.trim())) {
    title = lines[h].replace(/^#\s+/, "").trim();
    rest = lines.slice(h + 1);
  }
  const para: string[] = [];
  let paraEnd = 0;
  for (const [i, l] of rest.entries()) {
    if (!l.trim()) {
      if (para.length) break;
      continue;
    }
    if (/^(#|```|[-*+]\s|\d+\.\s|>|\||!\[)/.test(l.trim())) break;
    para.push(l.trim());
    paraEnd = i + 1;
  }
  const summary = para.join(" ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim() || undefined;
  return { title, summary, body: rest.join("\n").trim(), bodyAfterSummary: (summary ? rest.slice(paraEnd) : rest).join("\n").trim() };
}

function requirements(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter((l) => l && !l.startsWith("-"))
    .slice(0, 20);
}

function scanSkill(dir: string, folder: string): ScannedItem {
  const item: ScannedItem = { type: "skill", folder, slug: slugify(folder), body: "", files: [], warnings: [], errors: [] };
  const { files, skipped } = walk(dir);
  for (const s of skipped) item.warnings.push(`已跳过 ${s}`);
  const skillPath = files.find((f) => f.toLowerCase() === "skill.md");
  if (!skillPath) {
    item.errors.push("缺少 SKILL.md");
    return item;
  }
  const md = readText(path.join(dir, skillPath));
  if (!md.text) {
    item.errors.push(`SKILL.md 无法读取：${md.problem}`);
    return item;
  }
  if (md.text.length > LIMITS.maxSkillMdChars) item.errors.push(`SKILL.md 超过 ${LIMITS.maxSkillMdChars} 个字符`);
  item.skillMd = md.text;
  const fm = frontMatter(md.text);
  if (fm.name) item.slug = slugify(fm.name) || item.slug;
  item.title = fm.name || undefined;
  item.summary = fm.description || undefined;
  const readme = files.find((f) => README.test(f));
  if (readme) item.body = readText(path.join(dir, readme)).text?.trim() ?? "";
  item.files = [
    { path: "SKILL.md", size: fs.statSync(path.join(dir, skillPath)).size },
    ...files.filter((f) => f !== skillPath).map((f) => ({ path: f, size: fs.statSync(path.join(dir, f)).size })),
  ].slice(0, 50);
  if (files.length > 50) item.warnings.push(`文件清单只保留前 50 个（共 ${files.length} 个）`);
  return item;
}

function scanModule(dir: string, folder: string): ScannedItem {
  const item: ScannedItem = { type: "module", folder, slug: slugify(folder), body: "", files: [], warnings: [], errors: [] };
  const top = listDir(dir);

  // README (body, title, summary) and diagram live at the module's top level
  const readme = top.find((e) => e.isFile() && README.test(e.name));
  if (readme) {
    const t = readText(path.join(dir, readme.name)).text ?? "";
    const parts = readmeParts(t);
    item.title = parts.title;
    item.summary = parts.summary;
    item.body = parts.body;
    item.bodyAfterSummary = parts.bodyAfterSummary;
  }
  const images = top.filter((e) => e.isFile() && IMAGE.test(e.name));
  const diagram = images.find((e) => DIAGRAM_NAME.test(e.name)) ?? (images.length === 1 ? images[0] : undefined);
  if (diagram) {
    const bytes = fs.readFileSync(path.join(dir, diagram.name));
    if (bytes.length > LIMITS.maxDiagramBytes) item.errors.push(`结构图 ${diagram.name} 超过 2 MB`);
    else item.diagram = { file: diagram.name, bytes };
  } else if (images.length > 1) {
    item.warnings.push(`有 ${images.length} 张图片，无法判断哪张是结构图；请把结构图命名为 diagram.png`);
  }
  for (const svg of top.filter((e) => e.isFile() && /\.svg$/i.test(e.name))) item.warnings.push(`${svg.name}：不支持 SVG 结构图（安全原因），请导出为 PNG`);

  // code root: files/ when present (content/ layout), otherwise the folder itself
  const hasFilesDir = top.some((e) => e.isDirectory() && e.name === "files");
  const root = hasFilesDir ? path.join(dir, "files") : dir;
  const { files, skipped } = walk(root);
  for (const s of skipped) item.warnings.push(`已跳过 ${s}`);
  const isMeta = (f: string) => !hasFilesDir && (README.test(f) || f === diagram?.name || LICENSE_FILE.test(f) || IMAGE.test(f) || /\.svg$/i.test(f) || /^(清单|meta)\.(csv|json)$/i.test(f));
  for (const f of files) {
    if (isMeta(f)) continue;
    const t = readText(path.join(root, f));
    if (!t.text) {
      item.warnings.push(`已跳过 ${f}（${t.problem}）`);
      continue;
    }
    if (t.text.length > LIMITS.maxFileChars) {
      item.errors.push(`${f} 超过 ${LIMITS.maxFileChars} 个字符`);
      continue;
    }
    item.files.push({ path: f, size: Buffer.byteLength(t.text, "utf8"), content: t.text });
  }
  if (!item.files.length) item.errors.push("没有找到代码文件");
  if (item.files.length > LIMITS.maxModuleFiles) item.errors.push(`代码文件 ${item.files.length} 个，最多 ${LIMITS.maxModuleFiles} 个（可删去示例数据、测试等文件）`);

  const names = item.files.map((f) => f.path);
  item.entry = ENTRY_CANDIDATES.find((c) => names.includes(c)) ?? (names.length === 1 ? names[0] : undefined);
  if (!item.entry && names.length) item.warnings.push("无法判断入口文件，请在清单中填写“入口文件”");
  const ext = (item.entry ?? names[0] ?? "").split(".").pop()?.toLowerCase() ?? "";
  item.language = LANG_BY_EXT[ext];
  const req = item.files.find((f) => f.path === "requirements.txt");
  if (req?.content) item.dependencies = requirements(req.content);
  return item;
}

const TYPE_DIRS: Record<string, ItemType> = { skills: "skill", skill: "skill", 技能: "skill", modules: "module", module: "module", 模块: "module" };

export function scanBatch(root: string): { items: ScannedItem[]; problems: string[] } {
  const items: ScannedItem[] = [];
  const problems: string[] = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return { items, problems: [`找不到文件夹 ${root}`] };
  let sawTypeDir = false;
  for (const e of listDir(root)) {
    const type = e.isDirectory() ? TYPE_DIRS[e.name.toLowerCase()] : undefined;
    if (!type) {
      if (e.isDirectory() && !e.name.startsWith(".")) problems.push(`未识别的文件夹“${e.name}”：只处理 skills/（技能）和 modules/（模块）`);
      continue;
    }
    sawTypeDir = true;
    for (const d of listDir(path.join(root, e.name))) {
      if (!d.isDirectory() || d.name.startsWith(".")) continue;
      const dir = path.join(root, e.name, d.name);
      const item = type === "skill" ? scanSkill(dir, d.name) : scanModule(dir, d.name);
      if (/^example-/i.test(d.name)) item.errors.unshift("这是模板里的示例，请删除这个文件夹或换成你自己的内容");
      items.push(item);
    }
  }
  if (!sawTypeDir) problems.push("文件夹里没有 skills/ 或 modules/ 子文件夹（见运维手册第 15 节的目录结构）");
  if (items.length > LIMITS.maxItems) problems.push(`一次最多 ${LIMITS.maxItems} 个资源（当前 ${items.length} 个），请分批上传`);
  return { items, problems };
}
