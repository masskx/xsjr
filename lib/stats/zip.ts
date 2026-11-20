// ZIP packages for Skills and code modules. Pure function over already-authorised content:
// callers must have checked access (members-only modules) and redistribution (index-only skills
// have no stored SKILL.md and are never packaged).
import { strToU8, zipSync, type Zippable } from "fflate";

/** Folder name a skill should be installed under: the SKILL.md `name:` when it is a safe slug. */
export function skillDirName(skillMd: string, slug: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd);
  const name = fm && /^name:\s*["']?([a-z0-9][a-z0-9-]{0,63})["']?\s*$/m.exec(fm[1])?.[1];
  return name || slug;
}

function notice(r: { title: string; license: string; licenseNote?: string; sourceUrl?: string; author: string }, siteUrl: string, path: string): string {
  return [
    r.title,
    `作者：${r.author}`,
    `许可证：${r.license}`,
    r.licenseNote ? `版权说明：${r.licenseNote}` : "",
    r.sourceUrl ? `来源：${r.sourceUrl}` : "",
    `下载自：${siteUrl}${path}`,
    "",
  ]
    .filter((l, i, a) => l !== "" || i === a.length - 1)
    .join("\n");
}

const fixed = { mtime: new Date("2026-01-01T00:00:00Z") };

export function skillZip(r: { slug: string; title: string; license: string; licenseNote?: string; sourceUrl?: string; author: string }, skillMd: string, siteUrl: string): { filename: string; bytes: Uint8Array } {
  const dir = skillDirName(skillMd, r.slug);
  const files: Zippable = { [`${dir}/SKILL.md`]: [strToU8(skillMd), fixed] };
  if (r.sourceUrl || r.licenseNote || r.author !== "平台原创") files[`${dir}/NOTICE.txt`] = [strToU8(notice(r, siteUrl, `/skills/${r.slug}/`)), fixed];
  return { filename: `${dir}.zip`, bytes: zipSync(files, { level: 6 }) };
}

export function moduleZip(
  r: { slug: string; title: string; summary: string; license: string; licenseNote?: string; sourceUrl?: string; author: string; usage?: string[]; env?: string[]; dependencies?: string[] },
  files: { path: string; content: string }[],
  siteUrl: string,
): { filename: string; bytes: Uint8Array } {
  const zf: Zippable = {};
  for (const f of files) zf[`${r.slug}/${f.path}`] = [strToU8(f.content), fixed];
  if (!files.some((f) => /^readme\.md$/i.test(f.path))) {
    const readme = [
      `# ${r.title}`,
      "",
      r.summary,
      "",
      r.env?.length ? `## 环境要求\n\n${r.env.map((e) => `- ${e}`).join("\n")}\n` : "",
      r.dependencies?.length ? `## 依赖\n\n${r.dependencies.map((e) => `- ${e}`).join("\n")}\n` : "",
      r.usage?.length ? `## 用法\n\n${r.usage.map((e) => `- ${e}`).join("\n")}\n` : "",
      `## 许可证\n\n${notice(r, siteUrl, `/modules/${r.slug}/`)}`,
    ]
      .filter(Boolean)
      .join("\n");
    zf[`${r.slug}/README.md`] = [strToU8(readme), fixed];
  }
  return { filename: `${r.slug}.zip`, bytes: zipSync(zf, { level: 6 }) };
}
